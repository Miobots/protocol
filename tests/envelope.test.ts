import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  Kind,
  Topics,
  Language,
  ExecutionStatus,
  newEnvelope,
  createAck,
  resetSequence,
  generateUlid,
  type SpeakPayload,
} from '../src/index.ts';

describe('ULID Generator', () => {
  it('generates 26-character alphanumeric Crockford Base32 strings', () => {
    const id = generateUlid();
    assert.equal(typeof id, 'string');
    assert.equal(id.length, 26);
    assert.match(id, /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  it('generates unique IDs across successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUlid()));
    assert.equal(ids.size, 100);
  });
});

describe('Envelope Factory (newEnvelope)', () => {
  it('populates all mandatory 10 fields correctly', () => {
    resetSequence(0);

    const env = newEnvelope<typeof Topics.VOICE_SPEAK, SpeakPayload>({
      kind: Kind.CMD,
      topic: Topics.VOICE_SPEAK,
      payload: { text: 'Salam', lang: Language.UR },
      idem_key: 'key-123',
    });

    assert.equal(typeof env.msg_id, 'string');
    assert.equal(env.msg_id.length, 26);
    assert.equal(env.corr_id, env.msg_id);
    assert.equal(typeof env.t_mono_ns, 'string');
    assert.ok(BigInt(env.t_mono_ns) > 0n);
    assert.equal(typeof env.t_wall_ms, 'number');
    assert.ok(env.t_wall_ms > 0);
    assert.equal(env.kind, Kind.CMD);
    assert.equal(env.topic, Topics.VOICE_SPEAK);
    assert.equal(env.seq, 1);
    assert.equal(env.idem_key, 'key-123');
    assert.deepEqual(env.payload, { text: 'Salam', lang: Language.UR });
  });

  it('increments sequence numbers monotonically', () => {
    resetSequence(10);
    const env1 = newEnvelope({ kind: Kind.EVT, topic: 'test.one', payload: {} });
    const env2 = newEnvelope({ kind: Kind.EVT, topic: 'test.two', payload: {} });
    assert.equal(env1.seq, 11);
    assert.equal(env2.seq, 12);
  });

  it('creates ACK envelopes linked to original correlation ID', () => {
    const cmd = newEnvelope<typeof Topics.VOICE_SPEAK, SpeakPayload>({
      kind: Kind.CMD,
      topic: Topics.VOICE_SPEAK,
      payload: { text: 'Hello', lang: Language.EN },
    });

    const ack = createAck(cmd, {
      accepted: true,
      exec_status: ExecutionStatus.EXECUTING,
    });

    assert.equal(ack.kind, Kind.ACK);
    assert.equal(ack.corr_id, cmd.corr_id);
    assert.equal(ack.topic, cmd.topic);
    assert.notEqual(ack.msg_id, cmd.msg_id);
    assert.equal(ack.payload.accepted, true);
  });

  it('ensures monotonic timestamp (t_mono_ns) progresses forward', () => {
    const env1 = newEnvelope({ kind: Kind.EVT, topic: 'test.clock1', payload: {} });
    const env2 = newEnvelope({ kind: Kind.EVT, topic: 'test.clock2', payload: {} });
    assert.ok(BigInt(env2.t_mono_ns) >= BigInt(env1.t_mono_ns));
  });
});

