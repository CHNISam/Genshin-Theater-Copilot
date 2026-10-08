"""Single operator workflow: validated JSON + strategic and current-fight gates."""
from copy import deepcopy
from datetime import date, datetime, timezone
from functools import wraps
import hashlib
import json
import math
from . import execution_review
from .season_readiness import assess, decision_requirements, mechanic_requirements, requirements, FOUNDATION
from .fight_guard import convergence, strategy_key, validate_reroute
from .theater_guard import Checkpoint, PlanOption, status_after_use, route_status, rank_recruit_candidates


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _integer(value, minimum=0):
    return type(value) is int and value >= minimum


def _number(value, minimum, maximum):
    return type(value) in (int, float) and math.isfinite(value) and minimum <= value <= maximum


def _stamp():
    return datetime.now(timezone.utc).isoformat()


def _hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def validate_season(season):
    try:
        _require(_text(season['id']), 'season id required')
        _require(date.fromisoformat(season['starts_at']) < date.fromisoformat(season['ends_at']), 'invalid season dates')
        _require(isinstance(season['facts'], dict) and isinstance(season['encounters'], dict), 'invalid season maps')
        for fid, fact in season['facts'].items():
            _require(_text(fid) and fact['status'] in ('verified','guide_supported','unknown','conflict'), 'invalid fact status')
            _require(fact['season_id'] == season['id'], 'cross-season fact')
            _require(isinstance(fact['sources'], list), 'fact sources must be a list')
            if fact['status'] in ('verified','guide_supported'):
                _require(bool(fact['sources']) and all(_text(x) for x in fact['sources']) and fact['value'] is not None, 'supported fact requires value and sources')
        for encounter, fact_ids in season['encounters'].items():
            _require(_text(encounter) and isinstance(fact_ids,list) and bool(fact_ids), 'encounter needs at least one mechanic fact')
            _require(len(fact_ids)==len(set(fact_ids)) and all(x in season['facts'] for x in fact_ids), 'unknown/duplicate encounter fact')
            for fid in fact_ids:
                fact=season['facts'][fid]
                _require(fact.get('encounter_id')==encounter and isinstance(fact.get('any_of'),list) and bool(fact['any_of']), 'encounter fact scope/capability required')
    except (KeyError,TypeError,AttributeError) as exc:
        raise ValueError('malformed season: '+str(exc)) from exc


def validate(run):
    try:
        _require(run['schema_version']==1 and run['mode'] in ('live','demo') and _text(run['run_id']), 'unsupported run')
        validate_season(run['season'])
        for key in ('objective','completed','unlocked','checkpoints','evidence','attempts','reroutes','audit'):
            _require(isinstance(run[key],list), key+' must be a list')
        _require(0 < len(run['objective']) <= 12 and len(set(run['objective']))==len(run['objective']), 'invalid objective')
        _require(set(run['completed']) <= set(run['objective']) and len(set(run['completed']))==len(run['completed']), 'invalid completion')
        _require(isinstance(run['vigor'],dict) and 0<len(run['vigor'])<=48, 'invalid roster')
        _require(all(_text(k) and _integer(v) for k,v in run['vigor'].items()), 'vigor must be nonnegative integers')
        _require(set(run['unlocked']) <= set(run['vigor']) and len(set(run['unlocked']))==len(run['unlocked']), 'invalid unlocked roster')
        _require(_integer(run['flowers']) and _integer(run['rerolls']), 'invalid resources')
        _require(isinstance(run['buffs'],dict) and isinstance(run['capabilities'],dict), 'invalid account/buffs')
        for character, capability in run['capabilities'].items():
            _require(character in run['vigor'] and isinstance(capability,dict), 'invalid capability character/object')
            tags=capability.get('tags')
            _require(isinstance(tags,list) and all(_text(tag) for tag in tags) and len(set(tags))==len(tags), 'capability tags must be exact text list')
            _require(_text(capability.get('build')) and _text(capability.get('source')), 'capability needs current build/source')
        names=[]
        for checkpoint in run['checkpoints']:
            names.append(checkpoint['id'])
            _require(isinstance(checkpoint['options'],list) and len(checkpoint['options'])<=20, 'invalid checkpoint options')
            for option in checkpoint['options']:
                costs=option['consumes']
                _require(_text(option['name']) and isinstance(costs,dict) and bool(costs), 'empty strategic option')
                _require(all(c in run['vigor'] and _integer(n,1) for c,n in costs.items()), 'invalid strategic cost/character')
        _require(len(set(names))==len(names), 'duplicate checkpoint')
        fight=run['fight']
        if fight is not None:
            _require(isinstance(fight,dict) and fight['encounter_id'] in run['objective'], 'invalid current encounter')
            for key in ('team','evidence_ids','buff_fact_ids'):
                values=fight.get(key,[])
                _require(isinstance(values,list) and all(_text(x) for x in values), key+' must be a text list')
            _require(isinstance(fight.get('mechanic_actions',{}),dict) and isinstance(fight.get('metric',{}),dict), 'invalid mechanic/metric containers')
            for action in fight.get('mechanic_actions',{}).values():
                _require(isinstance(action,dict) and isinstance(action.get('providers',[]),list) and all(_text(c) for c in action.get('providers',[])), 'invalid mechanic providers')
            if fight['encounter_id'] not in run['completed']:
                names.append(fight['encounter_id'])
        _require(set(names).isdisjoint(run['completed']) and len(set(names))==len(names), 'overlapping current/future/completed')
        _require(set(names)|set(run['completed'])==set(run['objective']), 'objective coverage missing')
        ids=[]
        for ev in run['evidence']:
            ids.append(ev['id'])
            _require(all(_text(ev.get(k)) for k in ('id','source','kind','season_id','encounter_id','objective','comparison')), 'malformed evidence')
            _require(type(ev.get('reviewed')) is bool, 'reviewed must be boolean')
        _require(len(ids)==len(set(ids)), 'duplicate evidence id')
        for row in run['attempts']:
            _require(row['encounter_id'] in run['objective'] and row['result'] in ('pass','fail','aborted'), 'invalid attempt')
            _require(row['score'] is None or _number(row['score'],0,100), 'invalid progress score')
            _require(_number(row['seconds'],1,86400), 'invalid elapsed time')
            _require(row['mechanics_ok'] is None or type(row['mechanics_ok']) is bool, 'invalid mechanic observation')
            _require(isinstance(row['material'],dict) and strategy_key(row['material'])==row['plan_key'], 'attempt material/key mismatch')
            _require(_text(row['plan_key']) and _integer(row['metric']['window_seconds'],1) and _text(row['metric']['id']), 'invalid attempt metric/key')
        _require(run['pending'] is None or isinstance(run['pending'],dict), 'invalid trial ticket')
    except (KeyError,TypeError,AttributeError) as exc:
        raise ValueError('malformed run: '+str(exc)) from exc


def _effective(run, fight=None):
    fight=deepcopy(fight or run['fight'])
    fight['builds']={c:run['capabilities'].get(c) for c in fight.get('team',[])}
    fight['buffs']=run['buffs']
    return fight


def _snapshot(run):
    return _hash({k:v for k,v in run.items() if k not in ('audit','pending')})


def _episode(run):
    return [a for a in run['attempts'] if a['encounter_id']==run['fight']['encounter_id']]


def _start(run):
    reviews=[r for r in run['reroutes'] if r['encounter_id']==run['fight']['encounter_id']]
    return reviews[-1]['start'] if reviews else 0


def _checkpoints(run):
    return [Checkpoint(p['id'],tuple(PlanOption.from_mapping(o['name'],o['consumes']) for o in p['options'])) for p in run['checkpoints']]


def check(run):
    validate(run)
    reasons=[]; warnings=[]
    fight=run['fight']
    readiness=None; public_blockers=[];live_blockers=[]
    if run['mode']=='live':
        buff_ids=list(fight.get('buff_fact_ids',[])) if fight else []
        # Ownership is recorded even when an effect is not used as a decision premise.
        # Only explicitly relied-on effects need full current contracts.
        if set(run['buffs'])-set(buff_ids): warnings.append('ACQUIRED_BUFFS_NOT_USED_AS_BASIS')
        scoped=list(FOUNDATION)+decision_requirements(run['season'],fight.get('encounter_id') if fight else None,buff_ids)
        readiness=assess(run['season'],required=scoped)
        public_blockers=[g for g in readiness['decision_blockers'] if g['reason']!='LIVE_OBSERVATION_REQUIRED']
        live_blockers=[g for g in readiness['decision_blockers'] if g['reason']=='LIVE_OBSERVATION_REQUIRED']
        reasons.extend('SEASON_RESEARCH_REQUIRED:'+g['fact_id']+':'+g['reason'] for g in public_blockers)
        if readiness['policy_issue']: reasons.append('SEASON_RESEARCH_REQUIRED:'+readiness['policy_issue'])
        if readiness['research_required']: warnings.append('PUBLIC_RESEARCH_DEBT')
    if fight is None:
        return dict(status='BLOCKED',route='UNKNOWN',reasons=reasons+['FIGHT_CONTRACT_REQUIRED'],warnings=warnings,season_readiness=readiness,next_action='RESEARCH_SEASON' if public_blockers or (readiness and readiness['policy_issue']) else 'PREPARE_CONTRACT')
    if fight['encounter_id'] in run['completed']:
        route=route_status(run['vigor'],_checkpoints(run),set(run['unlocked']),set(run['vigor'])).name
        return dict(status='COMPLETE',route=route,reasons=['ENCOUNTER_COMPLETE'],warnings=[],next_action='NEXT_ENCOUNTER_OR_FINISH',season_readiness=readiness)
    team=fight.get('team',[])
    team_ok=isinstance(team,list) and len(team)==4 and len(set(team))==4 and all(c in run['unlocked'] and run['vigor'].get(c,0)>0 for c in team)
    if not team_ok: reasons.append('TEAM_UNAVAILABLE_OR_NOT_FOUR')
    route=status_after_use(run['vigor'],team,_checkpoints(run),set(run['unlocked']),set(run['vigor'])).name if team_ok else 'BROKEN'
    if route=='BROKEN': reasons.append('FUTURE_ROUTE_BROKEN')
    if route=='CONDITIONAL': warnings.append('FUTURE_REQUIRES_RANDOM_RECRUITMENT')
    if run['mode']=='demo': warnings.append('SYNTHETIC_DEMO_NOT_GAME_FACTS')
    elif not (run['season']['starts_at']<=date.today().isoformat()<run['season']['ends_at']): reasons.append('SEASON_OUT_OF_DATE')
    encounter=fight['encounter_id']
    if encounter=='act-10' and (set(run['objective']) & {'card-1','card-2'})-set(run['completed']):
        reasons.append('FINISH_WOULD_SKIP_REQUIRED_CARDS')
    if encounter in run['completed']: reasons.append('ENCOUNTER_COMPLETE')
    required=mechanic_requirements(run['season'],encounter) if run['mode']=='live' else run['season']['encounters'].get(encounter)
    if not required: reasons.append('ENCOUNTER_FACTS_REQUIRED')
    actions=fight.get('mechanic_actions',{})
    if not isinstance(actions,dict): actions={}
    for fid in (required or []) + fight.get('buff_fact_ids',[]):
        fact=run['season']['facts'].get(fid)
        if not fact or fact['status'] not in ('verified','guide_supported'):
            reasons.append('FACT_UNVERIFIED:'+fid); continue
        if fact['status']=='guide_supported': warnings.append('GUIDE_SUPPORTED:'+fid)
        if fid not in (required or []): continue
        action=actions.get(fid,{})
        providers=action.get('providers',[]); capability=action.get('capability')
        if not providers or capability not in fact['any_of'] or not _text(action.get('execution')) or not all(
                c in team and capability in run['capabilities'].get(c,{}).get('tags',[]) and
                _text(run['capabilities'][c].get('source')) and _text(run['capabilities'][c].get('build')) for c in providers):
            reasons.append('MECHANIC_UNCOVERED:'+fid)
    for key in ('damage','sustain','rotation','risks'):
        if not _text(fight.get(key)): reasons.append('CONTRACT_REQUIRED:'+key)
    metric=fight.get('metric',{})
    if not isinstance(metric,dict) or not _text(metric.get('id')) or not _integer(metric.get('window_seconds'),1): reasons.append('COMPARABLE_METRIC_REQUIRED')
    evidence={ev['id']:ev for ev in run['evidence']}
    refs=fight.get('evidence_ids',[])
    if not refs: reasons.append('CURRENT_CLEAR_REFERENCE_REQUIRED')
    for eid in refs:
        ev=evidence.get(eid)
        if not ev or ev['reviewed'] is not True or ev['season_id']!=run['season']['id'] or ev['encounter_id']!=encounter or ev['objective']!=encounter or ev['kind'] not in ('clear-reference','live-observation'):
            reasons.append('EVIDENCE_NOT_APPLICABLE:'+eid)
    execution_basis='synthetic';capability_route=route
    if run['mode']=='live':
        execution_reasons,execution_basis=execution_review.current(run,_effective(run))
        reasons.extend(execution_reasons)
        capability_route,uncertain=execution_review.future(run,team) if team_ok else ('BROKEN',[])
        if capability_route=='BROKEN': reasons.append('FUTURE_CAPABILITY_ROUTE_BROKEN')
        if capability_route=='CONDITIONAL' and 'FUTURE_REQUIRES_RANDOM_RECRUITMENT' not in warnings: warnings.append('FUTURE_REQUIRES_RANDOM_RECRUITMENT')
        if uncertain: warnings.append('FUTURE_ACCOUNT_CAPABILITY_UNCERTAIN')
        if execution_basis=='bounded-probe': warnings.append('BOUNDED_PROBE_NOT_CLEAR_PREDICTION')
    attempts=_episode(run)
    start=_start(run)
    reviews=[r for r in run['reroutes'] if r['encounter_id']==encounter]
    expected=reviews[-1]['plan_key'] if reviews and start==len(attempts) else (attempts[-1]['plan_key'] if attempts else None)
    if expected and strategy_key(_effective(run))!=expected: reasons.append('UNREVIEWED_PLAN_CHANGE')
    if attempts[start:] and metric!=attempts[-1]['metric']: reasons.append('INCOMPARABLE_METRIC')
    stop=convergence(attempts,start)
    if stop and stop not in reasons: reasons.append(stop)
    if run['pending'] is not None: reasons.append('TRIAL_ALREADY_AUTHORIZED_RECORD_RESULT')
    return dict(status='BLOCKED' if reasons else ('WARN' if warnings else 'READY'),route=route,reasons=reasons,warnings=warnings,
                next_action=('RECORD_PENDING_RESULT' if run['pending'] else ('RESEARCH_SEASON' if public_blockers or (readiness and readiness['policy_issue']) else ('OBSERVE_CURRENT_STATE' if live_blockers else ('RESEARCH_OR_REPLAN' if reasons else 'ONE_PREPARED_TRIAL')))),attempts=len(attempts),season_readiness=readiness,
                execution_basis=execution_basis,capability_route=capability_route,clear_prediction=False)


def _transaction(fn):
    @wraps(fn)
    def execute(run,*args,**kwargs):
        validate(run)
        work=deepcopy(run)
        result=fn(work,*args,**kwargs)
        validate(work)
        run.clear(); run.update(work)
        return result
    return execute


def _idle(run):
    _require(run['pending'] is None,'record the pending trial before changing state')


@_transaction
def authorize(run):
    report=check(run)
    _require(report['status'] in ('READY','WARN'),'BLOCKED: '+', '.join(report['reasons']))
    run['pending']={'snapshot':_snapshot(run),'fight':deepcopy(run['fight']), 'plan_key':strategy_key(_effective(run)), 'material':deepcopy(_effective(run)), 'authorized_at':_stamp()}
    return report


@_transaction
def record(run,result):
    pending=run['pending']
    _require(pending is not None,'trial authorization required')
    _require(pending['snapshot']==_snapshot(run),'state changed after trial authorization')
    _require(result.get('result') in ('pass','fail','aborted'),'result must be pass/fail/aborted')
    _require(_text(result.get('reason')) and _text(result.get('observation')),'reason and observation required')
    score=result.get('score'); seconds=result.get('seconds'); mechanics=result.get('mechanics_ok')
    _require(score is None or _number(score,0,100),'progress must be 0..100 or null')
    _require(_number(seconds,1,86400),'elapsed seconds required')
    _require(mechanics is None or type(mechanics) is bool,'mechanics_ok must be true/false/null')
    fight=pending['fight']
    if result['result']=='pass':
        _require(score==100 and mechanics is True,'pass requires completed objective and handled mechanics')
    else:
        _require(score is None or seconds>=fight['metric']['window_seconds'],'score requires observation at the declared window; use null on early death')
    run['attempts'].append(dict(encounter_id=fight['encounter_id'],plan_key=pending['plan_key'],material=pending['material'],fight=fight,
        metric=fight['metric'],score=score,seconds=seconds,mechanics_ok=mechanics,result=result['result'],
        reason=result['reason'],observation=result['observation'],recorded_at=_stamp(),sources=[e['source'] for e in run['evidence']]))
    run['pending']=None
    if result['result']=='pass':
        for c in fight['team']: run['vigor'][c]-=1
        run['completed'].append(fight['encounter_id'])
    return check(run)


@_transaction
def reroute(run,package):
    _idle(run)
    attempts=_episode(run)
    _require(convergence(attempts,_start(run)) not in ('TRIAL_BUDGET_EXHAUSTED','ENCOUNTER_COMPLETE'),'encounter budget exhausted/completed; end this session')
    new=package['fight']
    _require(new['encounter_id']==run['fight']['encounter_id'],'reroute must keep the encounter and objective')
    incoming=package['evidence']
    known={e['source'] for e in run['evidence']}
    available={e['id'] for e in incoming if e['source'] not in known and e.get('reviewed') is True
        and e.get('season_id')==run['season']['id'] and e.get('encounter_id')==new['encounter_id']
        and e.get('objective')==new['encounter_id'] and e.get('kind') in ('clear-reference','live-observation')
        and e['id'] in new.get('evidence_ids',[])}
    baseline=attempts[-1]['material'] if attempts else _effective(run)
    reason=validate_reroute(baseline,_effective(run,new),package['review'],available,set())
    _require(reason is None,'reroute rejected: '+str(reason))
    run['evidence'].extend(incoming)
    run['fight']=deepcopy(new)
    review=deepcopy(package['review']); review.update(encounter_id=new['encounter_id'],start=len(attempts),plan_key=strategy_key(_effective(run)),at=_stamp())
    run['reroutes'].append(review)
    report=check(run)
    _require(report['status']!='BLOCKED','new contract blocked: '+', '.join(report['reasons']))
    return report


@_transaction
def sync(run,snapshot):
    _idle(run)
    allowed={'vigor','unlocked','flowers','rerolls','buffs','capabilities','checkpoints'}
    _require(set(snapshot)<=allowed,'sync cannot rewrite objective, completions, season, contract or attempt history')
    for k,v in snapshot.items(): run[k]=deepcopy(v)
    run['audit'].append({'kind':'live-sync','fields':sorted(snapshot),'at':_stamp()})


@_transaction
def purchase(run,event):
    _idle(run)
    _require(_integer(event.get('cost')) and event['cost']<=run['flowers'],'insufficient flowers/invalid cost')
    kind=event.get('kind'); eid=event.get('id')
    if kind=='recruit':
        _require(eid in run['vigor'] and eid not in run['unlocked'],'only actual offered standby characters can be recruited')
        run['unlocked'].append(eid)
    elif kind=='buff':
        _require(_text(eid) and _text(event.get('value')),'buff id and observed effect required')
        run['buffs'][eid]=event['value']
    elif kind=='refresh':
        _require(run['rerolls']>0,'no rerolls left'); run['rerolls']-=1
    else: raise ValueError('event kind must be recruit/buff/refresh')
    run['flowers']-=event['cost']
    run['audit'].append({'kind':'observed-event','event':deepcopy(event),'at':_stamp()})


@_transaction
def next_fight(run,fight,evidence):
    _idle(run)
    _require(run['fight'] is None or run['fight']['encounter_id'] in run['completed'],'current objective must be cleared first')
    encounter=fight['encounter_id']
    _require(encounter!='act-10' or not ((set(run['objective']) & {'card-1','card-2'})-set(run['completed'])), 'complete required cards before final encounter')
    _require(encounter in [p['id'] for p in run['checkpoints']],'next encounter must be an outstanding checkpoint')
    run['checkpoints']=[p for p in run['checkpoints'] if p['id']!=encounter]
    run['fight']=deepcopy(fight); run['evidence'].extend(evidence)


def recruits(run,candidates):
    validate(run)
    _require(set(candidates)<=set(run['vigor'])-set(run['unlocked']),'candidate must be an offered standby character')
    return [(c,s.name,n) for c,s,n in rank_recruit_candidates(run['vigor'],_checkpoints(run),set(run['unlocked']),set(run['vigor']),candidates)]


@_transaction
def prepare(run,package):
    _idle(run)
    _require(run['fight'] is not None and not _episode(run), 'prepare only repairs an unexecuted current contract; use reroute after any attempt')
    _require(package['fight']['encounter_id']==run['fight']['encounter_id'], 'prepare must preserve current encounter')
    run['fight']=deepcopy(package['fight']);run['evidence'].extend(deepcopy(package['evidence']))
    run['audit'].append(dict(kind='prepare-contract',at=_stamp()))
    return check(run)


@_transaction
def refresh_season(run, season):
    """Same-season fact correction; never clear attempts or unlock a pending trial."""
    _idle(run)
    validate_season(season)
    _require(season['id'] == run['season']['id'], 'new season needs a new run')
    run['season'] = deepcopy(season)
    run['audit'].append(dict(kind='season-refresh', at=_stamp()))
    return check(run)
