import json
from pathlib import Path
import unittest
from src.fight_guard import convergence
from src.theater_guard import Checkpoint, PlanOption, status_after_use, route_status, RouteStatus
ROOT=Path(__file__).resolve().parents[1]
class HistoryTests(unittest.TestCase):
    def test_real_failure_fixture_reproduces_stop(self):
        case=json.loads((ROOT/'fixtures/history/cases.json').read_text(encoding='utf-8'))[0]
        sim=case['simulation']; attempts=[dict(score=s,seconds=t,mechanics_ok=True,plan_key='same',result='fail',metric={'id':'progress','window_seconds':90}) for s,t in zip(sim['scores'],sim['seconds'])]
        self.assertEqual(convergence(attempts),sim['expect'])
    def test_history_shared_support_double_booking(self):
        p=lambda name:PlanOption.from_mapping(name,{'hydro-trigger':1})
        points={'hydro-trigger':1};stages=[Checkpoint('boss',[p('main')]),Checkpoint('card',[p('same support')])]
        self.assertEqual(route_status(points,stages,set(points),set(points)),RouteStatus.BROKEN)
    def test_history_mechanic_core_cannot_be_exhausted_early(self):
        p=Checkpoint('mechanic-boss',(PlanOption.from_mapping('required reaction',{'flins':1,'aino':1}),))
        self.assertEqual(status_after_use({'flins':1,'aino':1},['flins'],[p],{'flins','aino'},{'flins','aino'}),RouteStatus.BROKEN)
    def test_history_outcomes_do_not_turn_proposals_into_facts(self):
        cases=json.loads((ROOT/'fixtures/history/cases.json').read_text(encoding='utf-8'))
        byid={c['id']:c for c in cases}
        self.assertIn('not proved',byid['weak-dendro-plan-not-validated-fix']['outcome'])
        self.assertIn('not established',byid['older-document-incomplete-final']['outcome'])
        self.assertEqual(len(json.loads((ROOT/'fixtures/history/sources.json').read_text(encoding='utf-8'))['sources']),8)
    def test_history_current_buff_claim_is_not_inherited(self):
        season=json.loads((ROOT/'seasons/2026-10-v7.1.json').read_text(encoding='utf-8'))
        self.assertEqual(season['facts']['freeze-ice-shatter']['status'],'unknown')
    def test_source_urls_are_followable_not_bare_share_ids(self):
        sources=json.loads((ROOT/'fixtures/history/sources.json').read_text(encoding='utf-8'))['sources']
        self.assertTrue(all(s['url'].startswith('https://') for s in sources))
