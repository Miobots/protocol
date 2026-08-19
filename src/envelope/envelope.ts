/**
 * Envelope factory functions and lifecycle helpers.
 */

import { generateUlid } from './ulid.ts';
import { Kind, type AckPayload, type Envelope } from './types.ts';

let globalSequenceCounter = 0;

export function getNextSequence(): number {
  globalSequenceCounter = (globalSequenceCounter + 1) >>> 0;
  return globalSequenceCounter;
}

export function resetSequence(initialValue = 0): void {
  globalSequenceCounter = initialValue >>> 0;
}

export function getMonotonicNs(): string {
  if (typeof process !== 'undefined' && typeof process.hrtime?.bigint === 'function') {
    return process.hrtime.bigint().toString();
  }
  return (Date.now() * 1_000_000).toString();
}

export interface NewEnvelopeOptions<TTopic extends string, TPayload> {
  kind: Kind;
  topic: TTopic;
  payload: TPayload;
  corr_id?: string;
  msg_id?: string;
  idem_key?: string;
  expires_at?: number;
  seq?: number;
  t_wall_ms?: number;
  t_mono_ns?: string;
}

/**
 * Creates a valid Envelope populating all mandatory protocol fields.
 */
export function newEnvelope<TTopic extends string, TPayload>(
  options: NewEnvelopeOptions<TTopic, TPayload>
): Envelope<TTopic, TPayload> {
  const msg_id = options.msg_id ?? generateUlid();
  const corr_id = options.corr_id ?? msg_id;
  const t_wall_ms = options.t_wall_ms ?? Date.now();
  const t_mono_ns = options.t_mono_ns ?? getMonotonicNs();
  const seq = options.seq ?? getNextSequence();

  const envelope: Envelope<TTopic, TPayload> = {
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
 */
export function createAck<TTopic extends string>(
  originalEnvelope: Envelope<TTopic, unknown>,
  payload: AckPayload
): Envelope<TTopic, AckPayload> {
  return newEnvelope<TTopic, AckPayload>({
    kind: Kind.ACK,
    topic: originalEnvelope.topic,
    corr_id: originalEnvelope.corr_id,
    payload,
  });
}
