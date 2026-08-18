/**
 * JSON serialization, deserialization, and schema validation for envelopes.
 */

import { Kind, ProtocolErrorCode } from '../constants/index.ts';
import { ProtocolError, type Envelope } from '../envelope/types.ts';

const VALID_KINDS = new Set<string>(Object.values(Kind));

/**
 * Encodes an envelope into a wire-ready JSON string.
 */
export function encode<TTopic extends string, TPayload>(envelope: Envelope<TTopic, TPayload>): string {
  try {
    return JSON.stringify(envelope);
  } catch (err) {
    throw new ProtocolError('Failed to serialize envelope to JSON', ProtocolErrorCode.ERR_ENCODE_FAILED, err);
  }
}

/**
 * Validates whether an unknown object conforms to the Envelope structure.
 */
export function validateEnvelope<TTopic extends string = string, TPayload = unknown>(
  obj: unknown
): Envelope<TTopic, TPayload> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new ProtocolError('Envelope must be a non-null object', ProtocolErrorCode.ERR_INVALID_ENVELOPE_TYPE);
  }

  const candidate = obj as Record<string, unknown>;

  if (typeof candidate['msg_id'] !== 'string' || candidate['msg_id'].length === 0) {
    throw new ProtocolError('Field "msg_id" must be a non-empty string', ProtocolErrorCode.ERR_INVALID_MSG_ID);
  }

  if (typeof candidate['corr_id'] !== 'string' || candidate['corr_id'].length === 0) {
    throw new ProtocolError('Field "corr_id" must be a non-empty string', ProtocolErrorCode.ERR_INVALID_CORR_ID);
  }

  if (typeof candidate['t_mono_ns'] !== 'string' || candidate['t_mono_ns'].length === 0) {
    throw new ProtocolError('Field "t_mono_ns" must be a non-empty string', ProtocolErrorCode.ERR_INVALID_T_MONO_NS);
  }

  if (typeof candidate['t_wall_ms'] !== 'number' || !Number.isFinite(candidate['t_wall_ms'])) {
    throw new ProtocolError('Field "t_wall_ms" must be a finite number', ProtocolErrorCode.ERR_INVALID_T_WALL_MS);
  }

  if (typeof candidate['kind'] !== 'string' || !VALID_KINDS.has(candidate['kind'])) {
    throw new ProtocolError(
      `Field "kind" must be one of: ${Array.from(VALID_KINDS).join(', ')}`,
      ProtocolErrorCode.ERR_INVALID_KIND
    );
  }

  if (typeof candidate['topic'] !== 'string' || candidate['topic'].length === 0) {
    throw new ProtocolError('Field "topic" must be a non-empty string', ProtocolErrorCode.ERR_INVALID_TOPIC);
  }

  if (typeof candidate['seq'] !== 'number' || !Number.isInteger(candidate['seq']) || candidate['seq'] < 0) {
    throw new ProtocolError('Field "seq" must be a non-negative integer', ProtocolErrorCode.ERR_INVALID_SEQ);
  }

  if (!('payload' in candidate)) {
    throw new ProtocolError('Envelope must contain a "payload" field', ProtocolErrorCode.ERR_MISSING_PAYLOAD);
  }

  if (candidate['idem_key'] !== undefined && typeof candidate['idem_key'] !== 'string') {
    throw new ProtocolError('Field "idem_key", if present, must be a string', ProtocolErrorCode.ERR_INVALID_IDEM_KEY);
  }

  if (candidate['expires_at'] !== undefined && (typeof candidate['expires_at'] !== 'number' || !Number.isFinite(candidate['expires_at']))) {
    throw new ProtocolError('Field "expires_at", if present, must be a number', ProtocolErrorCode.ERR_INVALID_EXPIRES_AT);
  }

  return candidate as unknown as Envelope<TTopic, TPayload>;
}

/**
 * Decodes a raw wire string or Buffer into a validated Envelope.
 */
export function decode<TTopic extends string = string, TPayload = unknown>(
  raw: string | Buffer | Uint8Array
): Envelope<TTopic, TPayload> {
  const str = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch (err) {
    throw new ProtocolError('Invalid JSON: failed to parse wire payload', ProtocolErrorCode.ERR_INVALID_JSON, err);
  }

  return validateEnvelope<TTopic, TPayload>(parsed);
}

export type ParseResult<TTopic extends string, TPayload> =
  | { success: true; data: Envelope<TTopic, TPayload> }
  | { success: false; error: ProtocolError };

/**
 * Safely parses and validates a wire payload without throwing.
 */
export function parse<TTopic extends string = string, TPayload = unknown>(
  raw: string | Buffer | Uint8Array
): ParseResult<TTopic, TPayload> {
  try {
    const data = decode<TTopic, TPayload>(raw);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ProtocolError) {
      return { success: false, error: err };
    }
    return {
      success: false,
      error: new ProtocolError('Unknown error during envelope parsing', ProtocolErrorCode.ERR_UNKNOWN_PARSE, err),
    };
  }
}
