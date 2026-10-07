import copy
import json
from pathlib import Path
import unittest
from src.harness import validate_season
ROOT=Path(__file__).resolve().parents[1]
class SeasonTests(unittest.TestCase):
    def test_current_season_pack_valid_without_faking_unknowns(self):
        season=json.loads((ROOT/'seasons/2026-10-v7.1.json').read_text(encoding='utf-8'));validate_season(season)
        self.assertEqual(len(season['encounters']),12)
        self.assertEqual(season['facts']['act-8-mechanic']['status'],'guide_supported')
    def test_source_less_claim_and_cross_season_are_rejected(self):
        base=json.loads((ROOT/'seasons/2026-10-v7.1.json').read_text(encoding='utf-8'))
        for mutate in [lambda f:f.update(status='verified',value='old text',sources=[]),lambda f:f.update(season_id='2025-12')]:
            season=copy.deepcopy(base);mutate(season['facts']['freeze-base'])
            with self.assertRaises(ValueError):validate_season(season)
