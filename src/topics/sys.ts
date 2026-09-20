import { DeviceRole, SystemHealth, ProtocolDefaults, Kind } from '../constants/index.ts';
import { newEnvelope } from '../envelope/envelope.ts';
import type { SequenceCounter } from '../envelope/sequence.ts';
import type { Envelope } from '../envelope/types.ts';

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
