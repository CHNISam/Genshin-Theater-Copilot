"""Freeze original proposals before expert comparison, without inventing playtests."""
from datetime import date
from pathlib import Path
import hashlib
import json


def _digest(data):
    return hashlib.sha256(json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def freeze_plan(plan_path, frozen_path):
    plan=json.loads(Path(plan_path).read_text(encoding='utf-8'))
    if plan.get('expert_exposure') is not False:
        raise ValueError('independent freeze requires explicit no expert exposure')
    cutoff=date.fromisoformat(plan['knowledge_cutoff'])
    if cutoff.strftime('%Y-%m') != plan['month']:
        raise ValueError('cutoff must be inside the historical month')
    mode=plan.get('mode')
    if mode not in ('retrospective_reconstruction','contemporaneous_blind'):
        raise ValueError('unknown review mode')
    for character,resource in plan.get('resources',{}).items():
        if not resource.get('known_since') or date.fromisoformat(resource['known_since'])>cutoff:
            raise ValueError('future or unknown character availability: '+character)
    if not plan.get('decisions') or not plan.get('sources'):
        raise ValueError('decisions and factual sources required')
    input_hashes={}
    for sid, source in plan['sources'].items():
        if source.get('historical_month') not in (None,plan['month']):
            raise ValueError('source historical scope mismatch')
        if source.get('path'):
            packet=Path(source['path'])
            content=packet.read_bytes()
            parsed=json.loads(content)
            if parsed.get('month')!=plan['month']:
                raise ValueError('source packet scope mismatch')
            input_hashes[sid]=hashlib.sha256(content).hexdigest()
        published=source.get('published_at')
        if published and date.fromisoformat(published[:10])>cutoff:
            # A later retrieval is allowed in retrospective mode, a later game fact is not.
            if mode=='contemporaneous_blind' or source.get('historical_month')!=plan['month']:
                raise ValueError('future source without historical scope')
        if mode=='contemporaneous_blind' and (not published or not source.get('snapshot_sha256')):
            raise ValueError('contemporary source date and captured snapshot required')
    result={'schema_version':1,'plan_sha256':_digest(plan),'plan_file_sha256':hashlib.sha256(Path(plan_path).read_bytes()).hexdigest(),
            'plan':plan,'input_sha256':input_hashes,'contemporaneous_blind_validated':False,
            'claim':'Frozen independent proposal; chronology/source semantics and real clear need separate review.'}
    dest=Path(frozen_path);dest.parent.mkdir(parents=True,exist_ok=True)
    # Exclusive create: never silently rewrite a pre-comparison result.
    with dest.open('x',encoding='utf-8') as f:
        f.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return result


def comparison_errors(frozen, comparison):
    errors=[]
    if _digest(frozen.get('plan',{}))!=frozen.get('plan_sha256'):
        errors.append('frozen plan hash mismatch')
    if comparison.get('plan_sha256')!=frozen.get('plan_sha256'):
        errors.append('comparison plan hash mismatch')
    for sid, digest in frozen.get('input_sha256',{}).items():
        try:
            path=Path(frozen['plan']['sources'][sid]['path'])
            if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
                errors.append('frozen input hash mismatch: '+sid)
        except (KeyError,OSError,TypeError):
            errors.append('frozen input unavailable: '+sid)
    sources=comparison.get('sources',{})
    diffs=comparison.get('differences')
    if not isinstance(sources,dict) or not isinstance(diffs,list) or not diffs:
        return errors+['comparison sources and differences required']
    for sid,source in sources.items():
        if not isinstance(source,dict) or not any(isinstance(source.get(k),str) and source[k].strip() for k in ('url','path')):
            errors.append('comparison source location required: '+str(sid))
    categories={'decision_error','reference_gap','condition_difference','insufficient_evidence'}
    for diff in diffs:
        if not isinstance(diff,dict):errors.append('invalid difference');continue
        if diff.get('classification') not in categories:errors.append('difference classification required')
        for field in ('dimension','reason','action'):
            if not isinstance(diff.get(field),str) or not diff[field].strip():errors.append(field+' required')
        ids=diff.get('evidence_ids')
        if not isinstance(ids,list) or not ids or any(not isinstance(s,str) or s not in sources for s in ids):
            errors.append('difference evidence reference missing')
    return errors
