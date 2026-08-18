/**
 * Canonical Topic Registry and Payload Types.
 */

export const Topics = {
  // System Lifecycle & Authentication
  SYS_HELLO: 'sys.hello',
  SYS_WELCOME: 'sys.welcome',
  SYS_HEARTBEAT: 'sys.heartbeat',

  // Voice Interaction
  VOICE_SPEAK: 'voice.speak',
} as const;

export type TopicName = (typeof Topics)[keyof typeof Topics];

export * from './sys.ts';
export * from './voice.ts';
