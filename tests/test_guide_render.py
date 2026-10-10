import importlib.util
import unittest
from pathlib import Path

@unittest.skipUnless(importlib.util.find_spec('PIL'),'Optional Pillow export dependency')
class RenderTests(unittest.TestCase):
    def test_cjk_wrap_preserves_all_content(self):
        from PIL import ImageFont
        from tools.render_guide import wrap_text
        f=ImageFont.truetype('DejaVuSans.ttf',24)
        text='每一幕都要有完整选择，不允许静默截断。'*12
        lines=wrap_text(text,f,180)
        self.assertEqual(''.join(lines),text)
        self.assertTrue(all(f.getlength(line)<=180 for line in lines))
    def test_narrow_wrap_fails_explicitly(self):
        from PIL import ImageFont
        from tools.render_guide import wrap_text
        with self.assertRaises(ValueError):wrap_text('W',ImageFont.truetype('DejaVuSans.ttf',24),1)
    def test_current_artifact_decodes_and_links_all_rows(self):
        from PIL import Image
        from tools.render_guide import render_guide
        import tempfile,json
        root=Path(__file__).resolve().parents[1]
        if not (root/'guides/2026-10.json').exists():self.fail('Current season guide missing')
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'guide.png'
            receipt=render_guide(root/'guides/2026-10.json',out,root/'guides/assets/NotoSansSC-Regular.otf')
            with Image.open(out) as im:self.assertEqual(im.width,3200);self.assertGreater(im.height,1200)
            self.assertEqual(receipt['rows'],12)
            self.assertEqual(receipt['clipped_cells'],0)
            self.assertTrue(out.with_suffix('.html').exists())
            self.assertEqual(json.loads(out.with_suffix('.receipt.json').read_text())['png_sha256'],receipt['png_sha256'])

    def test_four_buffs_and_allowed_headings_render_without_clipping(self):
        import tempfile,json,copy
        from tools.render_guide import render_guide
        root=Path(__file__).resolve().parents[1]
        d=json.loads((root/'guides/2026-10.json').read_text())
        d['buffs'].append(copy.deepcopy(d['buffs'][0]))
        d['title']='十月幻想真境剧诗·月谕攻略'
        d['buffs'][0]['name']='冻结与冰风祝福的选择优先级'
        # Keep relative asset resolution inside the guide directory.
        with tempfile.NamedTemporaryFile(mode='w',suffix='.json',dir=root/'guides',encoding='utf-8') as f:
            json.dump(d,f,ensure_ascii=False);f.flush()
            with tempfile.TemporaryDirectory() as out:
                receipt=render_guide(f.name,Path(out)/'test.png',root/'guides/assets/NotoSansSC-Regular.otf')
                self.assertEqual(receipt['clipped_cells'],0)
                self.assertGreater(receipt['checked_text_lines'],100)

    def test_player_surface_excludes_private_review_and_calculations(self):
        import json
        root=Path(__file__).resolve().parents[1]
        receipt=json.loads((root/'guides/output/2026-10-guide.receipt.json').read_text())
        text=' '.join(receipt['player_text'])
        for term in ['凝渡路线整理','默认路线','耐力','source_ids','重算','辅助A','治疗B']:
            self.assertNotIn(term,text)
        self.assertIn('怪物推荐',receipt['player_text'])
        self.assertIn('风套四件',text)
        self.assertLess(receipt['size'][1],2100)
