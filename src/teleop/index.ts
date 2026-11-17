/**
 * LAN-direct teleoperation (P2.6) — the one path that is deliberately **not** an envelope.
 *
 * No topic in the registry carries a velocity (ENVELOPE.md §10), so that "nothing the Brain says
 * can reach the wheels" stays checkable. Driving from the phone uses these four frames instead,
 * on its own socket. The contract is `03 Engineering/Protocol/TELEOP.md`; this file is its only
 * implementation, and the vectors in `conformance/teleop.json` are what the robot's side tests
 * against.
 */

import { isNumber, isRecord, isText } from '../topics/guards.ts';

export const TeleopDefaults = {
  /** WebSocket path on the robot. */
  PATH: '/teleop',
  /**
   * The robot stops itself this long after the last `drive` frame. It is enforced on the robot and
   * announced in `welcome`; the app can read it and cannot change it.
   */
  DEADMAN_MS: 400,
  /** How often the app sends `drive` and the robot sends `status` — four chances per deadman window. */
  FRAME_INTERVAL_MS: 100,
  /** A frame longer than this is dropped before it is parsed. */
  MAX_FRAME_CHARS: 256,
} as const;

/** App → robot, first frame. The token is the Brain-issued one the app already holds. */
export interface TeleopHello {
  t: 'hello';
  token: string;
  protocol_version: number;
}

/** Robot → app. A bad token gets no frame at all: the robot closes the socket. */
export interface TeleopWelcome {
  t: 'welcome';
  deadman_ms: number;
}

/** App → robot, every {@link TeleopDefaults.FRAME_INTERVAL_MS} while a finger is on the stick. */
export interface TeleopDrive {
  t: 'drive';
  /** Counts up from 1 within the session. */
  seq: number;
  /** Forward speed, m/s. Negative reverses. The robot clamps it. */
  v: number;
  /** Turn rate, rad/s. Positive turns left. The robot clamps it. */
  w: number;
}

/** Robot → app, on the same interval whether or not it is being driven. */
export interface TeleopStatus {
  t: 'status';
  /** The last `drive` the robot applied, 0 before the first — what the latency indicator reads. */
  seq: number;
  /** True while the robot has stopped itself because `drive` frames stopped arriving. */
  deadman: boolean;
}

export type TeleopFrame = TeleopHello | TeleopWelcome | TeleopDrive | TeleopStatus;

export function encodeTeleopFrame(frame: TeleopFrame): string {
  return JSON.stringify(frame);
}

function isCounter(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

/**
 * Undefined for anything that is not exactly one of the four frames. A bad frame is dropped,
 * never guessed at — and a dropped `drive` is one step closer to the deadman, which is the point.
 */
export function parseTeleopFrame(raw: string): TeleopFrame | undefined {
  if (raw.length > TeleopDefaults.MAX_FRAME_CHARS) return undefined;

  let frame: unknown;
  try {
    frame = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(frame)) return undefined;

  switch (frame.t) {
    case 'hello':
      return isText(frame.token) && isNumber(frame.protocol_version)
        ? { t: 'hello', token: frame.token, protocol_version: frame.protocol_version }
        : undefined;
    case 'welcome':
      return isNumber(frame.deadman_ms) && frame.deadman_ms > 0 ? { t: 'welcome', deadman_ms: frame.deadman_ms } : undefined;
    case 'drive':
      return isCounter(frame.seq) && frame.seq > 0 && isNumber(frame.v) && isNumber(frame.w)
        ? { t: 'drive', seq: frame.seq, v: frame.v, w: frame.w }
        : undefined;
    case 'status':
      return isCounter(frame.seq) && typeof frame.deadman === 'boolean'
        ? { t: 'status', seq: frame.seq, deadman: frame.deadman }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * What the app shows. "Connection lost" the moment the robot says it stopped itself — or the
 * moment the robot goes quiet for a deadman window, because a robot the app cannot hear cannot
 * hear the app either, and has stopped.
 */
export function teleopConnectionLost(lastStatus: TeleopStatus | undefined, lastStatusAtMs: number, nowMs: number): boolean {
  return lastStatus === undefined || lastStatus.deadman || nowMs - lastStatusAtMs >= TeleopDefaults.DEADMAN_MS;
}
