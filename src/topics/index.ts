/**
 * Canonical Topic Registry and Payload Types.
 */

import { Kind } from '../constants/index.ts';
import { isFaultPayload } from './diag.ts';
import { isMapSnapshotPayload, isRegionConfirmPayload, isRegionPayload, isZonePayload } from './map.ts';
import { isBatteryPayload, isPosePayload } from './state.ts';
import { validateMCPNotification, validateMCPRequest, validateMCPResponse } from './mcp.ts';
import { isSightingPayload } from './obs.ts';
import { isSchedFiredPayload, isSchedWindowPayload } from './sched.ts';
import { isApprovalPayload, isErrorPayload, isKillSwitchPayload } from './sys.ts';

export const Topics = {
  // System Lifecycle & Authentication
  SYS_HELLO: 'sys.hello',
  SYS_WELCOME: 'sys.welcome',
  SYS_HEARTBEAT: 'sys.heartbeat',
  SYS_ERROR: 'sys.error',
  SYS_RECEIPT: 'sys.receipt',
  CAP_MANIFEST: 'cap.manifest',

  // Permission
  SYS_APPROVAL: 'sys.approval',
  SYS_KILLSWITCH: 'sys.killswitch',

  // Pairing a laptop daemon (G0.2)
  SYS_PAIR: 'sys.pair',
  SYS_PAIR_CONFIRM: 'sys.pair_confirm',

  // Voice Interaction
  VOICE_SPEAK: 'voice.speak',

  // Long-running Navigation
  NAV_GOTO: 'nav.goto',
  NAV_CANCEL: 'nav.cancel',
  NAV_FEEDBACK: 'nav.feedback',
  NAV_RESULT: 'nav.result',

  // Telemetry
  STATE_POSE: 'state.pose',
  STATE_BATTERY: 'state.battery',

  // Reminders
  SCHED_WINDOW: 'sched.window',
  SCHED_FIRED: 'sched.fired',

  // What the robot saw, and what went wrong
  OBS_SIGHTING: 'obs.sighting',
  DIAG_FAULT: 'diag.fault',

  // Map, rooms and no-go zones
  MAP_SNAPSHOT: 'map.snapshot',
  REGION_UPSERT: 'region.upsert',
  REGION_CONFIRM: 'region.confirm',
  ZONE_UPSERT: 'zone.upsert',

  // MCP JSON-RPC messages carried inside protocol envelopes
  MCP_REQUEST: 'mcp.request',
  MCP_RESPONSE: 'mcp.response',
  MCP_NOTIFICATION: 'mcp.notification',
} as const;

export type TopicName = (typeof Topics)[keyof typeof Topics];

export * from './sys.ts';
export * from './voice.ts';
export * from './capability.ts';
export * from './nav.ts';
export * from './state.ts';
export * from './sched.ts';
export * from './obs.ts';
export * from './diag.ts';
export * from './map.ts';
export * from './mcp.ts';
export type { Polygon, Pose } from './guards.ts';
export type * from './registry.ts';

/**
 * The kind each topic is sent as (ENVELOPE.md §10). EVT vs TELEM is decided here, once per topic,
 * and `Record` makes a new topic without a classification a compile error.
 */
export const TopicKind: Record<TopicName, Kind> = {
  'sys.hello': Kind.CMD,
  'sys.welcome': Kind.ACK,
  'sys.heartbeat': Kind.EVT,
  'sys.error': Kind.ERR,
  'sys.receipt': Kind.ACK,
  'cap.manifest': Kind.EVT,
  'sys.approval': Kind.CMD,
  'sys.killswitch': Kind.CMD,
  'sys.pair': Kind.CMD,
  'sys.pair_confirm': Kind.CMD,
  'voice.speak': Kind.CMD,
  'nav.goto': Kind.CMD,
  'nav.cancel': Kind.CMD,
  'nav.feedback': Kind.EVT,
  'nav.result': Kind.EVT,
  'state.pose': Kind.TELEM,
  'state.battery': Kind.TELEM,
  'sched.window': Kind.CMD,
  'sched.fired': Kind.EVT,
  'obs.sighting': Kind.EVT,
  'diag.fault': Kind.EVT,
  // The current map replaces the last one outright, so a queued copy is only ever stale.
  'map.snapshot': Kind.TELEM,
  'region.upsert': Kind.CMD,
  'region.confirm': Kind.CMD,
  'zone.upsert': Kind.CMD,
  'mcp.request': Kind.CMD,
  'mcp.response': Kind.EVT,
  'mcp.notification': Kind.CMD,
};

export const TopicAllowedKinds: Record<TopicName, readonly Kind[]> = {
  'sys.hello': [Kind.CMD],
  'sys.welcome': [Kind.ACK],
  'sys.heartbeat': [Kind.EVT],
  'sys.error': [Kind.ERR],
  'sys.receipt': [Kind.ACK],
  // The manifest is published as EVT and is also queried/replied to by existing consumers.
  'cap.manifest': [Kind.EVT, Kind.QRY, Kind.RPY],
  'sys.approval': [Kind.CMD],
  'sys.killswitch': [Kind.CMD],
  'sys.pair': [Kind.CMD],
  'sys.pair_confirm': [Kind.CMD],
  'voice.speak': [Kind.CMD],
  'nav.goto': [Kind.CMD],
  'nav.cancel': [Kind.CMD],
  'nav.feedback': [Kind.EVT],
  'nav.result': [Kind.EVT],
  'state.pose': [Kind.TELEM],
  'state.battery': [Kind.TELEM],
  'sched.window': [Kind.CMD],
  'sched.fired': [Kind.EVT],
  'obs.sighting': [Kind.EVT],
  'diag.fault': [Kind.EVT],
  'map.snapshot': [Kind.TELEM],
  'region.upsert': [Kind.CMD],
  'region.confirm': [Kind.CMD],
  'zone.upsert': [Kind.CMD],
  'mcp.request': [Kind.CMD],
  'mcp.response': [Kind.EVT],
  'mcp.notification': [Kind.CMD, Kind.EVT],
};

/**
 * Runtime payload checks, run by the codec on every inbound envelope whose topic is listed here
 * (ENVELOPE.md §9: "validate every inbound message at the boundary"). An ACK is exempt — it
 * answers on the command's topic but carries an `AckPayload`.
 *
 * The topics from before P3/P4/P5 are not listed yet: their handlers check the payload
 * themselves, and moving that into the codec would turn a correlated rejection into a parse error.
 */
export const PayloadGuards: Partial<Record<TopicName, (payload: unknown) => boolean>> = {
  'sys.error': isErrorPayload,
  'sys.approval': isApprovalPayload,
  'sys.killswitch': isKillSwitchPayload,
  'sched.window': isSchedWindowPayload,
  'sched.fired': isSchedFiredPayload,
  'obs.sighting': isSightingPayload,
  'diag.fault': isFaultPayload,
  'map.snapshot': isMapSnapshotPayload,
  'state.pose': isPosePayload,
  'state.battery': isBatteryPayload,
  'region.upsert': isRegionPayload,
  'region.confirm': isRegionConfirmPayload,
  'zone.upsert': isZonePayload,
  'mcp.request': validateMCPRequest,
  'mcp.response': validateMCPResponse,
  'mcp.notification': validateMCPNotification,
};

/**
 * EVT topics that never wait in an outbox. Heartbeats and the manifest are re-published on a
 * timer, and an MCP reply answers a request that has long since timed out — a stored copy of any
 * of them is only ever stale.
 */
const NEVER_QUEUED: ReadonlySet<string> = new Set<TopicName>([
  'sys.heartbeat',
  'cap.manifest',
  'mcp.response',
  'mcp.notification',
]);

/**
 * Whether a message waits in the durable outbox when the link is down (ENVELOPE.md §5). Events
 * are facts and wait; telemetry is dropped; commands are not queued.
 */
export function queuesInOutbox(kind: Kind, topic: string): boolean {
  return kind === Kind.EVT && !NEVER_QUEUED.has(topic);
}

/**
 * Coverage guard (P0.3). Registering a topic above without giving it a payload in
 * `./registry.ts` fails the build here rather than silently leaving that topic unbound.
 */
type AssertEveryTopicHasAPayload = TopicName extends keyof import('./registry.ts').TopicPayloadMap
  ? true
  : ['topic missing from TopicPayloadMap', Exclude<TopicName, keyof import('./registry.ts').TopicPayloadMap>];
const _topicCoverage: AssertEveryTopicHasAPayload = true;
void _topicCoverage;
