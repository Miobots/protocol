/**
 * Capability manifest — `cap.manifest`.
 *
 * The manifest arrives in **two halves** (TASKS.md S1.2). The robot publishes what the robot can
 * verify; the Brain publishes the cloud side. Each half can be missing on its own, and the app
 * renders the union — so the IDs have to be agreed here, on the wire, rather than re-typed by hand
 * in each consumer.
 */

/** available · degraded (carries a `note`) · unavailable (carries a `reason`). */
export type CapabilityState = 'available' | 'unavailable' | 'degraded';

export interface CapabilityStatus {
  state: CapabilityState;
  /** Why it cannot be used. Required in spirit when `state` is `unavailable`. */
  reason?: string;
  /** What still works, and how it is reduced. Required in spirit when `state` is `degraded`. */
  note?: string;
}

/**
 * The robot's half — "driving, docking, recording, local voice, its own health" (TASKS.md S1.2).
 */
export const HeartCapabilities = {
  DRIVING: 'driving',
  DOCKING: 'docking',
  RECORDING: 'recording',
  LOCAL_VOICE: 'local-voice',
  ROBOT_HEALTH: 'robot-health',
} as const;

/**
 * The Brain's half — "smart home, the laptop daemon, memory" (TASKS.md S1.2).
 *
 * No publisher exists for this half yet; TASK_LEDGER.md:500 already flags it as blocking I2. The
 * IDs are pinned here so that whoever writes that publisher and whoever renders it agree by
 * construction rather than by memory.
 */
export const BrainCapabilities = {
  SMART_HOME: 'smart-home',
  LAPTOP_DAEMON: 'laptop-daemon',
  MEMORY: 'memory',
} as const;

export type HeartCapabilityId = (typeof HeartCapabilities)[keyof typeof HeartCapabilities];
export type BrainCapabilityId = (typeof BrainCapabilities)[keyof typeof BrainCapabilities];
export type CapabilityId = HeartCapabilityId | BrainCapabilityId;

export interface CapabilityManifestPayload {
  /**
   * Keyed by {@link CapabilityId}. A `string` index is kept deliberately: a half may announce a
   * capability this build has never heard of, and the app must render it rather than drop it.
   */
  capabilities: Record<string, CapabilityStatus>;
}
