/**
 * Envelope factory functions and lifecycle helpers.
 */

import { generateUlid } from './ulid.ts';
import { Kind, type AckPayload, type Envelope } from './types.ts';
import { SequenceCounter } from './sequence.ts';
// Type-only: erased at compile time, so no runtime cycle with topics/sys.ts.
import type { TopicPayloadMap } from '../topics/registry.ts';

/**
 * The payload a topic is allowed to carry (P0.3).
 *
 * A **registered** topic is pinned to its own payload, plus `AckPayload` — because an ACK replying
 * on a command topic carries the acknowledgement, not the command (ENVELOPE.md §4). An
 * unregistered topic string falls back to `TFallback`, which keeps ad-hoc and not-yet-registered
 * topics usable without weakening the registered ones.
 */
export type PayloadFor<TTopic extends string, TFallback> = TTopic extends keyof TopicPayloadMap
  ? TopicPayloadMap[TTopic] | AckPayload
  : TFallback;

export function getMonotonicNs(): string {
  if (typeof process !== 'undefined' && typeof process.hrtime?.bigint === 'function') {
    return process.hrtime.bigint().toString();
  }
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return Math.floor(performance.now() * 1_000_000).toString();
  }
  return (Date.now() * 1_000_000).toString();
}

export interface NewEnvelopeOptions<TTopic extends string, TPayload> {
  kind: Kind;
  topic: TTopic;
  /** Bound to `topic` for registered topics — see {@link PayloadFor}. */
  payload: PayloadFor<TTopic, TPayload>;
  /**
   * REQUIRED. ENVELOPE.md §6: `seq` is a per-connection, per-direction counter, and a process
   * holding several connections keeps one counter per connection. There is deliberately no
   * default — a shared fallback makes gap detection meaningless the moment Heart, Synapse and
   * Ganglion are attached at once, so the caller must name the connection it is sending on.
   */
  seq: number | SequenceCounter;
  corr_id?: string;
  msg_id?: string;
  idem_key?: string;
  expires_at?: number;
  t_wall_ms?: number;
  t_mono_ns?: string;
}

/**
 * Creates a valid Envelope populating all mandatory protocol fields.
 */
export function newEnvelope<TTopic extends string, TPayload>(
  options: NewEnvelopeOptions<TTopic, TPayload>
): Envelope<TTopic, PayloadFor<TTopic, TPayload>> {
  const msg_id = options.msg_id ?? generateUlid();
  const corr_id = options.corr_id ?? msg_id;
  const t_wall_ms = options.t_wall_ms ?? Date.now();
  const t_mono_ns = options.t_mono_ns ?? getMonotonicNs();
  const seq = options.seq instanceof SequenceCounter ? options.seq.next() : options.seq;

  const envelope: Envelope<TTopic, PayloadFor<TTopic, TPayload>> = {
    msg_id,
    corr_id,
    t_mono_ns,
    t_wall_ms,
    kind: options.kind,
    topic: options.topic,
    seq,
    payload: options.payload,
  };

  if (options.kind === Kind.CMD) {
    envelope.idem_key = options.idem_key ?? generateUlid();
  } else if (options.idem_key !== undefined) {
    envelope.idem_key = options.idem_key;
  }

  if (options.expires_at !== undefined) {
    envelope.expires_at = options.expires_at;
  }

  return envelope;
}

/**
 * Creates an ACK envelope replying to a specific incoming command or query envelope.
 *
 * `seq` is the responder's own outbound counter for the connection the ACK goes out on — not the
 * sequence of the envelope being answered. The two directions count independently (ENVELOPE.md §6).
 */
export function createAck<TTopic extends string>(
  originalEnvelope: Envelope<TTopic, unknown>,
  payload: AckPayload,
  seq: number | SequenceCounter
): Envelope<TTopic, AckPayload> {
  return newEnvelope<TTopic, AckPayload>({
    kind: Kind.ACK,
    topic: originalEnvelope.topic,
    corr_id: originalEnvelope.corr_id,
    seq,
    // TTopic is unresolved here, so PayloadFor<TTopic, AckPayload> stays a deferred conditional.
    // AckPayload is a member of both of its branches, so the cast is sound.
    payload: payload as PayloadFor<TTopic, AckPayload>,
  }) as Envelope<TTopic, AckPayload>;
}
