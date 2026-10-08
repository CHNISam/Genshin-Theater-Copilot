"""Agent-owned workflow over the existing guard; connector-neutral Sheets journal.

No network, model, CLI or backend dependency. A checkpoint hash detects accidental
corruption, not malicious edits. Append detects forks; it is not a server CAS lock.
"""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from . import harness

HEADERS = ['commit_id', 'run_id', 'parent_id', 'revision', 'saved_at', 'mode',
           'phase', 'summary'] + [f'json_{n}' for n in range(1, 9)]


def _require(ok, message):
    if not ok:
        raise ValueError(message)


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def _digest(value):
    return hashlib.sha256(_json(value).encode('utf-8')).hexdigest()


def validate(snapshot):
    try:
        _require(snapshot['snapshot_version'] == 1, 'unsupported snapshot')
        _require(_text(snapshot['run_id']) and _text(snapshot['code_ref']), 'run identity/code ref required')
        _require(snapshot['mode'] in ('live', 'demo'), 'invalid mode')
        _require(snapshot['phase'] in ('intake', 'active'), 'invalid phase')
        _require(isinstance(snapshot['unknowns'], list) and all(_text(x) for x in snapshot['unknowns']), 'invalid unknowns')
        _require(_text(snapshot['next_action']), 'next action required')
        _require(isinstance(snapshot['observations'], list), 'observations required')
        for item in snapshot['observations']:
            _require(item['kind'] in ('observed', 'proposed', 'unknown') and
                     _text(item['source']) and _text(item['text']), 'invalid observation')
        run = snapshot['harness']
        if snapshot['phase'] == 'intake':
            _require(run is None, 'intake cannot contain a harness run')
        else:
            harness.validate(run)
            _require(run['run_id'] == snapshot['run_id'] and run['mode'] == snapshot['mode'], 'run identity/mode mismatch')
        _json(snapshot)
    except (KeyError, TypeError, AttributeError) as exc:
        raise ValueError('malformed agent snapshot: ' + str(exc)) from exc


def intake(run_id, mode, code_ref, observation, unknowns, next_action):
    snapshot = dict(snapshot_version=1, run_id=run_id, mode=mode, code_ref=code_ref,
                    phase='intake', harness=None, observations=[deepcopy(observation)],
                    unknowns=deepcopy(unknowns), next_action=next_action)
    validate(snapshot)
    return snapshot


def observe(snapshot, observation, *, unknowns=None, next_action=None):
    validate(snapshot)
    result = deepcopy(snapshot)
    result['observations'].append(deepcopy(observation))
    if unknowns is not None:
        result['unknowns'] = deepcopy(unknowns)
    if next_action is not None:
        result['next_action'] = next_action
    validate(result)
    return result


def activate(snapshot, run):
    validate(snapshot)
    _require(snapshot['phase'] == 'intake', 'cannot reset an active run')
    result = deepcopy(snapshot)
    result.update(phase='active', harness=deepcopy(run))
    if run['mode']=='live':
        result['next_action']=harness.check(run)['next_action']
    validate(result)
    return result


def research_status(snapshot, season=None):
    """Host calls on first contact/restore and before public-data decisions."""
    validate(snapshot)
    pack=season if season is not None else (snapshot['harness']['season'] if snapshot['harness'] else None)
    _require(pack is not None, 'intake requires current public season pack')
    return harness.assess(pack)


def act(snapshot, operation, payload=None):
    """Return a fresh snapshot + report; failed guard calls never mutate the input."""
    validate(snapshot)
    _require(snapshot['phase'] == 'active', 'complete intake before guarded actions')
    result = deepcopy(snapshot)
    run = result['harness']
    if operation == 'check':
        report = harness.check(run)
    elif operation == 'authorize':
        report = harness.authorize(run)
    elif operation == 'record':
        report = harness.record(run, payload)
    elif operation == 'next_fight':
        harness.next_fight(run, payload['fight'], payload['evidence'])
        report = harness.check(run)
    elif operation in ('sync', 'purchase', 'prepare', 'reroute', 'refresh_season'):
        getattr(harness, operation)(run, payload)
        report = harness.check(run)
    else:
        raise ValueError('unsupported operation')
    result['next_action'] = ('RECORD_PENDING_RESULT' if run['pending'] else report['next_action'])
    validate(result)
    return result, report


def _validate_record(record):
    try:
        validate(record['snapshot'])
        _require(type(record['revision']) is int and record['revision'] > 0, 'invalid revision')
        _require(isinstance(record['parent_id'], str) and _text(record['saved_at']) and isinstance(record['summary'], str), 'invalid checkpoint metadata')
        body = {k: v for k, v in record.items() if k != 'commit_id'}
        _require(record['commit_id'] == _digest(body), 'checkpoint integrity mismatch')
    except (KeyError, TypeError, AttributeError) as exc:
        raise ValueError('malformed checkpoint: ' + str(exc)) from exc


def _split(text):
    # Google cell lengths use UTF-16; astral characters count twice.
    chunks, chunk, units = [], [], 0
    for char in text:
        width = 2 if ord(char) > 0xffff else 1
        if units + width > 30000:
            chunks.append(''.join(chunk)); chunk, units = [], 0
        chunk.append(char); units += width
    if chunk:
        chunks.append(''.join(chunk))
    _require(len(chunks) <= 8, 'checkpoint capacity exceeded; do not truncate history')
    return chunks + [''] * (8 - len(chunks))


def checkpoint(snapshot, parent=None, *, summary=''):
    """Encode a full immutable checkpoint as 16 literal cell values."""
    validate(snapshot)
    if parent is not None:
        _validate_record(parent)
        previous = parent['snapshot']
        for field in ('run_id', 'mode', 'code_ref'):
            _require(snapshot[field] == previous[field], 'checkpoint identity/ref change')
        _require(not (previous['phase'] == 'active' and snapshot['phase'] == 'intake'), 'cannot reset an active run')
        # Preserve observed provenance and all executed history at save boundaries.
        _require(snapshot['observations'][:len(previous['observations'])] == previous['observations'], 'observation history rewritten')
        if previous['harness'] is not None:
            old, new = previous['harness'], snapshot['harness']
            for field in ('attempts', 'reroutes', 'audit'):
                _require(new[field][:len(old[field])] == old[field], 'execution history rewritten')
            _require(set(old['completed']) <= set(new['completed']), 'completion history rewritten')
            _require(old['objective'] == new['objective'] and old['season']['id'] == new['season']['id'], 'objective/season rewritten')
            if old['season'] != new['season']:
                _require(any(a.get('kind') == 'season-refresh' for a in new['audit'][len(old['audit']):]), 'unaudited season refresh')
            if old['pending'] is not None:
                if new['pending'] is not None:
                    _require(new == old, 'pending trial state changed without recording')
                else:
                    _require(len(new['attempts']) == len(old['attempts']) + 1, 'pending trial discarded')
                    outcome = new['attempts'][-1]
                    replay = deepcopy(old)
                    harness.record(replay, {k: outcome[k] for k in
                        ('result', 'score', 'seconds', 'mechanics_ok', 'reason', 'observation')})
                    replay['attempts'][-1]['recorded_at'] = outcome['recorded_at']
                    _require(replay == new, 'pending result does not match guarded record')

    record = dict(snapshot=deepcopy(snapshot), parent_id=parent['commit_id'] if parent else '',
                  revision=parent['revision'] + 1 if parent else 1,
                  saved_at=datetime.now(timezone.utc).isoformat(), summary=summary)
    record['commit_id'] = _digest(record)
    return _row(record)


def _row(record):
    snapshot = record['snapshot']
    return [record['commit_id'], snapshot['run_id'], record['parent_id'], str(record['revision']),
            record['saved_at'], snapshot['mode'], snapshot['phase'], record['summary']] + _split(_json(record))


def restore(rows, run_id):
    """Read complete journal pages in append order. Reject gaps/forks; no latest-wins."""
    head = None
    seen = {}
    for row in rows:
        if not row or row == HEADERS:
            continue
        _require(isinstance(row, list), 'invalid journal row')
        _require(8 < len(row) <= 16 and all(isinstance(x, str) for x in row), 'invalid checkpoint cells')
        try:
            record = json.loads(''.join(row[8:]))
        except (ValueError, TypeError) as exc:
            raise ValueError('invalid checkpoint JSON') from exc
        _validate_record(record)
        _require((row + [''] * (16 - len(row))) == _row(record), 'checkpoint cells/metadata mismatch')
        if record['snapshot']['run_id'] != run_id:
            continue
        cid = record['commit_id']
        if cid in seen:
            _require(record == seen[cid], 'duplicate checkpoint mismatch')
            continue
        _require(record['parent_id'] == (head['commit_id'] if head else '') and
                 record['revision'] == (head['revision'] + 1 if head else 1), 'journal conflict or missing parent')
        if head is not None:
            # Reuse save boundary checks without requiring a new timestamp/hash.
            checkpoint(record['snapshot'], head, summary=record['summary'])
        seen[cid] = record
        head = record
    _require(head is not None, 'run not found')
    return head


def append_request(sheet_id, row):
    _require(type(sheet_id) is int and sheet_id >= 0 and len(row) == 16, 'invalid append target/row')
    return {'appendCells': {'sheetId': sheet_id, 'rows': [{'values': [
        {'userEnteredValue': {'stringValue': value}, 'userEnteredFormat': {'wrapStrategy': 'CLIP'}}
        for value in row]}], 'fields': 'userEnteredValue,userEnteredFormat.wrapStrategy'}}
