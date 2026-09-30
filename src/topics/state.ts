/** Telemetry payloads — readings of *now*, discarded rather than queued when the link is down. */

export interface PosePayload {
  x: number;
  y: number;
  yaw: number;
  confidence: number;
}

export interface BatteryPayload {
  percentage: number;
  voltage: number;
  is_charging: boolean;
}
