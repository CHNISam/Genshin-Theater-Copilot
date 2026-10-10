"""Small, version-scoped guide checks. Evidence and damage stay review decisions."""
from collections import Counter
from datetime import date


def rules_for_month(month):
    """Highest released difficulty, not the rules of every difficulty."""
    start = date.fromisoformat(month[:7] + '-01')
    if start < date(2024, 7, 1):
        raise ValueError('Theater was not released')
    if start < date(2024, 9, 1):
        return {'id':'initial-8', 'acts':8, 'cards':0, 'entry_requirement':16}
    if start < date(2025, 10, 1):
        return {'id':'visionary-10', 'acts':10, 'cards':0, 'entry_requirement':22}
    return {'id':'lunar-12', 'acts':10, 'cards':2, 'entry_requirement':28}


def route_summary(data):
    uses = Counter(c for row in data['rows'] for c in row['slots'])
    return {'total_vigor':sum(uses.values()), 'used_characters':len(uses),
            'uses':dict(uses), 'claim':'conditional witness; not actual recruitment or clear'}


def rotation_errors(row):
    """Validate explicit proc links, not mere coexistence of character names."""
    links=row.get('rotation_links', [])
    if not isinstance(links,list):
        return ['rotation links must be a list']
    errors=[]
    for link in links:
        if not isinstance(link,dict):
            errors.append('invalid rotation link'); continue
        if link.get('trigger_requirement')=='normal_or_charged_damage' and link.get('driver_damage') not in ('normal','charged'):
            errors.append('normal/charged damage proc has incompatible driver')
    return errors


def strategy_errors(data):
    errors = []
    try:
        rules = rules_for_month(data['season_id'])
    except (ValueError, KeyError, TypeError):
        return ['invalid strategy season']
    strategy = data.get('strategy')
    if not isinstance(strategy, dict):
        return ['strategy contract required']
    if strategy.get('mode') != 'conditional_witness':
        errors.append('recruitment witness must remain conditional')
    if strategy.get('entry_requirement') != rules['entry_requirement']:
        errors.append('historical entry requirement mismatch')
    spec = data.get('target_spec', {})
    if spec.get('acts') != rules['acts'] or len(spec.get('cards', [])) != rules['cards']:
        errors.append('historical target mismatch')
    rows = {r['id']:r for r in data.get('rows', [])}
    resources = data.get('resources', {})
    for cid, resource in resources.items():
        capabilities=resource.get('capabilities', [])
        if not isinstance(capabilities,list) or any(not isinstance(c,str) for c in capabilities):
            errors.append(str(cid)+' invalid capabilities')
    if errors:
        return errors
    # Successful card fights also consume four vigor; thresholds count all fights.
    spent = 0
    for row in data.get('rows', []):
        errors.extend(rotation_errors(row))
        threshold = {'card-1':12, 'card-2':24}.get(row['id'], 0)
        if threshold and spent < threshold:
            errors.append(row['id'] + ' unlock threshold not reached')
        spent += len(row.get('slots', []))
    requirements = strategy.get('requirements', [])
    rotations = strategy.get('vv_rotations', [])
    if not isinstance(requirements, list) or not isinstance(rotations, list):
        return errors + ['strategy requirements/rotations must be lists']
    for rid, row in rows.items():
        required=row.get('required_capabilities', [])
        if not isinstance(required,list) or any(not isinstance(c,str) for c in required):
            errors.append(rid+' invalid required capabilities'); continue
        for capability in required:
            if not any(isinstance(r,dict) and r.get('row')==rid and
                       r.get('capability')==capability for r in requirements):
                errors.append(rid+' capability contract missing: '+str(capability))
        if row.get('requires_vv') and not any(isinstance(r,dict) and r.get('row')==rid for r in rotations):
            errors.append(rid+' vv rotation contract missing')
    for req in requirements:
        if not isinstance(req, dict):
            errors.append('invalid capability requirement'); continue
        if not isinstance(req.get('row'),str):
            errors.append('invalid capability row'); continue
        row = rows.get(req.get('row'), {})
        providers = req.get('providers', [])
        capability = req.get('capability')
        if not isinstance(providers, list) or not providers or not isinstance(capability, str):
            errors.append('invalid capability requirement'); continue
        if not any(isinstance(c,str) and c in row.get('slots', []) and
                   capability in resources.get(c, {}).get('capabilities', []) for c in providers):
            errors.append(str(req.get('row')) + ' missing capability: ' + capability)
    for rotation in rotations:
        if not isinstance(rotation, dict):
            errors.append('invalid vv rotation'); continue
        if not isinstance(rotation.get('row'),str):
            errors.append('invalid vv row'); continue
        row = rows.get(rotation.get('row'), {})
        provider = rotation.get('provider')
        if not isinstance(provider,str) or provider not in row.get('slots', []) or 'vv4' not in resources.get(provider,{}).get('capabilities', []):
            errors.append(str(rotation.get('row')) + ' vv4 provider missing')
        if rotation.get('on_field') is not True or rotation.get('reaction') not in ('swirl','stellar_swirl'):
            errors.append(str(rotation.get('row')) + ' vv requires on-field swirl')
    if data.get('borrowed_character_id') in data.get('opening_characters', []):
        errors.append('opening character cannot be borrowed')
    return errors
