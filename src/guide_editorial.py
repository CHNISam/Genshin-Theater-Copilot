"""Small production gate: player copy, reviewed evidence and typed capabilities.

These checks catch known editorial failures; they do not establish game facts.
Review notes and conditional slot capabilities remain outside the PNG projection.
"""
import re

PROFILE = 'one-image-v2'
ROW_FIELDS = ('label', 'team', 'enemy', 'tactic', 'before', 'after')
LIMITS = {'label':8, 'team':44, 'enemy':25, 'tactic':30, 'before':30, 'after':30}
INTERNAL = ('凝渡路线整理', '默认路线', '本图默认', '重算耐力', '耐力校验',
            '槽位', 'source_ids', 'character_id', '校验通过', '无法回头', '系统内部')
TEAM_ROLE_TERMS = {
    'party_heal': ('群奶', '全队治疗'),
    'active_heal': ('奶', '治疗'),
    'aimed_shot': ('弓',),
    'cryo_application': ('后台冰',),
}

def player_rows(data):
    """Explicit display allowlist; no audit notes, source metadata or calculations."""
    return [{k:r[k] for k in ROW_FIELDS} for r in data['rows']]

def validate_editorial(data,root):
    errors=[]
    if data.get('editorial_profile') != PROFILE:
        return ['editorial_profile must be '+PROFILE]
    def copy_check(text, label, limit):
        if not isinstance(text,str) or not text.strip():
            errors.append('editorial '+label+' text required');return
        single_line = label in ('title','scope','side_note','helper_note','helper name','helper text')
        if len(text)>limit or text.count('\n')>(0 if single_line else 1):
            errors.append('editorial '+label+' too verbose')
        if any(term in text for term in INTERNAL) or re.search(r'(?:辅助|治疗|充能)[A-C]',text):
            errors.append('editorial '+label+' internal prose')
    def evidence(item,label,current=False):
        sources=[data['sources'].get(s,{}) for s in item.get('source_ids',[])]
        usable=[s for s in sources if s.get('kind') not in
                ('user-provided-guide-image','guide-proposal','asset-reference')]
        if current:usable=[s for s in usable if s.get('season_id')==data['season_id']]
        if not usable:errors.append(label+' independent evidence required')
    def review(item,label,fields):
        r=item.get('review')
        if not isinstance(r,dict) or r.get('status')!='reviewed' or any(
            not isinstance(r.get(k),str) or not r[k].strip() for k in fields):
            errors.append(label+' content review incomplete')
    copy_check(data.get('title'),'title',38)
    copy_check(data.get('scope'),'scope',44)
    copy_check(data.get('side_note'),'side_note',20)
    copy_check(data.get('helper_note'),'helper_note',44)
    resources=data['resources']
    for key,resource in resources.items():
        caps=resource.get('capabilities')
        if not isinstance(caps,list) or any(not isinstance(c,str) for c in caps):
            errors.append(key+' capabilities string list required')
    if errors:return errors
    specs=data.get('mechanic_spec')
    if not isinstance(specs,dict) or set(specs)!=set(data['order']):
        return errors+['mechanic_spec independent encounter coverage required']
    for r in data['rows']:
        label=r['id']
        for k in ROW_FIELDS:
            if k in ('before','after'):
                if r.get(k)=='':continue
                if r.get(k) in ('先打两张圣牌，再把花花光','演出结束'):
                    errors.append(label+' '+k+' filler prose')
            copy_check(r.get(k),label+' '+k,LIMITS[k])
        evidence(r,label,True);review(r,label,('mechanic','route','recruitment'))
        spec=specs.get(label)
        if not isinstance(spec,dict) or not isinstance(spec.get('requires'),dict):
            errors.append(label+' mechanic_spec object required');continue
        evidence(spec,label+' mechanic_spec',True)
        required=r.get('requires',{})
        if 'requires' not in r or required!=spec['requires'] or r.get('hp_loss')!=spec.get('hp_loss') or r.get('vv_element')!=spec.get('vv_element'):
            errors.append(label+' mechanic_spec requirement mismatch')
        if not isinstance(required,dict):errors.append(label+' requirements object required');continue
        # Explicit role labels, not NLP inference from character names or tactic notes.
        for capability,terms in TEAM_ROLE_TERMS.items():
            if capability in required and not any(t in r.get('team','') for t in terms):
                errors.append(label+' player team role missing: '+capability)
        if r.get('vv_element') and '风套' not in r.get('team',''):
            errors.append(label+' player team role missing: vv')
        # Forced party drain cannot be covered by shield/active-only healing.
        if r.get('hp_loss')=='forced_party_drain' and (type(required.get('party_heal')) is not int or required['party_heal']<1):
            errors.append(label+' party_heal requirement missing')
        for capability,n in required.items():
            providers=sum(capability in resources.get(k,{}).get('capabilities',[]) for k in r['slots'])
            if type(n) is not int or n<1 or providers<n:
                errors.append(label+' '+capability+' providers missing')
        if r.get('vv_element'):
            vv=r.get('vv',{})
            if not isinstance(vv,dict) or vv.get('slot') not in r['slots'] or vv.get('set')!='viridescent-4' or vv.get('on_field') is not True or not isinstance(vv.get('elements'),list) or r['vv_element'] not in vv['elements'] or not isinstance(vv.get('refresh'),str) or not vv['refresh'].strip():
                errors.append(label+' vv equipment/on-field swirl/coverage missing')
            elif resources.get(vv['slot'],{}).get('element')!='anemo':
                errors.append(label+' vv requires anemo provider')
    for b in data['buffs']:
        copy_check(b.get('name'),'buff name',24);copy_check(b.get('text'),'buff text',70)
        evidence(b,'buff',True);review(b,'buff',('effect','priority','branches'))
    for h in data['helpers']:
        copy_check(h.get('name'),'helper name',12);copy_check(h.get('text'),'helper text',16)
        evidence(h,'helper');review(h,'helper review',('strength','mechanic','constellation','team'))
        route=h.get('route')
        if not isinstance(route,dict):
            errors.append('helper route required');continue
        from copy import deepcopy
        from src.season_guide import validate_guide
        variant=deepcopy(data)
        for candidate in variant['helpers']:candidate.pop('route',None)
        variant.pop('editorial_profile',None)  # Reuse core identity/element/vigor checks without recursion.
        for key in route.get('remove_resources',[]):variant['resources'].pop(key,None)
        variant['resources'].update(route.get('extra_resources',{}))
        variant['resources']['helper'].update(name=h['name']+'（助战）',character_id=h['asset_id'],element=route.get('element'))
        for row in variant['rows']:
            row['slots']=route.get('row_slots',{}).get(row['id'],row['slots'])
            if 'helper' in row['slots']:
                if route.get('allowed_elements'):row['allowed_elements']=route['allowed_elements']
                elements=[variant['resources'].get(k,{}).get('element') for k in row['slots']]
                if any(e not in elements for e in route.get('requires_elements',[])):
                    errors.append('helper route '+h['name']+' missing teammate element')
            for cap,n in row.get('requires',{}).items():
                count=sum(cap in variant['resources'].get(k,{}).get('capabilities',[]) for k in row['slots'])
                if count<n:errors.append('helper route '+h['name']+' '+row['id']+' '+cap+' missing')
        errors.extend('helper route '+h['name']+': '+e for e in validate_guide(variant,root))
    return errors
