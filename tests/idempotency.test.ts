import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  Kind,
  Topics,
  Language,
  ExecutionStatus,
  ProtocolDefaults,
  newEnvelope,
  createAck,
  SequenceCounter,
  type SpeakPayload,
} from '../src/index.ts';
import {
  replayIfSeen,
  remember,
  pruneIdempotencyCache,
  resetIdempotencyCache,
} from '../src/simulator/fake-heart.ts';

/**
 * B0.5 — receiver-side idempotency.
 *
 * The Brain de-duplicates on the way out, which stops it re-sending. It does not stop the
 * receiver re-executing a retry that already crossed the wire, and the receiver is the side that
 * actually moves the speaker.
 */
describe('Fake Heart receiver-side idempotency (B0.5)', () => {
  const inbound = new SequenceCounter();
  const outbound = new SequenceCounter();

  function speakCommand(idemKey: string) {
    return newEnvelope<typeof Topics.VOICE_SPEAK, SpeakPayload>({
      kind: Kind.CMD,
      topic: Topics.VOICE_SPEAK,
      payload: { text: 'salam', lang: Language.UR },
      idem_key: idemKey,
      seq: inbound,
    });
  }

  beforeEach(() => resetIdempotencyCache());

  it('replays the original ACK for a duplicate idem_key', () => {
    const cmd = speakCommand('idem-duplicate');
    const first = createAck(cmd, { accepted: true, exec_status: ExecutionStatus.COMPLETED }, outbound);
    remember(cmd.idem_key, first);

    const replayed = replayIfSeen('idem-duplicate');

    assert.ok(replayed, 'a remembered idem_key must produce an ACK to replay');
    // Byte-identical: a retry must not look like a second execution to the sender.
    assert.deepEqual(replayed, first);
  });

  it('does not replay an idem_key it has never seen', () => {
    remember('idem-a', createAck(speakCommand('idem-a'), { accepted: true }, outbound));
    assert.equal(replayIfSeen('idem-b'), undefined);
  });

  it('treats a missing idem_key as never-seen rather than as a key', () => {
    // A malformed CMD without an idem_key must not collide with other malformed CMDs.
    assert.equal(replayIfSeen(undefined), undefined);
    remember(undefined, createAck(speakCommand('x'), { accepted: true }, outbound));
    assert.equal(replayIfSeen(undefined), undefined);
  });

  it('forgets an entry once it is past the TTL', () => {
    const cmd = speakCommand('idem-stale');
    remember(cmd.idem_key, createAck(cmd, { accepted: true }, outbound));
    assert.ok(replayIfSeen('idem-stale'), 'fresh entry should still replay');

    pruneIdempotencyCache(Date.now() + ProtocolDefaults.IDEMPOTENCY_TTL_MS + 1);

    assert.equal(
      replayIfSeen('idem-stale'),
      undefined,
      'past the TTL the command may be executed again'
    );
  });

  it('keeps entries that are still inside the TTL when pruning', () => {
    const cmd = speakCommand('idem-fresh');
    remember(cmd.idem_key, createAck(cmd, { accepted: true }, outbound));

    pruneIdempotencyCache(Date.now() + ProtocolDefaults.IDEMPOTENCY_TTL_MS - 1000);

    assert.ok(replayIfSeen('idem-fresh'));
  });
});
