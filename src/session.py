"""Small host adapter for literal Sheets IO, selection, idempotent save/readback.

The host supplies actual connector reads/writes. No network clients or services.
"""
from . import agent_state as state

def cell_rows(rows):
    """Decode Sheets CellData; reject computed/non-text journal cells."""
    out=[]
    for row in rows:
        values=[]
        for cell in row:
            value=cell.get('userEnteredValue',{})
            state._require(not value or set(value)=={'stringValue'},'journal requires literal text cells')
            values.append(value.get('stringValue',''))
        if any(values):out.append(values)
    return out

def discover(rows, *, mode=None):
    state._require(bool(rows) and rows[0]==state.HEADERS,'journal header mismatch or incomplete read')
    ids=[]
    for row in rows[1:]:
        if row and any(row):
            state._require(len(row)>8,'incomplete journal row')
            if row[1] not in ids:ids.append(row[1])
    heads=[state.restore(rows,rid) for rid in ids]
    return [{'run_id':h['snapshot']['run_id'],'mode':h['snapshot']['mode'],'phase':h['snapshot']['phase'],
             'revision':h['revision'],'summary':h['summary'],'code_ref':h['snapshot']['code_ref']} for h in heads
            if mode is None or h['snapshot']['mode']==mode]

def prepare_save(snapshot, rows, parent, *, summary='', retry_row=None):
    discover(rows)
    exists=any(len(r)>1 and r[1]==snapshot['run_id'] for r in rows[1:])
    head=state.restore(rows,snapshot['run_id']) if exists else None
    if retry_row is not None and head and head['commit_id']==retry_row[0]:
        state._require(head['snapshot']==snapshot,'retry snapshot changed')
        return retry_row
    state._require((head['commit_id'] if head else None)==(parent['commit_id'] if parent else None),'cloud head changed; restore and recompute')
    if retry_row is not None:
        restored=state.restore(rows+[retry_row],snapshot['run_id'])
        state._require(restored['snapshot']==snapshot,'retry snapshot changed')
        return retry_row
    return state.checkpoint(snapshot,parent,summary=summary)

def confirm_save(rows, sent_row):
    discover(rows)
    head=state.restore(rows,sent_row[1])
    state._require(head['commit_id']==sent_row[0],'save not confirmed at current head; do not execute')
    return head
