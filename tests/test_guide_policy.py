"""Reject plausible-looking guides that violate version or execution mechanics."""
import copy
import json
from pathlib import Path
import unittest

class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.guide = json.loads((Path(__file__).resolve().parents[1]/'guides/2026-10.json').read_text())
    def review(self):
        from src.guide_policy import strategy_errors
        return strategy_errors(self.guide)
    def test_named_or_role_witness_does_not_claim_guaranteed_recruitment(self):
        self.assertEqual(self.review(),[])
        self.guide['strategy']['mode']='guaranteed'
        self.assertIn('recruitment witness must remain conditional',self.review())
    def test_lunar_entry_cannot_use_visionary_minimum(self):
        self.guide['strategy']['entry_requirement']=22
        self.assertTrue(any('entry' in x for x in self.review()))
    def test_party_healer_must_actually_be_in_card_team(self):
        self.guide['strategy']['requirements'][0]['providers']=['barbara']
        self.assertTrue(any('capability' in x for x in self.review()))
    def test_vv_off_field_cannot_initiate_shred(self):
        self.guide['strategy']['vv_rotations'][0]['on_field']=False
        self.assertTrue(any('on-field' in x for x in self.review()))
    def test_vv_provider_must_be_equipped_and_present(self):
        self.guide['resources']['sucrose']['capabilities']=[]
        self.assertTrue(any('vv4' in x for x in self.review()))
    def test_old_month_cannot_inherit_ten_acts_and_cards(self):
        self.guide['season_id']='2024-07'
        self.assertTrue(any('historical target' in x for x in self.review()))
    def test_visionary_month_has_no_cards(self):
        self.guide['season_id']='2025-09'
        self.assertTrue(any('historical target' in x for x in self.review()))
    def test_sacred_challenge_not_available_before_threshold(self):
        row=self.guide['rows'].pop(9)
        self.guide['rows'].insert(0,row)
        self.assertTrue(any('unlock' in x for x in self.review()))
    def test_opening_character_not_borrowable(self):
        self.guide['opening_characters']=['wriothesley']
        self.guide['borrowed_character_id']='wriothesley'
        self.assertTrue(any('opening' in x for x in self.review()))
    def test_twelve_battles_require_forty_eight_total_vigor(self):
        from src.guide_policy import route_summary
        self.assertEqual(route_summary(self.guide)['total_vigor'],48)
    def test_malformed_strategy_fails_closed(self):
        self.guide['strategy']['requirements']=[None]
        self.assertTrue(self.review())

    def test_deleting_requirements_cannot_skip_sustain_review(self):
        self.guide['strategy']['requirements']=[]
        self.assertTrue(self.review())
    def test_deleting_rotations_cannot_skip_vv_review(self):
        self.guide['strategy']['vv_rotations']=[]
        self.assertTrue(self.review())
    def test_malformed_row_reference_returns_error(self):
        self.guide['strategy']['requirements'][0]['row']=[]
        self.assertTrue(self.review())

    def test_null_capability_list_fails_closed(self):
        self.guide['resources']['sayu']['capabilities']=None
        self.assertTrue(self.review())

    def test_null_required_capability_contract_fails_closed(self):
        self.guide['rows'][0]['required_capabilities']=None
        self.assertTrue(self.review())
