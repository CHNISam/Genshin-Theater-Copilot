import copy
import unittest
from src import agent_state as state
from src import session

def snapshot():
    return state.intake('session-test','demo','test-ref',{'kind':'observed','source':'local:synthetic','text':'test intake'},['roster'],'request roster')

class SessionTests(unittest.TestCase):
    def test_discovery_verifies_header_and_selects_only_live_when_requested(self):
        row=state.checkpoint(snapshot())
        self.assertEqual(session.discover([state.HEADERS,row],mode='live'),[])
        self.assertEqual(session.discover([state.HEADERS,row])[0]['run_id'],'session-test')
        with self.assertRaises(ValueError):session.discover([['wrong'],row])
    def test_save_retry_returns_same_commit_and_conflicting_head_rejects(self):
        snap=snapshot();rows=[state.HEADERS];row=session.prepare_save(snap,rows,None,summary='start')
        self.assertEqual(session.confirm_save([state.HEADERS,row],row)['revision'],1)
        self.assertEqual(session.prepare_save(snap,[state.HEADERS,row],None,retry_row=row),row)
        head=state.restore([row],snap['run_id'])
        new=state.observe(snap,{'kind':'observed','source':'local:synthetic','text':'new'})
        stale=session.prepare_save(new,[state.HEADERS,row],head)
        fork=state.checkpoint(state.observe(snap,{'kind':'observed','source':'local:synthetic','text':'other writer'}),head)
        with self.assertRaisesRegex(ValueError,'head changed'):session.prepare_save(new,[state.HEADERS,row,fork],head,retry_row=stale)
    def test_code_migration_is_explicit_and_keeps_history(self):
        snap=snapshot();row=state.checkpoint(snap);head=state.restore([row],snap['run_id'])
        upgraded=state.migrate_code(snap,'new-ref','reviewed current guard; intake has no attempts')
        saved=state.checkpoint(upgraded,head)
        recovered=state.restore([row,saved],snap['run_id'])['snapshot']
        self.assertEqual(recovered['code_ref'],'new-ref')
        self.assertEqual(recovered['observations'][0],snap['observations'][0])
        bad=copy.deepcopy(snap);bad['code_ref']='new-ref'
        with self.assertRaises(ValueError):state.checkpoint(bad,head)

    def test_incomplete_readback_never_claims_saved(self):
        row=state.checkpoint(snapshot())
        with self.assertRaises(ValueError):session.confirm_save([state.HEADERS],row)
    def test_pages_reject_nonliteral_formula_or_truncated_chain(self):
        cells={'userEnteredValue':{'formulaValue':'=x'},'formattedValue':'x'}
        with self.assertRaises(ValueError):session.cell_rows([[cells]])
        row=state.checkpoint(snapshot());head=state.restore([row],'session-test')
        child=state.checkpoint(head['snapshot'],head)
        with self.assertRaises(ValueError):session.discover([state.HEADERS,child])
