import copy
import json
from pathlib import Path
import unittest
from src import agent_state as state

ROOT = Path(__file__).resolve().parents[1]


def intake():
    return state.intake('test-run', 'demo', 'test-ref',
                        {'kind': 'observed', 'source': 'local:synthetic', 'text': 'synthetic intake'},
                        ['current roster'], 'request current roster')


def active():
    run = json.loads((ROOT / 'templates/demo-run.json').read_text(encoding='utf-8'))
    run['run_id'] = 'test-run'
    return state.activate(intake(), run)


def fail(snapshot):
    snapshot, _ = state.act(snapshot, 'authorize')
    return state.act(snapshot, 'record', {'result': 'fail', 'score': 40, 'seconds': 90,
        'mechanics_ok': True, 'reason': 'timeout', 'observation': 'synthetic fixed-window result'})[0]


class AgentStateTests(unittest.TestCase):
    def test_intake_roundtrip_keeps_unknowns_without_inventing_roster(self):
        original = intake()
        row = state.checkpoint(original, summary='intake')
        recovered = state.restore([row], 'test-run')['snapshot']
        self.assertEqual(recovered, original)
        self.assertIsNone(recovered['harness'])
        with self.assertRaises(ValueError): state.act(recovered, 'authorize')

    def test_live_cannot_import_demo_as_verified_run(self):
        snapshot = intake(); snapshot['mode'] = 'live'
        with self.assertRaises(ValueError): state.activate(snapshot, active()['harness'])

    def test_restore_preserves_pending_and_prevents_second_trial(self):
        snapshot, _ = state.act(active(), 'authorize')
        recovered = state.restore([state.checkpoint(snapshot)], 'test-run')['snapshot']
        self.assertIsNotNone(recovered['harness']['pending'])
        with self.assertRaises(ValueError): state.act(recovered, 'authorize')
        with self.assertRaises(ValueError): state.act(recovered, 'sync', {'flowers': 2})

    def test_restore_preserves_stop_and_rejects_third_flat_trial(self):
        snapshot = fail(fail(active()))
        recovered = state.restore([state.checkpoint(snapshot)], 'test-run')['snapshot']
        with self.assertRaisesRegex(ValueError, 'REPEATED_NON_CONVERGENCE'):
            state.act(recovered, 'authorize')
        self.assertEqual(len(recovered['harness']['attempts']), 2)

    def test_resource_purchase_and_checkpoint_keep_real_effect(self):
        snapshot, _ = state.act(active(), 'purchase', {'kind':'buff','id':'x','value':'observed','cost':60})
        recovered = state.restore([state.checkpoint(snapshot)], 'test-run')['snapshot']
        self.assertEqual(recovered['harness']['flowers'], 40)
        before = copy.deepcopy(recovered)
        with self.assertRaises(ValueError): state.act(recovered, 'purchase', {'kind':'buff','id':'y','value':'observed','cost':60})
        self.assertEqual(recovered, before)

    def test_clear_is_recorded_once_after_resume(self):
        snapshot, _ = state.act(active(), 'authorize')
        snapshot, report = state.act(snapshot, 'record', {'result':'pass','score':100,'seconds':90,
            'mechanics_ok':True,'reason':'clear','observation':'synthetic objective completed'})
        self.assertEqual(report['status'], 'COMPLETE')
        recovered = state.restore([state.checkpoint(snapshot)], 'test-run')['snapshot']
        self.assertEqual(recovered['harness']['vigor']['core'], 1)
        with self.assertRaises(ValueError): state.act(recovered, 'record', {'result':'pass'})
        with self.assertRaises(ValueError): state.activate(recovered, active()['harness'])

    def test_duplicate_delivery_is_idempotent_but_fork_blocks(self):
        root = state.checkpoint(intake()); parent = state.restore([root], 'test-run')
        left = state.checkpoint(state.observe(parent['snapshot'], {'kind':'observed','source':'local:a','text':'a'}), parent)
        right = state.checkpoint(state.observe(parent['snapshot'], {'kind':'observed','source':'local:b','text':'b'}), parent)
        self.assertEqual(state.restore([root, left, left], 'test-run')['revision'], 2)
        with self.assertRaisesRegex(ValueError, 'conflict'): state.restore([root, left, right], 'test-run')

    def test_corrupt_payload_and_metadata_are_rejected(self):
        row = state.checkpoint(active()); row[8] = row[8].replace('synthetic intake', 'tampered intake')
        with self.assertRaises(ValueError): state.restore([row], 'test-run')
        row = state.checkpoint(active()); row[5] = 'live'
        with self.assertRaises(ValueError): state.restore([row], 'test-run')

    def test_missing_parent_and_unknown_run_are_not_latest_state(self):
        root = state.checkpoint(intake()); parent = state.restore([root], 'test-run')
        child = state.checkpoint(parent['snapshot'], parent)
        with self.assertRaises(ValueError): state.restore([child], 'test-run')
        with self.assertRaises(ValueError): state.restore([root], 'missing')

    def test_unicode_chunks_preserve_long_observation_and_have_bounded_size(self):
        snapshot = state.observe(intake(), {'kind':'observed','source':'local:long','text':'中文🎹' * 12000})
        row = state.checkpoint(snapshot)
        self.assertGreater(len([x for x in row[8:] if x]), 1)
        self.assertTrue(all(len(x.encode('utf-16-le'))//2 <= 30000 for x in row[8:]))
        self.assertEqual(state.restore([row], 'test-run')['snapshot'], snapshot)
        with self.assertRaisesRegex(ValueError, 'capacity'):
            state.checkpoint(state.observe(intake(), {'kind':'observed','source':'local:huge','text':'x' * 250000}))

    def test_observed_proposed_unknown_are_distinct_and_run_identity_fixed(self):
        snapshot = state.observe(intake(), {'kind':'proposed','source':'local:agent','text':'consider buff'})
        self.assertEqual(snapshot['observations'][-1]['kind'], 'proposed')
        with self.assertRaises(ValueError): state.observe(snapshot, {'kind':'verified','source':'local:x','text':'x'})
        parent = state.restore([state.checkpoint(snapshot)], 'test-run')
        snapshot['run_id'] = 'other'
        with self.assertRaises(ValueError): state.checkpoint(snapshot, parent)

    def test_requests_write_literals_not_formulas_and_append_only(self):
        row = state.checkpoint(intake(), summary='=malicious formula')
        request = state.append_request(123, row)
        cells = request['appendCells']['rows'][0]['values']
        self.assertEqual(cells[7]['userEnteredValue'], {'stringValue':'=malicious formula'})
        self.assertNotIn('updateCells', request)

    def test_checkpoint_cannot_discard_pending_or_erase_failure_history(self):
        snapshot, _ = state.act(active(), 'authorize')
        parent = state.restore([state.checkpoint(snapshot)], 'test-run')
        canceled = copy.deepcopy(snapshot); canceled['harness']['pending'] = None
        with self.assertRaises(ValueError): state.checkpoint(canceled, parent)
        snapshot = fail(active()); parent = state.restore([state.checkpoint(snapshot)], 'test-run')
        erased = copy.deepcopy(snapshot); erased['harness']['attempts'] = []
        with self.assertRaises(ValueError): state.checkpoint(erased, parent)

    def test_pending_to_actual_record_is_valid_successor(self):
        snapshot, _ = state.act(active(), 'authorize')
        root = state.checkpoint(snapshot)
        parent = state.restore([root], 'test-run')
        after, _ = state.act(snapshot, 'record', {'result':'pass','score':100,'seconds':90,
            'mechanics_ok':True,'reason':'clear','observation':'synthetic completion'})
        row = state.checkpoint(after, parent)
        self.assertEqual(state.restore([root, row], 'test-run')['revision'], 2)

    def test_same_season_evidence_refresh_preserves_attempts_and_budget(self):
        snapshot = fail(fail(active()))
        root = state.checkpoint(snapshot); parent = state.restore([root], 'test-run')
        season = copy.deepcopy(snapshot['harness']['season'])
        season['facts']['new-fact'] = {'status':'unknown','season_id':'demo','sources':[],'value':None}
        after, report = state.act(snapshot, 'refresh_season', season)
        self.assertEqual(len(after['harness']['attempts']), 2)
        self.assertIn('REPEATED_NON_CONVERGENCE', report['reasons'])
        row = state.checkpoint(after, parent)
        self.assertEqual(state.restore([root, row], 'test-run')['revision'], 2)
        season['id'] = 'next-season'
        with self.assertRaises(ValueError): state.act(after, 'refresh_season', season)
        pending, _ = state.act(active(), 'authorize')
        with self.assertRaises(ValueError): state.act(pending, 'refresh_season', pending['harness']['season'])

    def test_corrupt_run_id_cell_cannot_hide_latest_pending_checkpoint(self):
        snapshot = active(); root = state.checkpoint(snapshot)
        parent = state.restore([root], 'test-run')
        snapshot, _ = state.act(snapshot, 'authorize')
        pending = state.checkpoint(snapshot, parent); pending[1] = 'other-run'
        with self.assertRaisesRegex(ValueError, 'metadata mismatch'):
            state.restore([root, pending], 'test-run')
