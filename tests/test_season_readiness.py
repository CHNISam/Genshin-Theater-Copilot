import copy
import json
from datetime import date
from pathlib import Path
import unittest
from src.season_readiness import assess, decision_requirements
from test_production import review
ROOT = Path(__file__).resolve().parents[1]

class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.season = json.loads((ROOT/'seasons/2026-10-v7.1.json').read_text(encoding='utf-8'))
    def report(self, season=None, **kw):
        return assess(season or self.season, today=date(2026,10,8), **kw)
    def test_deleting_a_branch_is_detected_even_if_pack_says_verified(self):
        s=copy.deepcopy(self.season);s['status']='verified'
        s['facts'].pop('freeze-4-2B',None)
        self.assertIn('freeze-4-2B', {g['fact_id'] for g in self.report(s)['public_gaps']})
    def test_old_pack_does_not_pass_as_ready(self):
        s=copy.deepcopy(self.season);s.pop('research',None)
        self.assertTrue(self.report(s)['research_required'])
    def test_fresh_scoped_mechanic_remains_usable_despite_unrelated_gaps(self):
        r=self.report(required=['act-3-mechanic'])
        self.assertTrue(r['research_required']);self.assertTrue(r['decision_ready'])
    def test_unknown_live_objective_is_not_public_research_debt(self):
        r=self.report(required=['act-1-live-objective'])
        self.assertIn('act-1-live-objective',r['live_unknowns'])
        self.assertFalse(r['decision_ready'])
        self.assertNotIn('act-1-live-objective',{g['fact_id'] for g in r['public_gaps']})
    def test_stale_evidence_cannot_be_refreshed_by_changing_capture_date(self):
        s=copy.deepcopy(self.season);s['captured_at']='2026-10-20'
        r=assess(s,required=['act-3-mechanic'],today=date(2026,10,20))
        self.assertFalse(r['decision_ready'])
    def test_unregistered_source_and_wrong_cycle_are_rejected(self):
        for edit in ('url','scope'):
            s=copy.deepcopy(self.season)
            ev=s['facts']['act-3-mechanic']['evidence'][0]
            ev['source' if edit=='url' else 'season_id']='bogus'
            self.assertFalse(self.report(s,required=['act-3-mechanic'])['decision_ready'])
    def test_buff_dependency_includes_parent_and_trigger(self):
        ids=decision_requirements(self.season,buff_ids=['freeze-4-2B'])
        self.assertTrue({'freeze-base','freeze-2-2','freeze-advanced','freeze-4-2B'}<=set(ids))
    def test_empty_and_nested_unknown_values_do_not_count(self):
        s=copy.deepcopy(self.season)
        s['facts']['freeze-base']['value']={'trigger':'freeze','effects':{'crit_damage':None}}
        self.assertFalse(self.report(s,required=['freeze-base'])['decision_ready'])
    def test_snapshot_gap_schedule_is_bounded_and_machine_readable(self):
        r=self.report()
        self.assertEqual(r['next_action'],'RESEARCH_SEASON')
        self.assertTrue(r['public_gaps']);self.assertIn('retry_after',r)
    def test_public_requirement_cannot_be_relabelled_live(self):
        s=copy.deepcopy(self.season);s['facts']['act-3-mechanic']['knowledge_class']='live'
        self.assertFalse(self.report(s,required=['act-3-mechanic'])['decision_ready'])
    def test_known_fragment_does_not_validate_missing_trigger_or_limits(self):
        r=self.report(required=['freeze-base'])
        self.assertFalse(r['decision_ready'])
        self.assertEqual(r['decision_blockers'][0]['reason'],'INCOMPLETE_VALUE')
    def test_cycle_identity_and_inventory_must_match_pack(self):
        s=copy.deepcopy(self.season);s['facts']['season-identity']['value']['allowed_elements']=['pyro']
        self.assertFalse(self.report(s,required=['season-identity'])['decision_ready'])
    def test_retry_cannot_suppress_daily_or_stale_research(self):
        s=copy.deepcopy(self.season);s['research']['retry_after']='2099-01-01'
        self.assertTrue(assess(s,today=date(2026,10,9))['research_due'])
    def test_live_trial_rejects_public_gap_but_allows_common_mechanic(self):
        from unittest.mock import patch
        from src import harness
        r=json.loads((ROOT/'templates/demo-run.json').read_text(encoding='utf-8'))
        r['mode']='live';r['season']=copy.deepcopy(self.season)
        f=r['fight'];f['mechanic_actions']={'act-8-mechanic':{'capability':'cryo-shield-break-with-airborne-plan','providers':['healer'],'execution':'synthetic test shield + airborne handling'}}
        r['capabilities']['healer']['tags'].append('cryo-shield-break-with-airborne-plan')
        for e in r['evidence']:e['season_id']=self.season['id']
        review(r)
        with patch('src.harness.date') as clock:
            clock.today.return_value=date(2026,10,8);clock.fromisoformat.side_effect=date.fromisoformat
            self.assertNotEqual(harness.check(r)['status'],'BLOCKED')
            # An effect used as a premise is checked even when acquisition omitted details.
            r['buffs']['freeze-base']='observed acquisition; trigger not confirmed'
            r['fight']['buff_fact_ids']=['freeze-base'];review(r)
            with self.assertRaisesRegex(ValueError,'SEASON_RESEARCH_REQUIRED'):harness.authorize(r)
            self.assertIsNone(r['pending'])
            r['buffs'].clear();r['fight']['buff_fact_ids']=[];review(r)
            r['season']['facts']['act-8-mechanic']['evidence'][0]['season_id']='2025-10'
            with self.assertRaisesRegex(ValueError,'SOURCE_CYCLE_MISMATCH'):harness.authorize(r)
            # Same-season research refresh repairs evidence without changing budgets.
            harness.refresh_season(r,self.season)
            harness.authorize(r);self.assertIsNotNone(r['pending'])
    def test_restore_preflight_rechecks_current_dates(self):
        from unittest.mock import patch
        from src import agent_state
        snap=agent_state.intake('test','live','test-code',{'kind':'unknown','source':'local:test','text':'synthetic intake'},['actual account'],'research')
        with patch('src.season_readiness.date') as clock:
            clock.today.return_value=date(2026,10,20);clock.fromisoformat.side_effect=date.fromisoformat
            self.assertTrue(agent_state.research_status(snap,self.season)['research_due'])
    def test_next_month_inventory_is_derived_not_hardcoded_to_october(self):
        from src.season_readiness import requirements
        s=copy.deepcopy(self.season);s['allowed_elements']=['pyro','hydro','anemo']
        self.assertIn('pyro-swirl-4-2B',requirements(s))
        self.assertIn('vaporize-base',requirements(s))
        self.assertNotIn('freeze-base',requirements(s))
    def test_price_table_requires_all_four_levels_and_modifier_rules(self):
        s=copy.deepcopy(self.season)
        f=copy.deepcopy(s['facts']['act-3-mechanic']);f['value']={'1':100}
        f.pop('encounter_id');f.pop('any_of');s['facts']['freeze-costs']=f
        self.assertFalse(self.report(s,required=['freeze-costs'])['decision_ready'])
        f['value']={'1':100,'2':100,'3':100,'4':100,'modifiers':'synthetic explicit no-modifier test policy'}
        self.assertTrue(self.report(s,required=['freeze-costs'])['decision_ready'])
    def test_acquired_branch_deletion_does_not_remove_guard_dependency(self):
        from unittest.mock import patch
        from src import harness
        r=json.loads((ROOT/'templates/demo-run.json').read_text(encoding='utf-8'));r['mode']='live';r['season']=copy.deepcopy(self.season)
        r['fight']['mechanic_actions']={'act-8-mechanic':{'capability':'cryo-shield-break-with-airborne-plan','providers':['healer'],'execution':'synthetic shield + flight'}}
        r['capabilities']['healer']['tags'].append('cryo-shield-break-with-airborne-plan')
        for e in r['evidence']:e['season_id']=self.season['id']
        review(r)
        r['buffs']['freeze-base']='synthetic acquired';r['fight']['buff_fact_ids']=['freeze-base'];review(r);r['season']['facts'].pop('freeze-base')
        with patch('src.harness.date') as clock:
            clock.today.return_value=date(2026,10,8);clock.fromisoformat.side_effect=date.fromisoformat
            with self.assertRaisesRegex(ValueError,'freeze-base:MISSING'):harness.authorize(r)
