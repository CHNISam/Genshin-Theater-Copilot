import copy
import json
from pathlib import Path
import unittest
from src.harness import check, validate, authorize, record, reroute, sync, purchase, next_fight

ROOT = Path(__file__).resolve().parents[1]

def demo():
    return json.loads((ROOT/'templates/demo-run.json').read_text(encoding='utf-8'))

def fail(run, score=40, mechanics_ok=True):
    authorize(run)
    record(run, {'result':'fail','score':score,'seconds':90,'mechanics_ok':mechanics_ok,'reason':'timeout','observation':'fixed-window observation'})


def change(run):
    fight = copy.deepcopy(run['fight']); fight['team'][-1] = 'fallback'
    evidence = {'id':'new','kind':'clear-reference','season_id':'demo','encounter_id':'act-8','objective':'act-8','source':'local:new-clear','reviewed':True,'comparison':'reference uses fallback damage; current flex offers no damage'}
    fight['evidence_ids']=['new']
    return {'fight':fight,'evidence':[evidence], 'review':{'evidence_id':'new','reviewed':True,'bottleneck':'insufficient damage','comparison':evidence['comparison'],'hypothesis':'at 90s progress improves from 40 to 60'}}


class HarnessTests(unittest.TestCase):
    def test_future_safe_and_current_prepared(self):
        r=demo(); self.assertEqual(check(r)['route'],'SAFE'); self.assertNotEqual(check(r)['status'],'BLOCKED')

    def test_failure_stop_is_wired_to_actual_authorization(self):
        r=demo(); fail(r); fail(r,42)
        self.assertEqual(check(r)['route'],'SAFE')
        self.assertIn('REPEATED_NON_CONVERGENCE',check(r)['reasons'])
        before=copy.deepcopy(r)
        with self.assertRaises(ValueError): authorize(r)
        self.assertEqual(r,before)

    def test_measurable_progress_allows_one_more(self):
        r=demo(); fail(r,40); fail(r,55); authorize(r); self.assertIsNotNone(r['pending'])

    def test_rename_and_cosmetic_reroute_are_rejected(self):
        r=demo(); fail(r); fail(r); r['fight']['plan_id']='new-name'
        with self.assertRaises(ValueError): authorize(r)
        pkg=change(r); pkg['fight']['team']=r['fight']['team']
        with self.assertRaises(ValueError): reroute(r,pkg)

    def test_reviewed_changed_plan_bounded_trial_then_pass(self):
        r=demo(); fail(r); fail(r); reroute(r,change(r)); authorize(r)
        record(r,dict(result='pass',score=100,seconds=90,mechanics_ok=True,reason='clear',observation='objective completed'))
        self.assertEqual(len(r['attempts']),3); self.assertEqual(r['vigor']['core'],1)
        self.assertIn('act-8',r['completed']); self.assertIn('ENCOUNTER_COMPLETE',check(r)['reasons'])

    def test_bad_current_mechanic_blocks_even_with_future_safe(self):
        r=demo(); r['fight']['mechanic_actions']['party-drain']['providers']=['shield']
        self.assertEqual(check(r)['route'],'SAFE'); self.assertIn('MECHANIC_UNCOVERED:party-drain',check(r)['reasons'])

    def test_unknown_only_blocks_relevant_fact(self):
        r=demo(); r['season']['facts']['unused']={'status':'unknown','season_id':'demo','sources':[],'value':None}
        self.assertNotEqual(check(r)['status'],'BLOCKED')
        r['season']['facts']['party-drain']['status']='unknown'
        self.assertIn('FACT_UNVERIFIED:party-drain',check(r)['reasons'])

    def test_old_season_evidence_and_unreviewed_reference_block(self):
        r=demo(); r['evidence'][0]['season_id']='2025-12'
        self.assertEqual(check(r)['status'],'BLOCKED')
        r=demo(); r['evidence'][0]['reviewed']=False
        self.assertEqual(check(r)['status'],'BLOCKED')

    def test_duplicates_unrecruited_zero_vigor_rejected(self):
        for mutate in [lambda r:r['fight']['team'].__setitem__(3,'core'),lambda r:r['unlocked'].remove('flex'),lambda r:r['vigor'].__setitem__('core',0)]:
            r=demo(); mutate(r)
            with self.assertRaises(ValueError): authorize(r)

    def test_stale_rotation_or_build_requires_review_not_silent_reset(self):
        r=demo(); fail(r); r['fight']['rotation']='new rotation'
        self.assertIn('UNREVIEWED_PLAN_CHANGE',check(r)['reasons'])
        r=demo(); fail(r); r['capabilities']['core']['build']='changed weapon'
        self.assertIn('UNREVIEWED_PLAN_CHANGE',check(r)['reasons'])

    def test_conditional_future_stays_warning_not_guaranteed(self):
        r=demo(); r['unlocked'].remove('fallback'); r['checkpoints'][0]['options']=[{'name':'future','consumes':{'fallback':1}}]
        self.assertEqual(check(r)['route'],'CONDITIONAL'); self.assertEqual(check(r)['status'],'WARN')

    def test_partial_coverage_cannot_disappear_from_objective(self):
        r=demo(); r['checkpoints']=[]
        with self.assertRaises(ValueError): validate(r)

    def test_purchase_affordability_and_state_updates(self):
        r=demo(); purchase(r,{'kind':'buff','id':'freeze','value':'observed','cost':60}); self.assertEqual(r['flowers'],40)
        with self.assertRaises(ValueError): purchase(r,{'kind':'recruit','id':'fallback','cost':60})
        purchase(r,{'kind':'refresh','cost':0})
        with self.assertRaises(ValueError): purchase(r,{'kind':'refresh','cost':0})

    def test_record_needs_ticket_and_duplicate_record_rejected(self):
        r=demo()
        with self.assertRaises(ValueError): record(r,dict(result='pass'))
        fail(r)
        with self.assertRaises(ValueError): record(r,dict(result='pass'))

    def test_pending_trial_cannot_sync_or_reauthorize(self):
        r=demo(); authorize(r)
        with self.assertRaises(ValueError): sync(r,{'flowers':10})
        with self.assertRaises(ValueError): authorize(r)

    def test_unknown_observation_and_missing_mechanics_not_convergence(self):
        r=demo(); fail(r,score=None); fail(r,score=None)
        self.assertEqual(check(r)['status'],'BLOCKED')
        r=demo(); authorize(r)
        record(r,dict(result='fail',score=80,seconds=90,mechanics_ok=None,reason='unknown',observation='not observed'))
        self.assertIn('MECHANIC_FAILED',check(r)['reasons'])

    def test_new_id_for_same_source_is_not_new_evidence(self):
        r=demo(); fail(r); fail(r); pkg=change(r); pkg['evidence'][0]['source']=r['evidence'][0]['source']
        with self.assertRaises(ValueError): reroute(r,pkg)

    def test_invalid_state_and_no_budget_mutation(self):
        for value in [-1, True, 1.5, '2']:
            r=demo(); r['vigor']['core']=value
            with self.assertRaises(ValueError): validate(r)
        r=demo(); fail(r,40); fail(r,55); fail(r,70); fail(r,85); fail(r,95); fail(r,100)
        with self.assertRaises(ValueError): reroute(r,change(r))

    def test_next_encounter_requires_clear_and_preserves_history(self):
        r=demo()
        f=copy.deepcopy(r['fight']); f['encounter_id']='act-10'; f['mechanic_actions']={'finish':{'capability':'damage','providers':['fallback'],'execution':'damage during window'}}
        with self.assertRaises(ValueError): next_fight(r,f,[])
        authorize(r); record(r,dict(result='pass',score=100,seconds=90,mechanics_ok=True,reason='clear',observation='done'))
        ev=copy.deepcopy(r['evidence'][0]); ev.update(id='final',encounter_id='act-10',objective='act-10',source='local:final')
        f['evidence_ids']=['final']; f['team'][-1]='fallback'; next_fight(r,f,[ev])
        self.assertEqual(len(r['attempts']),1); self.assertEqual(r['checkpoints'],[])
        self.assertNotEqual(check(r)['status'],'BLOCKED')

    def test_clear_reports_completion_without_double_spending(self):
        r=demo(); r['vigor']['flex']=1
        authorize(r); report=record(r,dict(result='pass',score=100,seconds=90,mechanics_ok=True,reason='clear',observation='done'))
        self.assertEqual(report['status'],'COMPLETE')
        self.assertEqual(report['route'],'SAFE')
        with self.assertRaises(ValueError): authorize(r)

    def test_reroute_reference_must_match_encounter_and_be_used(self):
        r=demo(); fail(r); fail(r); package=change(r)
        package['evidence'][0]['encounter_id']='other'; package['fight']['evidence_ids']=['reference']
        with self.assertRaises(ValueError): reroute(r,package)

    def test_build_or_buff_only_reroute_compares_executed_snapshot(self):
        for field in ['buffs','capabilities']:
            r=demo();fail(r);fail(r)
            if field=='buffs':sync(r,{'buffs':{'damage':'observed new damage buff'}})
            else:
                caps=copy.deepcopy(r['capabilities']);caps['core']['build']='new upgraded weapon';sync(r,{'capabilities':caps})
            package=change(r);package['fight']['team']=r['fight']['team'][:]
            reroute(r,package)
            self.assertNotEqual(check(r)['status'],'BLOCKED')
            self.assertEqual(len(r['attempts']),2)

    def test_nested_schema_does_not_accept_substring_tags_or_object_refs(self):
        for mutate in [lambda r:r['capabilities']['healer'].__setitem__('tags','not-party-heal'),lambda r:r['fight'].__setitem__('evidence_ids',{'reference':True})]:
            r=demo();mutate(r)
            with self.assertRaises(ValueError):authorize(r)

    def test_prepare_repairs_only_unexecuted_contract(self):
        from src.harness import prepare
        r=demo();r['fight']['damage']='';self.assertEqual(check(r)['status'],'BLOCKED')
        prepare(r,{'fight':demo()['fight'],'evidence':[]})
        self.assertNotEqual(check(r)['status'],'BLOCKED')
        fail(r)
        before=copy.deepcopy(r)
        with self.assertRaises(ValueError):prepare(r,{'fight':demo()['fight'],'evidence':[]})
        self.assertEqual(r,before)

    def test_fresh_review_fields_must_be_text(self):
        r=demo();fail(r);fail(r);pkg=change(r);pkg['review'].update(bottleneck=None,comparison=[],hypothesis={})
        with self.assertRaises(ValueError):reroute(r,pkg)
