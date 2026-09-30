/**
 * Canonical Topic Registry and Payload Types.
 */

import { Kind } from '../constants/index.ts';

export const Topics = {
  // System Lifecycle & Authentication
  SYS_HELLO: 'sys.hello',
  SYS_WELCOME: 'sys.welcome',
  SYS_HEARTBEAT: 'sys.heartbeat',
  CAP_MANIFEST: 'cap.manifest',

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
} as const;

export type TopicName = (typeof Topics)[keyof typeof Topics];

export * from './sys.ts';
export * from './voice.ts';
export * from './capability.ts';
export * from './nav.ts';
export * from './state.ts';
export type * from './registry.ts';

/**
 * The kind each topic is sent as (ENVELOPE.md §10). EVT vs TELEM is decided here, once per topic,
 * and `Record` makes a new topic without a classification a compile error.
 */
export const TopicKind: Record<TopicName, Kind> = {
  'sys.hello': Kind.CMD,
  'sys.welcome': Kind.ACK,
  'sys.heartbeat': Kind.EVT,
  'cap.manifest': Kind.EVT,
  'voice.speak': Kind.CMD,
  'nav.goto': Kind.CMD,
  'nav.cancel': Kind.CMD,
  'nav.feedback': Kind.EVT,
  'nav.result': Kind.EVT,
  'state.pose': Kind.TELEM,
  'state.battery': Kind.TELEM,
};

/** Only events wait in the durable outbox; telemetry is dropped and commands are not queued (ENVELOPE.md §5). */
export function queuesInOutbox(kind: Kind): boolean {
  return kind === Kind.EVT;
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