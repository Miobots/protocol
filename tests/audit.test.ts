import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAuditRequestPayload, isAuditView, isDevicesPayload, Topics, TopicKind, Kind } from '../src/index.ts';

const row = { id: 1, at_ms: 1, event: 'tool_call', tool: 'open_app_or_url', args: { target: 'calculator' }, approved_by: 'synapse-app', prev_hash: '', hash: 'ab' };

describe('sys.audit (B5.4, S5.2)', () => {
  it('is a CMD from the app', () => {
    assert.equal(Topics.SYS_AUDIT, 'sys.audit');
    assert.equal(TopicKind[Topics.SYS_AUDIT], Kind.CMD);
  });

  it('accepts an empty request or a positive limit', () => {
    assert.ok(isAuditRequestPayload({}));
    assert.ok(isAuditRequestPayload({ limit: 50 }));
    assert.ok(!isAuditRequestPayload({ limit: 0 }));
    assert.ok(!isAuditRequestPayload(null));
  });

  it('accepts a log view and rejects a malformed row', () => {
    assert.ok(isAuditView({ entries: [row, { id: 2, at_ms: 2, event: 'killswitch_on', prev_hash: 'ab', hash: 'cd' }], chain: { ok: false, checked: 2, first_bad_id: 2 } }));
    assert.ok(!isAuditView({ entries: [{ ...row, event: 'deleted' }], chain: { ok: true, checked: 1 } }));
    assert.ok(!isAuditView({ entries: [{ ...row, hash: '' }], chain: { ok: true, checked: 1 } }));
    assert.ok(!isAuditView({ entries: [row] }));
    assert.ok(isAuditView({ entries: [{ ...row, event: 'approval_rejected' }, { ...row, id: 2, event: 'approval_unanswered', approved_by: undefined }], chain: { ok: true, checked: 2 } }));
  });

  it('lets sys.devices carry the kill switch state', () => {
    assert.ok(isDevicesPayload({ devices: [], killswitch_active: true }));
    assert.ok(!isDevicesPayload({ devices: [], killswitch_active: 'yes' }));
  });
});
