"""Account applicability checks over the existing resource solver, not a DPS model.

The host reviews observations. This validates review scope and contradictions;
it cannot prove external clears or turn an uncertain probe into a success rate.
"""
import hashlib
import json
from .fight_guard import strategy_key
from .season_readiness import FOUNDATION, decision_requirements
from .theater_guard import Checkpoint, PlanOption, status_after_use

def _text(v):
    return isinstance(v,str) and bool(v.strip())

def basis_key(run):
    """Bind account review to the exact premise, goal and inspected observation."""
    fight=run['fight'];effective=dict(fight)
    effective['builds']={c:run['capabilities'].get(c) for c in fight.get('team',[])}
    effective['buffs']=run['buffs']
    ids=list(FOUNDATION)+decision_requirements(run['season'],fight.get('encounter_id'),fight.get('buff_fact_ids',[]))
    facts={fid:run['season']['facts'].get(fid) for fid in ids}
    urls={url for f in facts.values() if f for url in f.get('sources',[])}
    body={'strategy':strategy_key(effective),'season_id':run['season']['id'],
          'facts':facts,'sources':[s for s in run['season'].get('sources',[]) if s.get('url') in urls],
          'contract':{k:fight.get(k) for k in ('encounter_id','damage','sustain','metric','buff_fact_ids')},
          'evidence':[e for e in run['evidence'] if e['id'] in fight.get('evidence_ids',[])]}
    return hashlib.sha256(json.dumps(body,sort_keys=True,ensure_ascii=False,allow_nan=False).encode('utf-8')).hexdigest()


def current(run, effective):
    fight=run['fight'];review=fight.get('execution_review')
    if not isinstance(review,dict): return ['EXECUTION_REVIEW_REQUIRED'],'unreviewed'
    reasons=[];verdict=review.get('verdict')
    if review.get('basis_key')!=basis_key(run): reasons.append('EXECUTION_REVIEW_STALE')
    if verdict not in ('supported','bounded-probe','insufficient') or not all(_text(review.get(k)) for k in ('comparison','fallback')):
        reasons.append('EXECUTION_REVIEW_REQUIRED')
    axes=[review.get(k) for k in ('damage','sustain','execution')]
    if any(x not in ('supported','uncertain','insufficient') for x in axes): reasons.append('EXECUTION_REVIEW_REQUIRED')
    if verdict=='insufficient' or 'insufficient' in axes: reasons.append('ACCOUNT_EXECUTION_INSUFFICIENT')
    if verdict=='supported' and 'uncertain' in axes: reasons.append('UNCERTAINTY_REQUIRES_BOUNDED_PROBE')
    evidence=next((e for e in run['evidence'] if e['id']==review.get('evidence_id')),None)
    if not evidence or evidence['id'] not in fight.get('evidence_ids',[]):
        reasons.append('EXECUTION_EVIDENCE_REQUIRED')
    else:
        obs=evidence.get('observation')
        if not isinstance(obs,dict) or not all(_text(obs.get(k)) for k in ('outcome','locator','account')):
            reasons.append('EXECUTION_OBSERVATION_REQUIRED')
        elif verdict=='supported' and obs['outcome']!='clear': reasons.append('SUCCESS_EVIDENCE_REQUIRED')
    # Every current provider needs actual build provenance, not only mechanic actors.
    if any(not all(_text(run['capabilities'].get(c,{}).get(k)) for k in ('build','source')) for c in fight.get('team',[])):
        reasons.append('CURRENT_ACCOUNT_BUILD_REQUIRED')
    return list(dict.fromkeys(reasons)), verdict or 'unreviewed'

def future(run, team):
    checkpoints=[];unknown=[]
    for p in run['checkpoints']:
        options=[]
        for o in p['options']:
            review=o.get('capability_review',{})
            status=review.get('status','uncertain')
            valid=status in ('supported','uncertain','insufficient') and all(_text(review.get(k)) for k in ('source','comparison'))
            if not valid or status=='uncertain': unknown.append(p['id']+':'+o['name'])
            if status!='insufficient' or not valid:
                options.append(PlanOption.from_mapping(o['name'],o['consumes']))
        checkpoints.append(Checkpoint(p['id'],tuple(options)))
    route=status_after_use(run['vigor'],team,checkpoints,set(run['unlocked']),set(run['vigor'])).name
    return route,unknown
