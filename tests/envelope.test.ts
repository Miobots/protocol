import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  Kind,
  Topics,
  Language,
  ExecutionStatus,
  newEnvelope,
  createAck,
  SequenceCounter,
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
    const conn = new SequenceCounter(0);

    const env = newEnvelope<typeof Topics.VOICE_SPEAK, SpeakPayload>({
      kind: Kind.CMD,
      topic: Topics.VOICE_SPEAK,
      payload: { text: 'Salam', lang: Language.UR },
      idem_key: 'key-123',
      seq: conn,
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

  it('increments sequence numbers monotonically within one connection', () => {
    const conn = new SequenceCounter(10);
    const env1 = newEnvelope({ kind: Kind.EVT, topic: 'test.one', payload: {}, seq: conn });
    const env2 = newEnvelope({ kind: Kind.EVT, topic: 'test.two', payload: {}, seq: conn });
    assert.equal(env1.seq, 11);
    assert.equal(env2.seq, 12);
  });

  it('keeps counters independent across connections — ENVELOPE.md §6', () => {
    // The failure this guards: one shared counter makes gap detection meaningless the moment
    // Heart, Synapse and Ganglion are attached at once. Each connection must count for itself.
    const heart = new SequenceCounter();
    const synapse = new SequenceCounter();

    const h1 = newEnvelope({ kind: Kind.EVT, topic: 'test.tick', payload: {}, seq: heart });
    const s1 = newEnvelope({ kind: Kind.EVT, topic: 'test.tick', payload: {}, seq: synapse });
    const h2 = newEnvelope({ kind: Kind.EVT, topic: 'test.tick', payload: {}, seq: heart });
    const s2 = newEnvelope({ kind: Kind.EVT, topic: 'test.tick', payload: {}, seq: synapse });

    // Interleaved sends must not steal each other's numbers.
    assert.deepEqual([h1.seq, h2.seq], [1, 2]);
    assert.deepEqual([s1.seq, s2.seq], [1, 2]);
  });

  it('creates ACK envelopes linked to original correlation ID', () => {
    const inbound = new SequenceCounter();
    const outbound = new SequenceCounter();

    const cmd = newEnvelope<typeof Topics.VOICE_SPEAK, SpeakPayload>({
      kind: Kind.CMD,
      topic: Topics.VOICE_SPEAK,
      payload: { text: 'Hello', lang: Language.EN },
      seq: inbound,
    });

    const ack = createAck(
      cmd,
      { accepted: true, exec_status: ExecutionStatus.EXECUTING },
      outbound
    );

    // The ACK counts on the responder's own outbound direction, not the command's.
    assert.equal(ack.seq, 1);

    assert.equal(ack.kind, Kind.ACK);
    assert.equal(ack.corr_id, cmd.corr_id);
    assert.equal(ack.topic, cmd.topic);
    assert.notEqual(ack.msg_id, cmd.msg_id);
    assert.equal(ack.payload.accepted, true);
  });

  it('ensures monotonic timestamp (t_mono_ns) progresses forward', () => {
    const conn = new SequenceCounter();
    const env1 = newEnvelope({ kind: Kind.EVT, topic: 'test.clock1', payload: {}, seq: conn });
    const env2 = newEnvelope({ kind: Kind.EVT, topic: 'test.clock2', payload: {}, seq: conn });
    assert.ok(BigInt(env2.t_mono_ns) >= BigInt(env1.t_mono_ns));
  });
});


describe('Topic → payload binding (P0.3)', () => {
  // P0.3's exit check is "typecheck binds topic to payload". Before this, a `voice.speak`
  // envelope carrying an unrelated object compiled clean — the binding was a convention held up
  // by hand-written generic arguments, not a check. These cases fail the BUILD, not the run, so
  // `tsc --noEmit` is what actually asserts them; the runtime bodies only keep the file honest.

  it('rejects a payload that does not belong to the topic', () => {
    const conn = new SequenceCounter();

    // @ts-expect-error — voice.speak carries SpeakPayload, not an arbitrary object.
    newEnvelope({ kind: Kind.CMD, topic: Topics.VOICE_SPEAK, payload: { totally: 'wrong' }, seq: conn });

    // @ts-expect-error — sys.hello needs device_id/token/protocol_version/role.
    newEnvelope({ kind: Kind.CMD, topic: Topics.SYS_HELLO, payload: { text: 'hi' }, seq: conn });

    assert.ok(true);
  });

  it('accepts the topic\'s own payload, and an ACK replying on that topic', () => {
    const conn = new SequenceCounter();

    const cmd = newEnvelope({
      kind: Kind.CMD,
      topic: Topics.VOICE_SPEAK,
      payload: { text: 'Salam', lang: Language.UR },
      seq: conn,
    });
    assert.equal(cmd.topic, Topics.VOICE_SPEAK);

    // ENVELOPE.md §4 — an ACK on a command topic carries the acknowledgement, not the command.
    const ack = newEnvelope({
      kind: Kind.ACK,
      topic: Topics.VOICE_SPEAK,
      payload: { accepted: true },
      seq: conn,
    });
    assert.equal(ack.kind, Kind.ACK);
  });

  it('leaves unregistered topics free, so ad-hoc topics stay usable', () => {
    const conn = new SequenceCounter();
    const env = newEnvelope({ kind: Kind.EVT, topic: 'sensor.temp', payload: { celsius: 24.5 }, seq: conn });
    assert.deepEqual(env.payload, { celsius: 24.5 });
  });
});
