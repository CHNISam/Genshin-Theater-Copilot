"""Evidence/coverage gate, independent of a pack's self-declared status.

No networking: the host Agent performs the returned research work. This validates
provenance metadata and missingness, not the truth of externally reviewed text.
"""
from datetime import date, timedelta
import json
from pathlib import Path

# Policy, not mutable pack declarations. New reaction systems require review here.
TREES = {frozenset(('hydro','cryo')): 'freeze',
         frozenset(('hydro','anemo')): 'hydro-swirl',
         frozenset(('cryo','anemo')): 'cryo-swirl',
         frozenset(('pyro','hydro')): 'vaporize',
         frozenset(('pyro','cryo')): 'melt',
         frozenset(('pyro','electro')): 'overload',
         frozenset(('hydro','electro')): 'electro-charged',
         frozenset(('cryo','electro')): 'superconduct',
         frozenset(('hydro','dendro')): 'bloom',
         frozenset(('pyro','dendro')): 'burning',
         frozenset(('electro','dendro')): 'quicken'}
FIXED = ('act-3','act-6','act-8','act-10','card-1','card-2')
CORE = ('season-identity','opening-roster','guest-roster','buff-inventory','buff-progression','opening-blessing',
        'ordinary-encounter-pool','event-catalog','cumulative-blessing-attributes')
FOUNDATION = CORE[:4]
SUFFIXES = ('base','2-1','2-2','advanced','4-1A','4-1B','4-2A','4-2B')
MAX_AGE_DAYS = 7  # maintenance policy, not a mechanic


def tree_names(season):
    elements=season.get('allowed_elements',[])
    names=[]
    for i,a in enumerate(elements):
        for b in elements[i+1:]:
            pair=frozenset((a,b))
            name=TREES.get(pair)
            if name is None and 'anemo' in pair and pair-{'anemo'}<= {'pyro','hydro','cryo','electro'}: name=next(iter(pair-{'anemo'}))+'-swirl'
            if name is None and 'geo' in pair and pair-{'geo'}<= {'pyro','hydro','cryo','electro'}: name=next(iter(pair-{'geo'}))+'-crystallize'
            if name is not None: names.append(name)
    return sorted(set(names))


def requirements(season):
    names=tree_names(season)
    return list(CORE)+[x+'-mechanic' for x in FIXED]+[x+'-configuration' for x in FIXED]+[
        t+'-'+s for t in names for s in SUFFIXES]+[t+'-costs' for t in names]


def mechanic_requirements(season, encounter):
    ids=list(season.get('encounters',{}).get(encounter,[]))
    if encounter in FIXED: ids.append(encounter+'-mechanic')
    return list(dict.fromkeys(ids))


def decision_requirements(season, encounter=None, buff_ids=()):
    ids=mechanic_requirements(season,encounter) if encounter else []
    for fid in buff_ids:
        ids.append(fid)
        for tree in tree_names(season):
            if fid.startswith(tree+'-') and fid!=tree+'-base':
                ids.append(tree+'-base')
                if '-4-' in fid:
                    ids.extend([tree+'-advanced',tree+'-2-'+fid.split('-4-')[1][0]])
    return list(dict.fromkeys(ids))


def _known(value):
    if value is None or value == '' or value == [] or value == {}: return False
    if isinstance(value,dict): return all(_known(x) for x in value.values())
    if isinstance(value,list): return all(_known(x) for x in value)
    return True


def _issue(season, fid, today):
    f=season.get('facts',{}).get(fid)
    if not f: return 'MISSING'
    if f.get('alias_of'):
        return 'ALIAS_REQUIRES_CANONICAL_FACT:'+f['alias_of']
    if fid in requirements(season) and f.get('knowledge_class')!='public': return 'PUBLIC_REQUIRED'
    if f.get('knowledge_class')=='live':
        return None if f.get('status') in ('verified','guide_supported') and _known(f.get('value')) else 'LIVE_OBSERVATION_REQUIRED'
    if f.get('knowledge_class')!='public': return 'KNOWLEDGE_CLASS_REQUIRED'
    if f.get('status') not in ('verified','guide_supported'): return f.get('status','UNKNOWN').upper()
    if not _known(f.get('value')): return 'INCOMPLETE_VALUE'
    value=f['value']
    if fid=='season-identity' and (not isinstance(value,dict) or any(value.get(k)!=season.get(k) for k in ('id','starts_at','ends_at','allowed_elements'))): return 'IDENTITY_MISMATCH'
    if fid=='opening-roster' and value!=season.get('opening_characters'): return 'ROSTER_MISMATCH'
    if fid=='guest-roster' and value!=season.get('special_guests'): return 'ROSTER_MISMATCH'
    if fid=='buff-inventory' and (not isinstance(value,list) or sorted(value)!=tree_names(season)): return 'INVENTORY_MISMATCH'
    if fid.endswith('-costs') and (not isinstance(value,dict) or not {'1','2','3','4','modifiers'}<=set(value)): return 'FOUR_LEVEL_COSTS_REQUIRED'
    if fid=='opening-blessing' and (not isinstance(value,dict) or not {'hp_pct','attack_pct','defense_pct','scope'}<=set(value)): return 'OPENING_ATTRIBUTE_FIELDS_REQUIRED'
    if fid=='buff-progression' and (not isinstance(value,dict) or value.get('max_level')!=4 or not {'1','2','3','4'}<=set(value.get('levels',{}))): return 'FOUR_LEVEL_PROGRESSION_REQUIRED'
    if fid.endswith('-configuration'):
        fields={'enemy','enemy_level','hp','clear_seconds','star_seconds'} if fid.startswith('act-') else {'enemy','enemy_level','enemy_count','simultaneous_enemies','completion','countdown_seconds','star_seconds'}
        if not isinstance(value,dict) or not fields<=set(value): return 'CONFIGURATION_FIELDS_REQUIRED'
    if any(fid==t+'-'+s for t in tree_names(season) for s in SUFFIXES):
        if not isinstance(value,dict) or not all(k in value for k in ('trigger','effects','limits')): return 'BUFF_FIELDS_REQUIRED'
    sources={s.get('url'):s for s in season.get('sources',[]) if isinstance(s,dict)}
    evs=f.get('evidence',[])
    if not evs: return 'EVIDENCE_LOCATOR_REQUIRED'
    for ev in evs:
        source=sources.get(ev.get('source'))
        if not source or ev.get('source') not in f.get('sources',[]) or not ev.get('locator'): return 'UNREGISTERED_OR_UNLOCATED_EVIDENCE'
        if ev.get('season_id')!=season.get('id') or source.get('content_season')!=season.get('id'): return 'SOURCE_CYCLE_MISMATCH'
        try:
            reviewed=date.fromisoformat(ev['reviewed_at']); accessed=date.fromisoformat(source['accessed_at'])
        except (KeyError,ValueError,TypeError): return 'EVIDENCE_DATE_REQUIRED'
        if not reviewed<=accessed<=today or (today-reviewed).days>MAX_AGE_DAYS: return 'STALE_OR_FUTURE_EVIDENCE'
    if set(f.get('sources',[]))!={ev['source'] for ev in evs}: return 'UNCOVERED_SOURCE'
    return None


def assess(season, *, required=(), today=None):
    today=today or date.today()
    public=[];live=[]
    expected=requirements(season)
    issues={fid:_issue(season,fid,today) for fid in set(expected)|set(required)}
    for fid in expected:
        reason=issues[fid]
        # A public requirement cannot be relabelled live to evade research.
        if reason: public.append(dict(fact_id=fid,reason=reason))
        elif season['facts'][fid].get('knowledge_class')!='public': public.append(dict(fact_id=fid,reason='PUBLIC_REQUIRED'))
    for fid,f in season.get('facts',{}).items():
        if f.get('knowledge_class')=='live' and f.get('status') not in ('verified','guide_supported'): live.append(fid)
    blockers=[dict(fact_id=fid,reason=issues[fid]) for fid in required if issues[fid]]
    research=season.get('research',{})
    policy_issue=None
    if research.get('profile')!='theater-monthly-v1' or len(season.get('allowed_elements',[]))!=3 or len(tree_names(season))!=3:
        policy_issue='RESEARCH_PROFILE_OR_ELEMENT_INVENTORY_REQUIRED'
    try:
        if not date.fromisoformat(season['starts_at'])<=today<date.fromisoformat(season['ends_at']): policy_issue='SEASON_OUT_OF_DATE'
    except (KeyError,ValueError,TypeError): policy_issue='SEASON_DATES_REQUIRED'
    # Public research is retryable debt, never silently reclassified as live.
    retry=research.get('retry_after',today.isoformat())
    try: retry_due=date.fromisoformat(retry)<=today
    except (ValueError,TypeError): retry_due=True
    debt=bool(public or policy_issue)
    try:
        last=date.fromisoformat(research['reviewed_at'])
        retry_due=retry_due or today>=last+timedelta(days=1) or last>today
    except (KeyError,ValueError,TypeError): retry_due=True
    retry_due=retry_due or any(g['reason']=='STALE_OR_FUTURE_EVIDENCE' for g in public)
    return dict(status='PARTIAL_PUBLIC' if debt else 'PUBLIC_READY',
                decision_ready=(not blockers and not policy_issue) if required else not debt,
                research_required=debt,
                research_due=debt and retry_due,
                public_covered=len(expected)-len(public),public_expected=len(expected),
                public_gaps=public,live_unknowns=sorted(live),decision_blockers=blockers,
                policy_issue=policy_issue,retry_after=retry,
                next_action='RESEARCH_SEASON' if debt else 'CONTINUE',
                semantic_review_required=True)


def main():
    import argparse
    p=argparse.ArgumentParser();p.add_argument('season');p.add_argument('--strict',action='store_true')
    p.add_argument('--today');p.add_argument('--mechanics',action='store_true');args=p.parse_args()
    s=json.loads(Path(args.season).read_text(encoding='utf-8'))
    r=assess(s,required=[x+'-mechanic' for x in FIXED] if args.mechanics else (),today=date.fromisoformat(args.today) if args.today else None)
    print(json.dumps(r,ensure_ascii=False,indent=2))
    return 2 if (args.strict and r['research_required']) or (args.mechanics and not r['decision_ready']) else 0

if __name__=='__main__':
    raise SystemExit(main())
