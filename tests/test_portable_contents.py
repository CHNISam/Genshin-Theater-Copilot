"""Exercise both distributable manifests without downloading or running CPython."""
import hashlib,importlib.util,io,sys,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch

class PortableContentsTests(unittest.TestCase):
    def test_guide_input_and_exact_evidence_bytes_ship_in_both_archives(self):
        repo=Path(__file__).resolve().parents[1]
        spec=importlib.util.spec_from_file_location('portable_builder',repo/'tools/build_portable.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for folder in ('src','tests','templates','policies','fixtures','seasons','docs','plans','prompts','maintenance','tools','.github','guides'):
                (root/folder).mkdir()
            for name in ('theater.cmd','README.md','QUICKSTART.md','LICENSE','AGENTS.md','.gitignore','requirements-guide.txt'):
                (root/name).write_bytes(b'fixture\n')
            (root/'VERSION').write_text('1.0.0')
            guide=b'{"example":"input"}\n';proof=b'captured evidence\n'
            (root/'guides/2026-10.json').write_bytes(guide)
            (root/'seasons/proof.txt').write_bytes(proof)
            buf=io.BytesIO()
            with zipfile.ZipFile(buf,'w') as z:z.writestr('python313.zip',b'fixture')
            runtime=root/'runtime.zip';runtime.write_bytes(buf.getvalue())
            with patch.object(module,'ROOT',root),patch.object(module,'RUNTIME_SHA256',hashlib.sha256(buf.getvalue()).hexdigest()),patch.object(sys,'argv',['build','--runtime',str(runtime)]):module.main()
            for filename,prefix in [('Genshin-Theater-Copilot-v1.0.0-win-x64.zip','Genshin-Theater-Copilot-v1.0.0-win-x64'),('Genshin-Theater-Copilot-v1.0.0-source.zip','Genshin-Theater-Copilot')]:
                with zipfile.ZipFile(root/'dist'/filename) as archive:
                    self.assertEqual(archive.read(prefix+'/guides/2026-10.json'),guide)
                    self.assertEqual(archive.read(prefix+'/seasons/proof.txt'),proof)
