/** Telemetry payloads — readings of *now*, discarded rather than queued when the link is down. */

import { isNumber, isRecord } from './guards.ts';

export interface PosePayload {
  x: number;
  y: number;
  yaw: number;
  confidence: number;
}

export function isPosePayload(value: unknown): value is PosePayload {
  return isRecord(value) && isNumber(value.x) && isNumber(value.y) &&
    isNumber(value.yaw) && isNumber(value.confidence) && value.confidence >= 0 && value.confidence <= 1;
}

export interface BatteryPayload {
  percentage: number;
  voltage: number;
  is_charging: boolean;
}

export function isBatteryPayload(value: unknown): value is BatteryPayload {
  return isRecord(value) && isNumber(value.percentage) && value.percentage >= 0 && value.percentage <= 100 &&
    isNumber(value.voltage) && value.voltage >= 0 && typeof value.is_charging === 'boolean';
}
