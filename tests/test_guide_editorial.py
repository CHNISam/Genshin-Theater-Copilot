"""Production regressions: terse prose cannot hide a missing mechanic/evidence."""
import copy
import json
import unittest
from pathlib import Path
from src.season_guide import validate_guide, load_guide

ROOT = Path(__file__).resolve().parents[1]

class EditorialTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT/'guides/2026-10.json').read_text())
    def errors(self):
        return validate_guide(self.data, ROOT/'guides')
    def test_current_reviewed_guide_passes(self):
        self.assertEqual(self.errors(), [])
    def test_surface_engineering_prose_rejected(self):
        self.data['rows'][1]['team'] = '琴未到需重算耐力；默认路线校验通过'
        self.assertTrue(any('editorial' in e for e in self.errors()))
    def test_verbose_player_cell_rejected(self):
        self.data['rows'][0]['after'] = '这是很长的解释。'*20
        self.assertTrue(any('editorial' in e for e in self.errors()))
    def test_display_cannot_hide_required_roles_behind_valid_slots(self):
        for encounter,team in [('card-1','瑞希＋冰主＋盾辅＋挂件'),
                               ('act-6','丝柯克＋水＋冰＋奶妈'),
                               ('act-10','好友大哥＋2挂件＋奶妈'),
                               ('act-3','龙王＋水系充电宝＋茜特菈莉＋风角色')]:
            d=copy.deepcopy(self.data)
            next(r for r in d['rows'] if r['id']==encounter)['team']=team
            self.assertTrue(any('player team role' in e for e in validate_guide(d,ROOT/'guides')))
    def test_explicit_party_heal_wording_fallback_passes(self):
        next(r for r in self.data['rows'] if r['id']=='card-1')['team']='瑞希＋冰主＋全队治疗＋挂件'
        self.assertEqual(self.errors(),[])
    def test_shield_or_active_heal_cannot_replace_party_heal(self):
        r = next(r for r in self.data['rows'] if r['id']=='card-1')
        for tag in ['shield', 'active_heal', 'interruption_resistance']:
            with self.subTest(tag=tag):
                d = copy.deepcopy(self.data)
                for slot in r['slots']: d['resources'][slot]['capabilities'] = [tag]
                self.assertTrue(any('party_heal' in e for e in validate_guide(d,ROOT/'guides')))
    def test_vv_requires_equipment_trigger_and_element_coverage(self):
        r = next(r for r in self.data['rows'] if r['id']=='act-3')
        for key,value in [('set','generic-anemo'),('on_field',False),('elements',['cryo'])]:
            d=copy.deepcopy(self.data)
            next(x for x in d['rows'] if x['id']==r['id'])['vv'][key]=value
            self.assertTrue(any('vv' in e for e in validate_guide(d,ROOT/'guides')))
    def test_template_alone_cannot_certify_helper_or_buff(self):
        for section in ['helpers','buffs']:
            d=copy.deepcopy(self.data);d[section][0]['source_ids']=['reference']
            self.assertTrue(any('independent evidence' in e for e in validate_guide(d,ROOT/'guides')))
    def test_helper_requires_separate_strength_and_mechanic_review(self):
        del self.data['helpers'][0]['review']['strength']
        self.assertTrue(any('helper review' in e for e in self.errors()))
    def test_unknown_fact_cannot_be_exported_as_reviewed(self):
        self.data['rows'][3]['review']['status']='unknown'
        self.assertTrue(any('content review' in e for e in self.errors()))
    def test_high_frequency_cryo_is_not_just_a_cryo_slot(self):
        r=next(r for r in self.data['rows'] if r['id']=='act-10')
        for slot in r['slots']:self.data['resources'][slot]['capabilities']=[]
        self.assertTrue(any('cryo_application' in e for e in self.errors()))
    def test_mechanics_fallback_remains_allowed(self):
        r=next(r for r in self.data['rows'] if r['id']=='card-1')
        for slot in r['slots']:self.data['resources'][slot]['capabilities']=[]
        self.data['resources'][r['slots'][-1]]['capabilities']=['party_heal']
        self.assertEqual(self.errors(),[])
    def test_export_requires_editorial_profile(self):
        import tempfile
        self.data.pop('editorial_profile',None)
        with tempfile.NamedTemporaryFile(mode='w',dir=ROOT/'guides',suffix='.json',encoding='utf-8') as f:
            json.dump(self.data,f,ensure_ascii=False);f.flush()
            with self.assertRaisesRegex(ValueError,'editorial_profile'):load_guide(f.name)

    def test_cannot_delete_row_mechanic_to_evade_contract(self):
        r=next(r for r in self.data['rows'] if r['id']=='card-1')
        r.pop('hp_loss');r['requires']={}
        self.assertTrue(any('mechanic_spec' in e for e in self.errors()))
    def test_malformed_capabilities_and_vv_rejected(self):
        for key,value in [('capabilities',None),('capabilities','party_heal')]:
            d=copy.deepcopy(self.data);d['resources']['healer-b'][key]=value
            self.assertTrue(validate_guide(d,ROOT/'guides'))
        r=next(r for r in self.data['rows'] if r['id']=='act-3');r['vv']['elements']=None
        self.assertTrue(any('vv' in e for e in self.errors()))
