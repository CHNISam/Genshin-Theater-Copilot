"""Bounded trials, measured convergence and reviewed reroutes; no game simulation."""
import hashlib
import json
from pathlib import Path

POLICY = json.loads((Path(__file__).resolve().parents[1] / 'policies/convergence.json').read_text(encoding='utf-8'))


def strategy_key(fight):
    """Exclude labels/commentary. These fields describe actual execution changes."""
    material = {key: fight.get(key) for key in ('team', 'rotation', 'mechanic_actions', 'builds', 'buffs')}
    material['team'] = sorted(material['team'] or [])
    return hashlib.sha256(json.dumps(material, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def convergence(attempts, reroute_start=0):
    """None authorizes at most ONE more prepared trial; missing data is not progress.

    Budgets are per encounter, across all reroutes. Scores are percent progress at
    the same declared window; they are never extrapolated from longer attempts.
    """
    if attempts and attempts[-1]['result'] == 'pass':
        return 'ENCOUNTER_COMPLETE'
    if len(attempts) >= POLICY['max_attempts'] or sum(a['seconds'] for a in attempts) >= POLICY['max_seconds']:
        return 'TRIAL_BUDGET_EXHAUSTED'
    segment = attempts[reroute_start:]
    best = None
    flat = 0
    metric = None
    for row in segment:
        if row['mechanics_ok'] is not True:
            return 'MECHANIC_FAILED'
        if metric is not None and row['metric'] != metric:
            return 'INCOMPARABLE_METRIC'
        metric = row['metric']
        score = row['score']
        if score is not None and best is not None and score >= best + POLICY['min_gain']:
            flat = 0
        else:
            flat += 1
        if score is not None:
            best = score if best is None else max(best, score)
        if flat >= POLICY['flat_failures']:
            return 'REPEATED_NON_CONVERGENCE'
    return None


def validate_reroute(old, new, review, available, used):
    if strategy_key(old) == strategy_key(new):
        return 'NO_MATERIAL_CHANGE'
    evidence_id = review.get('evidence_id')
    if evidence_id not in available or evidence_id in used:
        return 'NEW_EVIDENCE_REQUIRED'
    if review.get('reviewed') is not True or any(not isinstance(review.get(k), str) or not review[k].strip()
            for k in ('bottleneck', 'comparison', 'hypothesis')):
        return 'REVIEW_REQUIRED'
    return None
