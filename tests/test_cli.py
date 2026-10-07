import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
class CliTests(unittest.TestCase):
    def test_real_entry_stop_and_persistence(self):
        with tempfile.TemporaryDirectory(prefix='剧诗 portable ') as tmp:
            run=Path(tmp)/'run.json'
            def call(*args):
                return subprocess.run([sys.executable,'-m','src.cli',*map(str,args)],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
            self.assertEqual(call('init',run,'--demo').returncode,0)
            for score in [40,42]:
                self.assertEqual(call('trial',run).returncode,0)
                reply=call('record',run,'--result','fail','--score',score,'--seconds',90,'--mechanics','yes','--reason','timeout','--observation','fixed window')
            self.assertEqual(reply.returncode,2); self.assertIn('REPEATED_NON_CONVERGENCE',reply.stdout)
            before=run.read_bytes();self.assertEqual(call('trial',run).returncode,2);self.assertEqual(run.read_bytes(),before)
            self.assertEqual(call('init',run,'--demo').returncode,2);self.assertEqual(run.read_bytes(),before)
            self.assertEqual(call('self-test').returncode,0)
    def test_malformed_input_is_friendly_error_and_no_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            run=Path(tmp)/'bad.json';run.write_text('{"schema_version":1}',encoding='utf-8')
            before=run.read_bytes()
            reply=subprocess.run([sys.executable,'-m','src.cli','trial',str(run)],cwd=ROOT,capture_output=True,text=True)
            self.assertEqual(reply.returncode,2);self.assertNotIn('Traceback',reply.stderr);self.assertEqual(before,run.read_bytes())

    def test_legacy_pipe_encoding_does_not_break_chinese_paths(self):
        import os
        with tempfile.TemporaryDirectory(prefix='剧诗 encoding ') as tmp:
            env=dict(os.environ,PYTHONIOENCODING='cp1252')
            reply=subprocess.run([sys.executable,'-m','src.cli','init',str(Path(tmp)/'run.json'),'--demo'],cwd=ROOT,env=env,capture_output=True)
            self.assertEqual(reply.returncode,0,reply.stderr)
            self.assertIn('剧诗',reply.stdout.decode('utf-8'))
