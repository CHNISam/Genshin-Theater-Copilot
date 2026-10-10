import unittest
from src.guide_policy import rotation_errors

class RotationPolicyTests(unittest.TestCase):
    def test_burst_damage_cannot_drive_normal_damage_proc(self):
        self.assertTrue(rotation_errors({'rotation_links':[{'trigger_requirement':'normal_or_charged_damage','driver_damage':'burst'}]}))
    def test_normal_damage_driver_passes(self):
        self.assertEqual(rotation_errors({'rotation_links':[{'trigger_requirement':'normal_or_charged_damage','driver_damage':'normal'}]}),[])
    def test_separate_normal_window_is_valid_fallback(self):
        self.assertEqual(rotation_errors({'rotation_links':[{'trigger_requirement':'normal_or_charged_damage','driver_damage':'normal','separate_burst_window':True}]}),[])

    def test_2025_october_hydro_driver_remains_allowed(self):
        import json
        from pathlib import Path
        root=Path(__file__).resolve().parents[1]
        facts=json.loads((root/'seasons/history/2025-10.json').read_text())['facts']
        self.assertIn('水',facts['elements']);self.assertIn('雷',facts['elements'])
        self.assertEqual(rotation_errors({'rotation_links':[{'provider':'beidou','driver':'kokomi',
          'trigger_requirement':'normal_or_charged_damage','driver_damage':'normal'}]}),[])
