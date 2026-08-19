/**
 * Protocol and Framing Error Codes.
 */

export const ProtocolErrorCode = {
  ERR_PROTOCOL: 'ERR_PROTOCOL',
  ERR_INVALID_JSON: 'ERR_INVALID_JSON',
  ERR_INVALID_ENVELOPE_TYPE: 'ERR_INVALID_ENVELOPE_TYPE',
  ERR_INVALID_MSG_ID: 'ERR_INVALID_MSG_ID',
  ERR_INVALID_CORR_ID: 'ERR_INVALID_CORR_ID',
  ERR_INVALID_T_MONO_NS: 'ERR_INVALID_T_MONO_NS',
  ERR_INVALID_T_WALL_MS: 'ERR_INVALID_T_WALL_MS',
  ERR_INVALID_KIND: 'ERR_INVALID_KIND',
  ERR_INVALID_TOPIC: 'ERR_INVALID_TOPIC',
  ERR_INVALID_SEQ: 'ERR_INVALID_SEQ',
  ERR_MISSING_PAYLOAD: 'ERR_MISSING_PAYLOAD',
  ERR_INVALID_IDEM_KEY: 'ERR_INVALID_IDEM_KEY',
  ERR_INVALID_EXPIRES_AT: 'ERR_INVALID_EXPIRES_AT',
  ERR_EXPIRED: 'ERR_EXPIRED',
  ERR_PAYLOAD_TOO_LARGE: 'ERR_PAYLOAD_TOO_LARGE',
  ERR_ENCODE_FAILED: 'ERR_ENCODE_FAILED',
  ERR_UNKNOWN_PARSE: 'ERR_UNKNOWN_PARSE',
  ERR_AUTH_FAILED: 'ERR_AUTH_FAILED',
  ERR_TIMEOUT: 'ERR_TIMEOUT',
} as const;

export type ProtocolErrorCode = (typeof ProtocolErrorCode)[keyof typeof ProtocolErrorCode];

/**
 * Standardized Machine-Readable Error Reasons.
 * Conforms to ENVELOPE.md §9 and Conformance Vectors.
 */
export const ProtocolErrorReason = {
  INVALID_ENVELOPE: 'invalid_envelope',
  UNKNOWN_KIND: 'unknown_kind',
  UNKNOWN_TOPIC: 'unknown_topic',
  MALFORMED: 'malformed',
  EXPIRED: 'expired',
  OVERSIZED_PAYLOAD: 'oversized_payload',
} as const;

export type ProtocolErrorReason = (typeof ProtocolErrorReason)[keyof typeof ProtocolErrorReason];
