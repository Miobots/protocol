import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  Kind,
  Topics,
  DeviceRole,
  ProtocolErrorCode,
  newEnvelope,
  SequenceCounter,
  encode,
  decode,
  parse,
  type HelloPayload,
} from '../src/index.ts';

describe('Envelope Codec (encode / decode / parse)', () => {
  it('round-trips an envelope through JSON serialization unchanged', () => {
    const original = newEnvelope<typeof Topics.SYS_HELLO, HelloPayload>({
      kind: Kind.CMD,
      topic: Topics.SYS_HELLO,
      payload: {
        device_id: 'heart-01',
        token: 'dev-token',
        protocol_version: 1,
        role: DeviceRole.HEART,
        client_wall_ms: Date.now(),
      },
      idem_key: 'idem-456',
      expires_at: Date.now() + 5000,
      seq: new SequenceCounter(),
    });

    const encoded = encode(original);
    assert.equal(typeof encoded, 'string');

    const decoded = decode<typeof Topics.SYS_HELLO, HelloPayload>(encoded);
    assert.deepEqual(decoded, original);
  });

  it('safely parses valid payloads using parse()', () => {
    const original = newEnvelope({
      kind: Kind.EVT,
      topic: 'sensor.temp',
      payload: { celsius: 24.5 },
      seq: new SequenceCounter(),
    });

    const result = parse(encode(original));
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.topic, 'sensor.temp');
      assert.deepEqual(result.data.payload, { celsius: 24.5 });
    }
  });

  it('returns ProtocolError when parsing malformed JSON', () => {
    const result = parse('not valid json {]');
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.code, ProtocolErrorCode.ERR_INVALID_JSON);
    }
  });

  it('rejects envelope missing required fields', () => {
    const invalidJson = JSON.stringify({
      msg_id: '01J6G7M8N9P0Q1R2S3T4U5V6W7',
      // corr_id missing
      t_mono_ns: '1000',
      t_wall_ms: 1234567,
      kind: Kind.CMD,
      topic: Topics.VOICE_SPEAK,
      seq: 1,
      payload: {},
    });

    const result = parse(invalidJson);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.code, ProtocolErrorCode.ERR_INVALID_CORR_ID);
    }
  });

  it('rejects envelope missing topic', () => {
    const invalidJson = JSON.stringify({
      msg_id: '01J6G7M8N9P0Q1R2S3T4U5V6W7',
      corr_id: '01J6G7M8N9P0Q1R2S3T4U5V6W7',
      t_mono_ns: '1000',
      t_wall_ms: 1234567,
      kind: Kind.CMD,
      // topic missing
      seq: 1,
      payload: {},
    });

    const result = parse(invalidJson);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.code, ProtocolErrorCode.ERR_INVALID_TOPIC);
    }
  });

  it('rejects envelope with kind BANANA', () => {
    const invalidJson = JSON.stringify({
      msg_id: '01J6G7M8N9P0Q1R2S3T4U5V6W7',
      corr_id: '01J6G7M8N9P0Q1R2S3T4U5V6W7',
      t_mono_ns: '1000',
      t_wall_ms: 1234567,
      kind: 'BANANA',
      topic: Topics.VOICE_SPEAK,
      seq: 1,
      payload: {},
    });

    const result = parse(invalidJson);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.code, ProtocolErrorCode.ERR_INVALID_KIND);
    }
  });
});
