"""Delivery failures which must not silently produce a finished guide."""
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

class GuideTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root/'icon.png').write_bytes(b'fixture')
        self.data = {
            'schema_version':1, 'season_id':'2026-10-v7.1', 'valid_until':'2026-11-01',
            'reviewed_at':'2026-10-10', 'title':'十月攻略', 'scope':'月谕：10幕＋2圣牌',
            'status':'reviewed_guide', 'notes':['示例'], 'target_spec':{'acts':10,'cards':['card-1','card-2']},
            'sources':{'s':{'url':'https://example.com/guide','season_id':'2026-10-v7.1','accessed_at':'2026-10-10','locator':'本期正文','kind':'guide-proposal'}},
            'assets':{'a':{'path':'icon.png','url':'https://example.com/icon.png','sha256':hashlib.sha256(b'fixture').hexdigest(),'name':'怪物','kind':'game-ui','reviewed':True}},
            'resources':{'c':{'name':'角色','character_id':'c','element':'cryo','vigor':12}},
            'order':[f'act-{i}' for i in range(1,10)]+['card-1','card-2','act-10'],
            'rows':[], 'buffs':[{'name':'冻结','text':'升到二级','source_ids':['s']}],
            'helpers':[{'name':'角色','asset_id':'a','text':'有条件借用','source_ids':['s']}],
        }
        for i,k in enumerate(self.data['order']):
            rs=['c',f'x{i}',f'y{i}',f'z{i}']
            for r in rs[1:]:self.data['resources'][r]={'name':r,'character_id':r,'element':'cryo','vigor':2}
            self.data['rows'].append({'id':k,'label':k,'team':'角色＋三辅助','slots':rs,'enemy':'怪物','asset_ids':['a'],'before':'准备','after':'补人','tactic':'处理机制','source_ids':['s']})
    def tearDown(self): self.temp.cleanup()
    def validate(self,data=None):
        from src.season_guide import validate_guide
        return validate_guide(data or self.data,self.root)
    def test_representative_route_passes(self): self.assertEqual(self.validate(),[])
    def test_missing_target_rejected(self):
        self.data['rows'].pop();self.assertTrue(any('coverage' in s for s in self.validate()))
    def test_card_after_final_rejected(self):
        self.data['order'][-3:]=['act-10','card-1','card-2'];self.assertTrue(any('order' in s for s in self.validate()))
    def test_five_slots_rejected(self):
        self.data['rows'][0]['slots'].append('extra');self.assertTrue(any('four' in s for s in self.validate()))
    def test_vigor_overuse_rejected(self):
        self.data['resources']['c']['vigor']=2;self.assertTrue(any('vigor' in s for s in self.validate()))
    def test_stale_or_wrong_season_source_rejected(self):
        self.data['sources']['s']['season_id']='2026-09-v7.0';self.assertTrue(any('season' in s for s in self.validate()))
    def test_missing_asset_and_path_escape_rejected(self):
        self.data['assets']['a']['path']='../missing.png';self.assertTrue(any('asset' in s for s in self.validate()))
    def test_changed_asset_rejected(self):
        (self.root/'icon.png').write_bytes(b'wrong');self.assertTrue(any('hash' in s for s in self.validate()))
    def test_unreviewed_asset_rejected(self):
        self.data['assets']['a']['reviewed']=False;self.assertTrue(any('review' in s for s in self.validate()))
    def test_empty_choice_rejected(self):
        self.data['rows'][0]['before']='';self.assertTrue(any('before' in s for s in self.validate()))
    def test_unsupported_source_reference_rejected(self):
        self.data['buffs'][0]['source_ids']=['missing'];self.assertTrue(any('source' in s for s in self.validate()))
    def test_duplicate_node_rejected(self):
        self.data['rows'][1]['id']='act-1';self.assertTrue(any('coverage' in s for s in self.validate()))
    def test_new_season_does_not_assume_october(self):
        d=copy.deepcopy(self.data);d['season_id']='2026-11-v7.2';d['valid_until']='2026-12-01';d['reviewed_at']='2026-11-01'
        d['sources']['s'].update(season_id=d['season_id'],accessed_at=d['reviewed_at'])
        self.assertEqual(self.validate(d),[])

    def test_deleting_target_from_both_arrays_rejected(self):
        self.data['order'].remove('card-2')
        self.data['rows']=[r for r in self.data['rows'] if r['id']!='card-2']
        self.assertTrue(any('coverage' in e for e in self.validate()))
    def test_alias_identity_rejected(self):
        self.data['resources']['x0']['character_id']='c'
        self.assertTrue(any('duplicate character' in e for e in self.validate()))
    def test_element_restriction_rejected(self):
        self.data['rows'][0]['allowed_elements']=['hydro']
        self.assertTrue(any('incompatible' in e for e in self.validate()))
    def test_malformed_sections_rejected_without_exception(self):
        for k,v in [('rows',None),('sources',[]),('resources',[]),('notes',42)]:
            with self.subTest(k=k):
                d=copy.deepcopy(self.data);d[k]=v
                self.assertTrue(self.validate(d))

    def test_malformed_entries_and_scalar_fields_rejected(self):
        cases=[('rows',[None]),('buffs',[42]),('helpers',[None]),('subtitle',[]),('footer',[])]
        for k,v in cases:
            with self.subTest(k=k):
                d=copy.deepcopy(self.data);d[k]=v
                self.assertTrue(self.validate(d))
        d=copy.deepcopy(self.data);d['resources']['c']['name']=[]
        self.assertTrue(self.validate(d))
        d=copy.deepcopy(self.data);d['helpers'][0]['asset_id']=[]
        self.assertTrue(self.validate(d))
    def test_helper_named_as_existing_core_rejected(self):
        self.data['resources']['x0']['name']='角色'
        self.assertTrue(any('duplicate character' in e for e in self.validate()))

    def test_reordered_acts_in_both_arrays_rejected(self):
        self.data['order'][0:2]=self.data['order'][0:2][::-1]
        self.data['rows'][0:2]=self.data['rows'][0:2][::-1]
        self.assertTrue(any('order' in e for e in self.validate()))
