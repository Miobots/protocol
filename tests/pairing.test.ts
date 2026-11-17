import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Kind, Topics, TopicKind, isPairConfirmPayload, isPairPayload } from '../src/index.ts';

describe('pairing topics (G0.2)', () => {
  it('are commands', () => {
    assert.equal(TopicKind[Topics.SYS_PAIR], Kind.CMD);
    assert.equal(TopicKind[Topics.SYS_PAIR_CONFIRM], Kind.CMD);
  });

  it('accept exactly six digits', () => {
    const pair = { device_id: 'laptop-1', code: '418902', name: 'stb-laptop', protocol_version: 1 };
    assert.ok(isPairPayload(pair));
    assert.ok(isPairConfirmPayload({ code: '000123' }));
    for (const code of ['41890', '4189023', '41 890', 'abcdef', 418902]) {
      assert.equal(isPairPayload({ ...pair, code }), false, `pair ${code}`);
      assert.equal(isPairConfirmPayload({ code }), false, `confirm ${code}`);
    }
  });

  it('refuse a pair request without a device id or name', () => {
    assert.equal(isPairPayload({ code: '418902', name: 'x', protocol_version: 1 }), false);
    assert.equal(isPairPayload({ device_id: 'd', code: '418902', protocol_version: 1 }), false);
  });
});
