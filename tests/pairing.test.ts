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

describe('sys.devices (S9.2)', () => {
  it('is an event listing paired laptops', async () => {
    const { isDevicesPayload } = await import('../src/index.ts');
    assert.equal(TopicKind[Topics.SYS_DEVICES], Kind.EVT);
    const device = { device_id: 'stb-laptop', name: 'stb-laptop', paired_at: '2026-11-18T03:38:05Z', online: true };
    assert.ok(isDevicesPayload({ devices: [device] }));
    assert.ok(isDevicesPayload({ devices: [] }));
    assert.equal(isDevicesPayload({ devices: [{ ...device, online: 'yes' }] }), false);
    assert.equal(isDevicesPayload({}), false);
  });
});

describe('sys.push_token', () => {
  it('accepts an Expo push token or an empty one, and nothing else', async () => {
    const { isPushTokenPayload } = await import('../src/index.ts');
    assert.equal(TopicKind[Topics.SYS_PUSH_TOKEN], Kind.CMD);
    assert.ok(isPushTokenPayload({ token: 'ExponentPushToken[abc_DEF-123]', platform: 'android' }));
    assert.ok(isPushTokenPayload({ token: 'ExpoPushToken[abc]', platform: 'ios' }));
    assert.ok(isPushTokenPayload({ token: '', platform: 'android' }));
    assert.equal(isPushTokenPayload({ token: 'https://evil.example/hook', platform: 'android' }), false);
    assert.equal(isPushTokenPayload({ token: 'ExponentPushToken[abc]', platform: 'web' }), false);
  });
});
