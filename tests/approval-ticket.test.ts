import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, isApprovalTicket } from '../src/index.ts';

describe('approval ticket (BRAIN_DECISIONS 27)', () => {
  it('canonicalJson ignores key order at every level', () => {
    assert.equal(
      canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: 'x' } }),
      canonicalJson({ a: { c: 'x', d: [3, { x: 2, y: 1 }] }, b: 1 }),
    );
    assert.equal(canonicalJson({ b: 1, a: 'x' }), '{"a":"x","b":1}');
  });

  it('canonicalJson keeps array order and scalars', () => {
    assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
    assert.equal(canonicalJson(null), 'null');
    assert.equal(canonicalJson('a"b'), '"a\\"b"');
  });

  it('accepts a well-formed ticket and refuses a malformed one', () => {
    const ticket = { approval_id: 'ap-1', approved_by: 'synapse-app', tool: 'open_app_or_url', args_sha256: 'a'.repeat(64), expires_at: 1 };
    assert.ok(isApprovalTicket(ticket));
    assert.equal(isApprovalTicket({ ...ticket, args_sha256: 'xyz' }), false);
    assert.equal(isApprovalTicket({ ...ticket, approved_by: '' }), false);
  });
});
