"""Production boundary regressions; all account/attempt inputs here are synthetic."""
import copy
import json
from pathlib import Path
import unittest
from src import harness, agent_state as state
from src.execution_review import basis_key
ROOT=Path(__file__).resolve().parents[1]

def live():
    r=json.loads((ROOT/'templates/demo-run.json').read_text(encoding='utf-8'))
    r['mode']='live';r['season']=json.loads((ROOT/'seasons/2026-10-v7.1.json').read_text(encoding='utf-8'))
    r['fight']['mechanic_actions']={'act-8-mechanic':{'capability':'cryo-shield-break-with-airborne-plan','providers':['healer'],'execution':'synthetic shield and flight plan'}}
    r['capabilities']['healer']['tags'].append('cryo-shield-break-with-airborne-plan')
    for e in r['evidence']: e['season_id']=r['season']['id']
    return r

def review(r, verdict='bounded-probe'):
    r['evidence'][0]['observation']={'outcome':'guide-proposal','locator':'synthetic test paragraph','account':'synthetic build difference; clear not observed'}
    r['fight']['execution_review']={'basis_key':basis_key(r), 'evidence_id':'reference','verdict':verdict,
        'damage':'uncertain','sustain':'supported','execution':'supported','comparison':'synthetic damage difference requires measurement',
        'fallback':'stop after bounded measurement; retain fallback for next objective'}
    return r

class ProductionTests(unittest.TestCase):
    def test_reviewed_boolean_and_vague_contract_do_not_prove_account_readiness(self):
        r=live()
        self.assertIn('EXECUTION_REVIEW_REQUIRED',harness.check(r)['reasons'])
        with self.assertRaises(ValueError):harness.authorize(r)
    def test_bounded_probe_does_not_claim_clear_and_unrelated_debt_does_not_loop(self):
        r=review(live());report=harness.check(r)
        self.assertNotEqual(report['status'],'BLOCKED')
        self.assertEqual(report['execution_basis'],'bounded-probe')
        self.assertEqual(report['next_action'],'ONE_PREPARED_TRIAL')
    def test_insufficient_damage_and_stale_account_review_block(self):
        r=review(live());r['fight']['execution_review']['damage']='insufficient'
        with self.assertRaisesRegex(ValueError,'ACCOUNT_EXECUTION_INSUFFICIENT'):harness.authorize(r)
        r=review(live());r['capabilities']['core']['build']='changed synthetic weapon'
        self.assertIn('EXECUTION_REVIEW_STALE',harness.check(r)['reasons'])
    def test_changed_damage_evidence_or_goal_invalidates_review(self):
        for field in ('damage','metric'):
            r=review(live());r['fight'][field]='changed' if field=='damage' else {'id':'new-goal','window_seconds':90}
            self.assertIn('EXECUTION_REVIEW_STALE',harness.check(r)['reasons'])
        r=review(live());r['evidence'][0]['observation']['account']='changed account comparison'
        self.assertIn('EXECUTION_REVIEW_STALE',harness.check(r)['reasons'])

    def test_related_season_refresh_invalidates_account_review(self):
        r=review(live());pack=copy.deepcopy(r['season'])
        pack['facts']['act-8-mechanic']['value']='synthetic changed relevant phase'
        harness.refresh_season(r,pack)
        self.assertIn('EXECUTION_REVIEW_STALE',harness.check(r)['reasons'])
        r=review(live());pack=copy.deepcopy(r['season']);pack['facts']['ordinary-encounter-pool']['value']='unrelated partial research'
        harness.refresh_season(r,pack)
        self.assertNotIn('EXECUTION_REVIEW_STALE',harness.check(r)['reasons'])
    def test_capable_route_random_recruitment_is_not_hidden_by_resource_safe(self):
        r=review(live());r['unlocked'].remove('fallback')
        options=r['checkpoints'][0]['options']
        options[0]['capability_review']={'status':'insufficient','source':'local:test','comparison':'synthetic weak core'}
        options[1]['capability_review']={'status':'supported','source':'local:test','comparison':'synthetic adequate fallback but unowned'}
        report=harness.check(r)
        self.assertEqual(report['route'],'SAFE')
        self.assertEqual(report['capability_route'],'CONDITIONAL')
        self.assertIn('FUTURE_REQUIRES_RANDOM_RECRUITMENT',report['warnings'])

    def test_live_unknown_requests_observation_not_public_research(self):
        r=live();r['season']['facts']['live-choice']={'status':'unknown','knowledge_class':'live','season_id':r['season']['id'],'value':None,'sources':[]}
        r['fight']['buff_fact_ids']=['live-choice'];review(r)
        self.assertEqual(harness.check(r)['next_action'],'OBSERVE_CURRENT_STATE')
    def test_active_research_status_separates_full_debt_from_current_ready(self):
        r=review(live());snap=state.intake(r['run_id'],'live','test',{'kind':'observed','source':'local:test','text':'synthetic'},[],'prepare')
        snap=state.activate(snap,r);report=state.research_status(snap)
        self.assertTrue(report['research_required']);self.assertTrue(report['decision_ready'])

    def test_guide_proposal_is_not_a_success_reference(self):
        r=review(live(),'supported')
        self.assertIn('SUCCESS_EVIDENCE_REQUIRED',harness.check(r)['reasons'])
    def test_future_known_incapable_option_is_not_resource_safe_execution(self):
        r=review(live())
        for o in r['checkpoints'][0]['options']:
            o['capability_review']={'status':'insufficient','source':'local:synthetic','comparison':'synthetic damage too low'}
        report=harness.check(r)
        self.assertEqual(report['route'],'SAFE')
        self.assertEqual(report['capability_route'],'BROKEN')
        with self.assertRaisesRegex(ValueError,'FUTURE_CAPABILITY_ROUTE_BROKEN'):harness.authorize(r)
    def test_final_checkpoint_cannot_end_run_before_required_cards(self):
        r=review(live());r['objective']+=['card-1','card-2']
        r['checkpoints'] += [{'id':c,'options':[{'name':'test','consumes':{'fallback':1}}]} for c in ('card-1','card-2')]
        r['fight']['encounter_id']='act-10';r['checkpoints'][0]['id']='act-8'
        self.assertIn('FINISH_WOULD_SKIP_REQUIRED_CARDS',harness.check(r)['reasons'])
    def test_early_failure_cannot_claim_full_window_score(self):
        r=json.loads((ROOT/'templates/demo-run.json').read_text(encoding='utf-8'));harness.authorize(r)
        with self.assertRaisesRegex(ValueError,'window'):
            harness.record(r,{'result':'fail','score':80,'seconds':20,'mechanics_ok':True,'reason':'death','observation':'synthetic died at 20 seconds'})
        self.assertIsNotNone(r['pending'])

    def test_pending_resume_takes_priority_over_research(self):
        r=review(live());harness.authorize(r)
        snap=state.intake(r['run_id'],'live','test',{'kind':'observed','source':'local:test','text':'synthetic'},[],'prepare')
        snap=state.activate(snap,r)
        self.assertEqual(snap['next_action'],'RECORD_PENDING_RESULT')
    def test_owned_unknown_buff_not_relied_on_does_not_block_proven_mechanics(self):
        r=review(live());r['buffs']['freeze-base']='synthetic acquired but not relied on';review(r)
        self.assertNotEqual(harness.check(r)['status'],'BLOCKED')
        r['fight']['buff_fact_ids']=['freeze-base'];review(r)
        with self.assertRaisesRegex(ValueError,'freeze-base'):harness.authorize(r)

if __name__=='__main__':unittest.main()
