/**
 * Canonical Topic Registry and Payload Types.
 */

export const Topics = {
  // System Lifecycle & Authentication
  SYS_HELLO: 'sys.hello',
  SYS_WELCOME: 'sys.welcome',
  SYS_HEARTBEAT: 'sys.heartbeat',
  CAP_MANIFEST: 'cap.manifest',

  // Voice Interaction
  VOICE_SPEAK: 'voice.speak',
} as const;

export type TopicName = (typeof Topics)[keyof typeof Topics];

export * from './sys.ts';
export * from './voice.ts';
export * from './capability.ts';
export type * from './registry.ts';

/**
 * Coverage guard (P0.3). Registering a topic above without giving it a payload in
 * `./registry.ts` fails the build here rather than silently leaving that topic unbound.
 */
type AssertEveryTopicHasAPayload = TopicName extends keyof import('./registry.ts').TopicPayloadMap
  ? true
  : ['topic missing from TopicPayloadMap', Exclude<TopicName, keyof import('./registry.ts').TopicPayloadMap>];
const _topicCoverage: AssertEveryTopicHasAPayload = true;
void _topicCoverage;