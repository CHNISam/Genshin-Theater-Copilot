import copy,json,unittest
from pathlib import Path
from src.history_archive import archive_errors
ROOT=Path(__file__).resolve().parents[1]
class ArchiveTests(unittest.TestCase):
    def test_current_archive(self):self.assertEqual(archive_errors(ROOT),[])
    def test_missing_month_is_rejected(self):
        index=json.loads((ROOT/'seasons/history/index.json').read_text());index['seasons'].pop(0)
        self.assertTrue(archive_errors(ROOT,index=index))
    def test_frozen_input_mutation_is_rejected(self):
        audit=json.loads((ROOT/'seasons/history/plans/input-audit.json').read_text())
        next(iter(audit['inputs'].values()))['sha256']='0'*64
        self.assertTrue(archive_errors(ROOT,input_audit=audit))
