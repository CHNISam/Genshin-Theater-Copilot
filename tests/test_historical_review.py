import json
import tempfile
import unittest
from pathlib import Path

class HistoricalReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.plan={'month':'2024-07','mode':'retrospective_reconstruction',
                   'expert_exposure':False,'knowledge_cutoff':'2024-07-31',
                   'generated_at':'2026-10-10','resources':{'a':{'known_since':'2024-01-01'}},
                   'sources':{'facts':{'url':'https://example.org/facts','published_at':None}},
                   'decisions':{'reserve':'fire for final'},'gaps':['No contemporary snapshot']}
        self.path=self.root/'plan.json';self.frozen=self.root/'freeze.json'
    def tearDown(self):self.tmp.cleanup()
    def freeze(self):
        from src.historical_review import freeze_plan
        self.path.write_text(json.dumps(self.plan));return freeze_plan(self.path,self.frozen)
    def test_original_result_can_be_frozen_and_inspected(self):
        result=self.freeze()
        self.assertFalse(result['contemporaneous_blind_validated'])
        self.assertEqual(result['plan']['decisions'],self.plan['decisions'])
    def test_already_exposed_result_cannot_be_called_independent(self):
        self.plan['expert_exposure']=True
        with self.assertRaisesRegex(ValueError,'exposure'):self.freeze()
    def test_future_character_is_rejected(self):
        self.plan['resources']['a']['known_since']='2025-01-01'
        with self.assertRaisesRegex(ValueError,'future'):self.freeze()
    def test_actual_contemporary_claim_requires_snapshot_and_source_date(self):
        self.plan['mode']='contemporaneous_blind'
        with self.assertRaisesRegex(ValueError,'contemporary'):self.freeze()
    def test_frozen_result_cannot_be_overwritten(self):
        self.freeze();self.plan['decisions']['reserve']='change after expert'
        with self.assertRaises(FileExistsError):self.freeze()
    def test_comparison_detects_modified_freeze(self):
        from src.historical_review import comparison_errors
        frozen=self.freeze();frozen['plan']['decisions']['reserve']='copied'
        self.assertTrue(any('hash' in s for s in comparison_errors(frozen,{})))
    def test_difference_requires_classification_evidence_and_resolution(self):
        from src.historical_review import comparison_errors
        frozen=self.freeze()
        comparison={'plan_sha256':frozen['plan_sha256'],'sources':{'expert':{'url':'https://example.org/expert'}},
                    'differences':[{'dimension':'resources','classification':'condition_difference',
                     'evidence_ids':['expert'],'reason':'Different owned roster','action':'Keep route conditional'}]}
        self.assertEqual(comparison_errors(frozen,comparison),[])
        comparison['differences'][0]['classification']='matches'
        self.assertTrue(comparison_errors(frozen,comparison))
    def test_unsupported_evidence_cannot_resolve_difference(self):
        from src.historical_review import comparison_errors
        frozen=self.freeze()
        self.assertTrue(comparison_errors(frozen,{'plan_sha256':frozen['plan_sha256'],
            'sources':{},'differences':[{'dimension':'mechanic','classification':'decision_error',
            'reason':'expert says so','action':'copy','evidence_ids':['missing']}]}))

    def test_undated_source_from_later_month_is_rejected(self):
        self.plan['sources']['facts']['historical_month']='2026-10'
        with self.assertRaisesRegex(ValueError,'scope'):self.freeze()
    def test_empty_comparison_source_is_rejected(self):
        from src.historical_review import comparison_errors
        frozen=self.freeze()
        self.assertTrue(comparison_errors(frozen,{'plan_sha256':frozen['plan_sha256'],
            'sources':{'expert':{}},'differences':[{'dimension':'team','classification':'decision_error',
            'evidence_ids':['expert'],'reason':'changed','action':'repair'}]}))
    def test_fact_packet_is_bound_at_freeze(self):
        packet=self.root/'facts.json';packet.write_text(json.dumps({'month':'2024-07'}))
        self.plan['sources']['facts']['path']=str(packet)
        result=self.freeze()
        self.assertIn('facts',result['input_sha256'])
