/**
 * Topic → payload registry.
 *
 * P0.3's exit check is "typecheck binds topic to payload". Listing the topics and the payload
 * interfaces separately does not do that — it leaves the binding to a hand-written generic
 * argument at each call site, which is a convention, not a check.
 *
 * This file is the binding. It is types only, so importing it from `envelope.ts` is erased at
 * compile time and creates no runtime cycle with `sys.ts` (which imports `newEnvelope`).
 *
 * Adding a topic to `Topics` without adding it here is a compile error — see the coverage
 * assertion at the bottom of `./index.ts`.
 */

import type { HeartbeatPayload, HelloPayload, WelcomePayload } from './sys.ts';
import type { SpeakPayload } from './voice.ts';
import type { CapabilityManifestPayload } from './capability.ts';
import type {
  NavCancelPayload,
  NavFeedbackPayload,
  NavGotoPayload,
  NavResultPayload,
} from './nav.ts';
import type { BatteryPayload, PosePayload } from './state.ts';

/**
 * The payload each registered topic carries in its own direction — the CMD for a command topic,
 * the EVT for an event topic, the TELEM for a reading, the RPY for a query.
 *
 * Keys are literals rather than `typeof Topics.X` so that this stays a type-only module.
 */
export interface TopicPayloadMap {
  'sys.hello': HelloPayload;
  'sys.welcome': WelcomePayload;
  'sys.heartbeat': HeartbeatPayload;
  'cap.manifest': CapabilityManifestPayload;
  'voice.speak': SpeakPayload;
  'nav.goto': NavGotoPayload;
  'nav.cancel': NavCancelPayload;
  'nav.feedback': NavFeedbackPayload;
  'nav.result': NavResultPayload;
  'state.pose': PosePayload;
  'state.battery': BatteryPayload;
}

export type RegisteredTopic = keyof TopicPayloadMap;
