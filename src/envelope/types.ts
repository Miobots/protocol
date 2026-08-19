/**
 * @miobots/protocol - Core wire types and protocol envelope definitions.
 * Governs the 10-field envelope format across Brain, Heart, Synapse, and Ganglion.
 */

import { Kind, ProtocolErrorCode, ProtocolErrorReason, type ExecutionStatus } from '../constants/index.ts';

export { Kind };

/**
 * The 10-field envelope structure.
 * All communication crossing WebSocket or persistent queue boundaries MUST use this envelope.
 */
export interface Envelope<TTopic extends string = string, TPayload = unknown> {
  /** Canonical unique message identifier (ULID string). */
  msg_id: string;

  /** Correlation ID linking requests to responses, events, and audit logs (ULID string). */
  corr_id: string;

  /** Monotonic timestamp in nanoseconds for micro-benchmarking. */
  t_mono_ns: string;

  /** Wall-clock time in milliseconds since Unix epoch (from Date.now()). */
  t_wall_ms: number;

  /** Message kind: CMD, ACK, EVT, TELEM, QRY, RPY, or ERR. */
  kind: Kind;

  /** Topic string identifying message category and action (e.g. "voice.speak", "sys.hello"). */
  topic: TTopic;

  /** Monotonically increasing sequence number per session. */
  seq: number;

  /** Optional idempotency key for CMD deduplication. Duplicate CMDs replay original ACK. */
  idem_key?: string;

  /** Optional Unix epoch ms after which a queued CMD must be discarded rather than executed late. */
  expires_at?: number;

  /** Domain-specific typed payload object. */
  payload: TPayload;
}

/**
 * Standard ACK payload returned in response to CMD or QRY messages.
 * Note: ACK signifies accepted/rejected by the target, NEVER that a long-running goal has finished.
 */
export interface AckPayload {
  /** True if the command was accepted for execution; false if refused/rejected. */
  accepted: boolean;

  /** Human-readable explanation or error code if accepted is false. */
  reason?: string;

  /** Execution status indication. */
  exec_status?: ExecutionStatus;

  /** Additional structured diagnostic details. */
  details?: Record<string, unknown>;
}

export interface ProtocolErrorOptions {
  reason?: string;
  field?: string;
  details?: unknown;
}

/**
 * Protocol framing or validation error.
 */
export class ProtocolError extends Error {
  public readonly code: string;
  public readonly reason: string;
  public readonly field?: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: string = ProtocolErrorCode.ERR_PROTOCOL,
    options?: ProtocolErrorOptions | unknown
  ) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;

    if (options && typeof options === 'object' && ('reason' in options || 'field' in options || 'details' in options)) {
      const opts = options as ProtocolErrorOptions;
      this.reason = opts.reason ?? ProtocolErrorReason.INVALID_ENVELOPE;
      this.field = opts.field;
      this.details = opts.details;
    } else {
      this.reason = ProtocolErrorReason.INVALID_ENVELOPE;
      this.details = options;
    }

    Object.setPrototypeOf(this, ProtocolError.prototype);
  }
}

