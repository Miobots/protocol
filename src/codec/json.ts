/**
 * JSON serialization, deserialization, and schema validation for envelopes.
 */

import { Kind, ProtocolErrorCode, ProtocolErrorReason, ProtocolDefaults } from '../constants/index.ts';
import { ProtocolError, type Envelope } from '../envelope/types.ts';

const VALID_KINDS = new Set<string>(Object.values(Kind));
const DIGITS_ONLY = /^\d+$/;

/**
 * Encodes an envelope into a wire-ready JSON string.
 */
export function encode<TTopic extends string, TPayload>(envelope: Envelope<TTopic, TPayload>): string {
  try {
    return JSON.stringify(envelope);
  } catch (err) {
    throw new ProtocolError('Failed to serialize envelope to JSON', ProtocolErrorCode.ERR_ENCODE_FAILED, {
      reason: ProtocolErrorReason.INVALID_ENVELOPE,
      details: err,
    });
  }
}

/**
 * Validates whether an unknown object conforms to the Envelope structure.
 */
export function validateEnvelope<TTopic extends string = string, TPayload = unknown>(
  obj: unknown
): Envelope<TTopic, TPayload> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new ProtocolError('Envelope must be a non-null object', ProtocolErrorCode.ERR_INVALID_ENVELOPE_TYPE, {
      reason: ProtocolErrorReason.INVALID_ENVELOPE,
    });
  }

  const candidate = obj as Record<string, unknown>;

  if (typeof candidate['msg_id'] !== 'string' || candidate['msg_id'].length === 0) {
    throw new ProtocolError('Field "msg_id" must be a non-empty string', ProtocolErrorCode.ERR_INVALID_MSG_ID, {
      reason: ProtocolErrorReason.INVALID_ENVELOPE,
      field: 'msg_id',
    });
  }

  if (typeof candidate['corr_id'] !== 'string' || candidate['corr_id'].length === 0) {
    throw new ProtocolError('Field "corr_id" must be a non-empty string', ProtocolErrorCode.ERR_INVALID_CORR_ID, {
      reason: ProtocolErrorReason.INVALID_ENVELOPE,
      field: 'corr_id',
    });
  }

  if (
    typeof candidate['t_mono_ns'] !== 'string' ||
    candidate['t_mono_ns'].length === 0 ||
    !DIGITS_ONLY.test(candidate['t_mono_ns'])
  ) {
    throw new ProtocolError(
      'Field "t_mono_ns" must be a non-empty decimal digit string',
      ProtocolErrorCode.ERR_INVALID_T_MONO_NS,
      {
        reason: ProtocolErrorReason.INVALID_ENVELOPE,
        field: 't_mono_ns',
      }
    );
  }

  if (
    typeof candidate['t_wall_ms'] !== 'number' ||
    !Number.isFinite(candidate['t_wall_ms']) ||
    candidate['t_wall_ms'] < 0
  ) {
    throw new ProtocolError('Field "t_wall_ms" must be a finite number', ProtocolErrorCode.ERR_INVALID_T_WALL_MS, {
      reason: ProtocolErrorReason.INVALID_ENVELOPE,
      field: 't_wall_ms',
    });
  }

  if (typeof candidate['kind'] !== 'string' || !VALID_KINDS.has(candidate['kind'])) {
    throw new ProtocolError(
      `Field "kind" must be one of: ${Array.from(VALID_KINDS).join(', ')}`,
      ProtocolErrorCode.ERR_INVALID_KIND,
      {
        reason: ProtocolErrorReason.UNKNOWN_KIND,
        field: 'kind',
      }
    );
  }

  if (typeof candidate['topic'] !== 'string' || candidate['topic'].length === 0) {
    throw new ProtocolError('Field "topic" must be a non-empty string', ProtocolErrorCode.ERR_INVALID_TOPIC, {
      reason: ProtocolErrorReason.INVALID_ENVELOPE,
      field: 'topic',
    });
  }

  if (
    typeof candidate['seq'] !== 'number' ||
    !Number.isInteger(candidate['seq']) ||
    candidate['seq'] < 0 ||
    candidate['seq'] > 4294967295
  ) {
    throw new ProtocolError(
      'Field "seq" must be a non-negative 32-bit unsigned integer',
      ProtocolErrorCode.ERR_INVALID_SEQ,
      {
        reason: ProtocolErrorReason.INVALID_ENVELOPE,
        field: 'seq',
      }
    );
  }

  if (!('payload' in candidate)) {
    throw new ProtocolError('Envelope must contain a "payload" field', ProtocolErrorCode.ERR_MISSING_PAYLOAD, {
      reason: ProtocolErrorReason.INVALID_ENVELOPE,
      field: 'payload',
    });
  }

  // Check payload size
  try {
    const payloadStr = JSON.stringify(candidate['payload']);
    if (payloadStr && Buffer.byteLength(payloadStr, 'utf-8') > ProtocolDefaults.MAX_PAYLOAD_BYTES) {
      throw new ProtocolError('Payload exceeds maximum size limit', ProtocolErrorCode.ERR_PAYLOAD_TOO_LARGE, {
        reason: ProtocolErrorReason.OVERSIZED_PAYLOAD,
        field: 'payload',
      });
    }
  } catch (err) {
    if (err instanceof ProtocolError) throw err;
  }

  // Idempotency key validation: required on CMD, forbidden on non-CMD
  if (candidate['kind'] === Kind.CMD) {
    if (typeof candidate['idem_key'] !== 'string' || candidate['idem_key'].length === 0) {
      throw new ProtocolError(
        'Field "idem_key" is required on CMD envelopes and must be a non-empty string',
        ProtocolErrorCode.ERR_INVALID_IDEM_KEY,
        {
          reason: ProtocolErrorReason.INVALID_ENVELOPE,
          field: 'idem_key',
        }
      );
    }
  } else if (candidate['idem_key'] !== undefined) {
    throw new ProtocolError('Field "idem_key" is only permitted on CMD envelopes', ProtocolErrorCode.ERR_INVALID_IDEM_KEY, {
      reason: ProtocolErrorReason.INVALID_ENVELOPE,
      field: 'idem_key',
    });
  }

  // Expiration timestamp validation: optional on CMD, forbidden on non-CMD
  if (candidate['expires_at'] !== undefined) {
    if (typeof candidate['expires_at'] !== 'number' || !Number.isFinite(candidate['expires_at'])) {
      throw new ProtocolError('Field "expires_at", if present, must be a number', ProtocolErrorCode.ERR_INVALID_EXPIRES_AT, {
        reason: ProtocolErrorReason.INVALID_ENVELOPE,
        field: 'expires_at',
      });
    }

    if (candidate['kind'] !== Kind.CMD) {
      throw new ProtocolError('Field "expires_at" is only permitted on CMD envelopes', ProtocolErrorCode.ERR_INVALID_EXPIRES_AT, {
        reason: ProtocolErrorReason.INVALID_ENVELOPE,
        field: 'expires_at',
      });
    }

    if (candidate['expires_at'] < (candidate['t_wall_ms'] as number)) {
      throw new ProtocolError('Command has expired (expires_at < t_wall_ms)', ProtocolErrorCode.ERR_EXPIRED, {
        reason: ProtocolErrorReason.EXPIRED,
        field: 'expires_at',
      });
    }
  }

  return candidate as unknown as Envelope<TTopic, TPayload>;
}

/**
 * Decodes a raw wire string or Buffer into a validated Envelope.
 */
export function decode<TTopic extends string = string, TPayload = unknown>(
  raw: string | Buffer | Uint8Array
): Envelope<TTopic, TPayload> {
  const byteLength = typeof raw === 'string' ? Buffer.byteLength(raw, 'utf-8') : raw.byteLength;
  if (byteLength > ProtocolDefaults.MAX_MESSAGE_BYTES) {
    throw new ProtocolError('Wire message exceeds maximum size limit', ProtocolErrorCode.ERR_PAYLOAD_TOO_LARGE, {
      reason: ProtocolErrorReason.OVERSIZED_PAYLOAD,
    });
  }

  const str = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch (err) {
    throw new ProtocolError('Invalid JSON: failed to parse wire payload', ProtocolErrorCode.ERR_INVALID_JSON, {
      reason: ProtocolErrorReason.MALFORMED,
      details: err,
    });
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
      error: new ProtocolError('Unknown error during envelope parsing', ProtocolErrorCode.ERR_UNKNOWN_PARSE, {
        reason: ProtocolErrorReason.MALFORMED,
        details: err,
      }),
    };
  }
}

