/** `diag.fault` (P3.3) — a structured fault. The robot reports a code; Brain writes the sentence. */

import { isPose, isRecord, isText, type Pose } from './guards.ts';

export const FaultSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

export type FaultSeverity = (typeof FaultSeverity)[keyof typeof FaultSeverity];

export interface FaultPayload {
  subsystem: string;
  /**
   * `ENCODER_LEFT_NO_DATA`, never "the left encoder stopped". Prose from the robot could only ever
   * be shown in the language the robot wrote it in.
   */
  code: string;
  severity: FaultSeverity;
  recovery_hint?: string;
  /** Where the robot was when it happened. */
  pose?: Pose;
}

const FAULT_CODE = /^[A-Z][A-Z0-9_]*$/;
const SEVERITIES = new Set<unknown>(Object.values(FaultSeverity));

export function isFaultPayload(value: unknown): value is FaultPayload {
  return (
    isRecord(value) &&
    isText(value.subsystem) &&
    typeof value.code === 'string' &&
    FAULT_CODE.test(value.code) &&
    SEVERITIES.has(value.severity) &&
    (value.recovery_hint === undefined || isText(value.recovery_hint)) &&
    (value.pose === undefined || isPose(value.pose))
  );
}
