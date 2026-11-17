import { DeviceRole, SystemHealth, ProtocolDefaults, Kind } from '../constants/index.ts';
import { newEnvelope } from '../envelope/envelope.ts';
import type { SequenceCounter } from '../envelope/sequence.ts';
import type { Envelope } from '../envelope/types.ts';
import { isNumber, isRecord, isText } from './guards.ts';
import { isJsonValue, type JsonObject } from './mcp.ts';

export interface HelloPayload {
  device_id: string;
  token: string;
  protocol_version: number;
  role: DeviceRole;
  client_wall_ms?: number;
  capabilities?: string[];
}

export interface WelcomePayload {
  accepted: boolean;
  session_id?: string;
  server_wall_ms?: number;
  reason?: string;
}

export interface HeartbeatPayload {
  status: SystemHealth;
  t_wall_ms: number;
  battery_pct?: number;
}

export interface HelloValidationResult {
  valid: boolean;
  reason?: string;
  error?: string;
}

/**
 * Validates inbound sys.hello handshake per ENVELOPE.md §8.
 * Rejects protocol version mismatches explicitly.
 */
export function validateHello(hello: unknown): HelloValidationResult {
  if (typeof hello !== 'object' || hello === null) {
    return {
      valid: false,
      reason: 'invalid_hello_payload',
      error: 'sys.hello payload must be a non-null object',
    };
  }

  const candidate = hello as Record<string, unknown>;

  if (typeof candidate['device_id'] !== 'string' || candidate['device_id'].length === 0) {
    return {
      valid: false,
      reason: 'missing_device_id',
      error: 'sys.hello payload missing device_id',
    };
  }

  if (typeof candidate['token'] !== 'string' || candidate['token'].length === 0) {
    return {
      valid: false,
      reason: 'missing_token',
      error: 'sys.hello payload missing token',
    };
  }

  if (typeof candidate['protocol_version'] !== 'number') {
    return {
      valid: false,
      reason: 'protocol_version_mismatch',
      error: 'sys.hello payload missing protocol_version',
    };
  }

  if (candidate['protocol_version'] !== ProtocolDefaults.PROTOCOL_VERSION) {
    return {
      valid: false,
      reason: 'protocol_version_mismatch',
      error: `Protocol version mismatch: expected ${ProtocolDefaults.PROTOCOL_VERSION}, got ${candidate['protocol_version']}`,
    };
  }

  return { valid: true };
}

/**
 * Factory helper creating a sys.welcome ACK response to sys.hello.
 */
export function createWelcomeAck(
  helloEnv: Envelope<string, unknown>,
  options: {
    accepted: boolean;
    /** The hub's own outbound counter for this connection (ENVELOPE.md §6). */
    seq: number | SequenceCounter;
    sessionId?: string;
    serverWallMs?: number;
    reason?: string;
  }
): Envelope<'sys.welcome', WelcomePayload> {
  const payload: WelcomePayload = {
    accepted: options.accepted,
    session_id: options.sessionId ?? (options.accepted ? `sess-${Date.now()}` : ''),
    server_wall_ms: options.serverWallMs ?? Date.now(),
  };

  if (options.reason !== undefined) {
    payload.reason = options.reason;
  }

  return newEnvelope<'sys.welcome', WelcomePayload>({
    kind: Kind.ACK,
    topic: 'sys.welcome',
    corr_id: helloEnv.corr_id,
    seq: options.seq,
    payload,
  });
}

/**
 * `sys.error` — "your message was bad" (ENVELOPE.md §9). It is never answered and never retried,
 * and it never closes the connection: only a bad token does that.
 */
export interface ErrorPayload {
  /** A `ProtocolErrorReason`: `malformed`, `invalid_envelope`, `unknown_topic`, `unknown_kind`, … */
  reason: string;
  /** The offending message, when it could be read far enough to name. */
  msg_id?: string;
  /** The field that was wrong, for `invalid_envelope`. */
  field?: string;
}

export function isErrorPayload(value: unknown): value is ErrorPayload {
  return isRecord(value) && isText(value.reason);
}

/**
 * `sys.receipt` — Brain confirming that events arrived (ENVELOPE.md §8). The sender trims its
 * outbox on this and on nothing else: acknowledging on send is how the one message that mattered
 * gets lost. Events are named by `msg_id`, the only identity that survives a reconnect.
 */
export interface ReceiptPayload {
  msg_ids: string[];
}

export function isReceiptPayload(value: unknown): value is ReceiptPayload {
  return isRecord(value) && Array.isArray(value.msg_ids) && value.msg_ids.every(isText);
}

/**
 * `sys.approval` (P5.1) — asks a human for permission, showing the **exact** arguments.
 *
 * The answer is the ACK: `accepted: true` is a tap on Approve, `accepted: false` a tap on Reject,
 * and silence until `expires_at` is neither. That is why this command waits
 * `ProtocolDefaults.DEFAULT_APPROVAL_TIMEOUT_MS` for its ACK rather than the usual five seconds.
 * Who approved comes from the token on the connection that answered, never from the payload.
 */
export interface ApprovalPayload {
  approval_id: string;
  tool_name: string;
  args: JsonObject;
  /** Unix epoch ms. What the card counts down to. */
  expires_at: number;
}

export function isApprovalPayload(value: unknown): value is ApprovalPayload {
  return (
    isRecord(value) &&
    isText(value.approval_id) &&
    isText(value.tool_name) &&
    isRecord(value.args) &&
    isJsonValue(value.args) &&
    isNumber(value.expires_at)
  );
}

/** `sys.killswitch` (P5.1) — everything off at once, or back on. */
export interface KillSwitchPayload {
  active: boolean;
}

export function isKillSwitchPayload(value: unknown): value is KillSwitchPayload {
  return isRecord(value) && typeof value.active === 'boolean';
}

/**
 * `sys.pair` (G0.2) — an unpaired laptop daemon asks to be paired, sent **instead of** `sys.hello`.
 *
 * The daemon makes the six-digit code and shows it to the human, who types it into the app
 * (`sys.pair_confirm`). The ACK is the result, and it arrives only once a human confirms or the
 * code lapses; on success it carries the daemon's own `token`. Finding a device on the network is
 * never permission to use it.
 */
export interface PairPayload {
  device_id: string;
  /** Exactly six digits. */
  code: string;
  /** What the app shows once paired, e.g. the laptop's hostname. */
  name: string;
  protocol_version: number;
}

/** `sys.pair_confirm` (S9.2) — the app hands Brain the code a human read off the laptop. */
export interface PairConfirmPayload {
  code: string;
}

export const PAIRING_CODE_PATTERN = /^[0-9]{6}$/;

export function isPairPayload(value: unknown): value is PairPayload {
  return (
    isRecord(value) &&
    isText(value.device_id) &&
    typeof value.code === 'string' &&
    PAIRING_CODE_PATTERN.test(value.code) &&
    isText(value.name) &&
    isNumber(value.protocol_version)
  );
}

export function isPairConfirmPayload(value: unknown): value is PairConfirmPayload {
  return isRecord(value) && typeof value.code === 'string' && PAIRING_CODE_PATTERN.test(value.code);
}

/** One paired laptop, as the app lists it (S9.2). Never carries a token or its hash. */
export interface PairedDevice {
  device_id: string;
  name: string;
  /** ISO 8601. */
  paired_at: string;
  /** Connected to the Brain right now. */
  online: boolean;
}

/**
 * `sys.devices` — Brain → Synapse, the laptops paired with this home. Sent when an app connects
 * and whenever a pairing or a laptop's connection changes; each one replaces the last.
 */
export interface DevicesPayload {
  devices: PairedDevice[];
}

export function isDevicesPayload(value: unknown): value is DevicesPayload {
  return (
    isRecord(value) &&
    Array.isArray(value.devices) &&
    value.devices.every((device: unknown) =>
      isRecord(device) &&
      isText(device.device_id) &&
      isText(device.name) &&
      isText(device.paired_at) &&
      typeof device.online === 'boolean')
  );
}
