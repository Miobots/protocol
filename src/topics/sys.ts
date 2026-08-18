/**
 * System Lifecycle & Authentication Topic Types.
 */

import type { DeviceRole, SystemHealth } from '../constants/index.ts';

export interface HelloPayload {
  device_id: string;
  token: string;
  protocol_version: number;
  role: DeviceRole;
  client_wall_ms?: number;
  capabilities?: string[];
}

export interface WelcomePayload {
  accepted: boolean;
  session_id: string;
  server_wall_ms: number;
  reason?: string;
}

export interface HeartbeatPayload {
  status: SystemHealth;
  t_wall_ms: number;
  battery_pct?: number;
}
