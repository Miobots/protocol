import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  Kind,
  Topics,
  Language,
  ExecutionStatus,
  ProtocolErrorReason,
  newEnvelope,
  SequenceCounter,
  type SpeakPayload,
} from '../src/index.ts';
import { rejectIfExpired } from '../src/simulator/fake-heart.ts';

/**
 * B0.5 — receiver-side expiry (ENVELOPE.md §6, §9).
 *
 * The Brain stamps a 30 s `expires_at` on every command. A command delayed past it on the wire
 * must be refused by the side that would act on it, so the Brain can tell the user it failed.
 */
describe('Fake Heart receiver-side expiry (B0.5)', () => {
  const inbound = new SequenceCounter();
  const outbound = new SequenceCounter();

  function speakCommand(expiresAt?: number) {
    return newEnvelope<typeof Topics.VOICE_SPEAK, SpeakPayload>({
      kind: Kind.CMD,
      topic: Topics.VOICE_SPEAK,
      payload: { text: 'salam', lang: Language.UR },
      idem_key: 'idem-expiry',
      seq: inbound,
      ...(expiresAt !== undefined && { expires_at: expiresAt }),
    });
  }

  it('rejects a command that arrives after its expires_at', () => {
    const cmd = speakCommand(Date.now() + 30_000);

    const ack = rejectIfExpired(cmd, outbound, cmd.expires_at! + 1);

    assert.ok(ack, 'a late command must produce a rejecting ACK');
    assert.equal(ack.kind, Kind.ACK);
    assert.equal(ack.corr_id, cmd.corr_id, 'the Brain matches the rejection by corr_id');
    assert.equal(ack.payload.accepted, false);
    assert.equal(ack.payload.reason, ProtocolErrorReason.EXPIRED);
    assert.equal(ack.payload.exec_status, ExecutionStatus.REJECTED);
  });

  it('rejects at exactly expires_at, matching the Brain', () => {
    const cmd = speakCommand(Date.now() + 30_000);
    assert.ok(rejectIfExpired(cmd, outbound, cmd.expires_at!));
  });

  it('lets a command through while it is still live', () => {
    const cmd = speakCommand(Date.now() + 30_000);
    assert.equal(rejectIfExpired(cmd, outbound, cmd.expires_at! - 1), undefined);
  });

  it('never expires a command that carries no expires_at', () => {
    assert.equal(rejectIfExpired(speakCommand(), outbound, Number.MAX_SAFE_INTEGER), undefined);
  });
});
