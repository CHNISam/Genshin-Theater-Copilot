"""Offline one-image guide contract; factual review remains an explicit human gate."""
from collections import Counter
from datetime import date
from pathlib import Path
import hashlib
import json


def validate_guide(data, root):
    """Return all delivery blockers. Does not certify game facts or live readiness."""
    errors=[]
    if not isinstance(data,dict):return ['guide object required']
    for k in ('sources','assets','resources','target_spec'):
        if not isinstance(data.get(k),dict):errors.append(k+' object required')
    for k in ('order','rows','buffs','helpers','notes'):
        if not isinstance(data.get(k),list) or not data[k]:errors.append(k+' nonempty list required')
    if errors:return errors
    for k in ('sources','assets','resources'):
        if any(not isinstance(v,dict) for v in data[k].values()):errors.append(k+' entries must be objects')
    for k in ('rows','buffs','helpers'):
        if any(not isinstance(v,dict) for v in data[k]):errors.append(k+' entries must be objects')
    if errors:return errors
    for k in ('subtitle','footer'):
        if k in data and not isinstance(data[k],str):errors.append(k+' string required')
    for k,v in data['resources'].items():
        for field in ('name','character_id','element'):
            if not isinstance(v.get(field),str) or not v[field].strip():errors.append(k+' '+field+' required')
    for item in data['helpers']:
        if not isinstance(item.get('asset_id'),str):errors.append('helper asset_id string required')
    for k in ('order','notes'):
        if any(not isinstance(v,str) or not v.strip() for v in data[k]):errors.append(k+' entries must be nonempty strings')
    for row in data['rows']:
        for k in ('slots','asset_ids','source_ids'):
            if not isinstance(row.get(k),list) or any(not isinstance(v,str) for v in row[k]):errors.append('row '+k+' string list required')
    for section in ('buffs','helpers'):
        for item in data[section]:
            if not isinstance(item.get('source_ids'),list) or any(not isinstance(v,str) for v in item['source_ids']):errors.append(section+' source_ids string list required')
    if errors:return errors
    root=Path(root).resolve()
    def need(value,label):
        if not isinstance(value,str) or not value.strip(): errors.append(label+' required')
    if data.get('schema_version')!=1: errors.append('schema_version unsupported')
    for k in ('season_id','title','scope','reviewed_at','valid_until'): need(data.get(k),k)
    try:
        reviewed=date.fromisoformat(data['reviewed_at']); end=date.fromisoformat(data['valid_until'])
        if reviewed>=end:errors.append('reviewed_at outside season')
    except (ValueError,KeyError,TypeError): errors.append('date invalid')
    if data.get('status')!='reviewed_guide':errors.append('content review incomplete')
    order=data['order'];rows=data['rows']
    spec=data['target_spec']
    acts=spec.get('acts');cards=spec.get('cards')
    if type(acts) is not int or acts<1 or not isinstance(cards,list) or any(not isinstance(c,str) for c in cards):
        errors.append('target_spec invalid')
    else:
        act_order=[f'act-{i}' for i in range(1,acts+1)]
        if Counter(order)!=Counter(act_order+cards):errors.append('target coverage mismatch')
        if [k for k in order if k in act_order]!=act_order:errors.append('act order mismatch')
        final=f'act-{acts}'
        if final in order and any(c in order and order.index(c)>order.index(final) for c in cards):errors.append('card order after final')
    if any(not isinstance(r.get('id'),str) for r in rows):return errors+['row id required']
    if not order or len(set(order))!=len(order) or Counter(order)!=Counter(r.get('id') for r in rows):errors.append('coverage mismatch')
    if [r.get('id') for r in rows]!=order:errors.append('row order mismatch')
    if 'act-10' in order:
        for c in ('card-1','card-2'):
            if c in order and order.index(c)>order.index('act-10'):errors.append('card order after final')
    sources=data.get('sources',{})
    for sid,s in sources.items():
        for k in ('url','locator','accessed_at','kind'):need(s.get(k),'source '+sid+' '+k)
        if s.get('season_id') not in (data.get('season_id'),'system-reference','asset-reference'):errors.append('source '+sid+' wrong season')
        try:
            if date.fromisoformat(s['accessed_at'])<date.fromisoformat(data['reviewed_at']):errors.append('source '+sid+' stale review')
        except (KeyError,ValueError,TypeError):errors.append('source '+sid+' invalid date')
    assets=data.get('assets',{})
    for aid,a in assets.items():
        if a.get('reviewed') is not True:errors.append('asset '+aid+' review required')
        for k in ('name','url','kind','path','sha256'):need(a.get(k),'asset '+aid+' '+k)
        try:
            p=(root/a['path']).resolve()
            if not p.is_relative_to(root):errors.append('asset '+aid+' path escape');continue
            if not p.is_file():errors.append('asset '+aid+' missing');continue
            if hashlib.sha256(p.read_bytes()).hexdigest()!=a.get('sha256'):errors.append('asset '+aid+' hash mismatch')
        except (KeyError,TypeError,OSError):errors.append('asset '+aid+' unavailable')
    def refs(item,label):
        ids=item.get('source_ids',[])
        if not ids or any(s not in sources for s in ids):errors.append(label+' source reference missing')
    uses=Counter();resources=data.get('resources',{})
    for r in rows:
        label=str(r.get('id','row'))
        for k in ('label','team','enemy','tactic'):need(r.get(k),label+' '+k)
        for k in ('before','after'):
            if not isinstance(r.get(k),str):errors.append(label+' '+k+' string required')
        slots=r.get('slots',[])
        if len(slots)!=4 or len(set(slots))!=4:errors.append(label+' requires four distinct slots')
        uses.update(slots)
        if not r.get('asset_ids') or any(a not in assets for a in r.get('asset_ids',[])):errors.append(label+' asset reference missing')
        refs(r,label)
    identities={}
    for k,v in resources.items():
        need(v.get('character_id'),k+' character_id')
        need(v.get('element'),k+' element')
        identity=v.get('character_id')
        if isinstance(identity,str):
            if identity in identities:errors.append(k+' duplicate character identity')
            identities[identity]=k
    # A named character cannot be silently rebound under an auxiliary/helper alias.
    named={v.get('name'):v.get('character_id') for k,v in resources.items() if v.get('character_id')==k}
    for k,v in resources.items():
        if v.get('name') in named and v.get('character_id')!=named[v['name']]:errors.append(k+' duplicate character name')
    for r in rows:
        allowed=r.get('allowed_elements')
        if allowed is not None:
            if not isinstance(allowed,list) or any(not isinstance(e,str) for e in allowed):errors.append(r['id']+' allowed_elements invalid')
            elif any(resources.get(k,{}).get('element') not in allowed for k in r['slots']):errors.append(r['id']+' incompatible element')
    for k,n in uses.items():
        v=resources.get(k,{})
        if not isinstance(v.get('vigor'),int) or v.get('vigor',0)<n:errors.append(k+' vigor overuse or missing')
        need(v.get('name'),k+' name')
    for section in ('buffs','helpers'):
        if not data.get(section):errors.append(section+' required')
        for item in data.get(section,[]):
            need(item.get('name'),section+' name');need(item.get('text'),section+' text');refs(item,section)
            if section=='helpers' and item.get('asset_id') not in assets:errors.append('helper asset missing')
    if not data.get('notes'):errors.append('notes required')
    if 'editorial_profile' in data:
        from src.guide_editorial import validate_editorial
        errors.extend(validate_editorial(data,root))
    return errors


def load_guide(path):
    path=Path(path)
    data=json.loads(path.read_text(encoding='utf-8'))
    errors=validate_guide(data,path.parent)
    if data.get('editorial_profile') != 'one-image-v2':
        errors.append('editorial_profile required for production export')
    if errors:raise ValueError('\n'.join(errors))
    return data
