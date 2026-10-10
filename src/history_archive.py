"""Audit archive coverage and captured bytes, never certify gameplay truth."""
from pathlib import Path
from datetime import date
import hashlib,json
from src.guide_policy import rules_for_month
from src.historical_review import comparison_errors,_digest

def archive_errors(root, *, index=None, input_audit=None):
    root=Path(root);errors=[]
    index=index or json.loads((root/'seasons/history/index.json').read_text(encoding='utf-8'))
    start=date.fromisoformat(index['coverage_start']+'-01');end=date.fromisoformat(index['coverage_end']+'-01')
    expected=[]
    while start<=end:
        expected.append(start.strftime('%Y-%m'))
        start=date(start.year+(start.month==12),start.month%12+1,1)
    if [s['month'] for s in index['seasons']]!=expected:errors.append('monthly coverage mismatch')
    for entry in index['seasons']:
        path=root/entry['facts_path'];packet=json.loads(path.read_text(encoding='utf-8'))
        if packet['month']!=entry['month']:errors.append('packet month mismatch')
        if packet['ruleset_id']!=rules_for_month(packet['month'])['id']:errors.append('historical rules mismatch')
        for sid,source in packet.get('sources',{}).items():
            if source.get('evidence_path'):
                p=root/source['evidence_path']
                if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=source.get('evidence_sha256'):
                    errors.append(packet['month']+' evidence mismatch: '+sid)
    audit=input_audit or json.loads((root/'seasons/history/plans/input-audit.json').read_text(encoding='utf-8'))
    for path,item in audit['inputs'].items():
        frozen=json.loads((root/path).read_text(encoding='utf-8'))
        if _digest(frozen['plan'])!=item['plan_sha256']:errors.append('frozen plan mismatch: '+path)
        if hashlib.sha256((root/item['fact_packet']).read_bytes()).hexdigest()!=item['sha256']:errors.append('frozen input mismatch: '+path)
    for path in (root/'seasons/history/reviews').glob('*.json'):
        comparison=json.loads(path.read_text(encoding='utf-8'))
        frozen=json.loads((root/'seasons/history/plans'/f"{comparison['month']}.freeze.json").read_text(encoding='utf-8'))
        errors.extend(comparison_errors(frozen,comparison))
    return errors
