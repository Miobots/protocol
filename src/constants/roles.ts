export const DeviceRole = {
  HEART: 'heart',
  SYNAPSE: 'synapse',
  GANGLION: 'ganglion',
} as const;

export const Language = {
  EN: 'en',
  UR: 'ur',
  MIXED: 'mixed',
} as const;

export const ExecutionStatus = {
  QUEUED: 'queued',
  EXECUTING: 'executing',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
} as const;

export const Priority = {
  NORMAL: 'normal',
  URGENT: 'urgent',
} as const;

export const SystemHealth = {
  OK: 'ok',
  DEGRADED: 'degraded',
  FAULT: 'fault',
} as const;

export type DeviceRole = (typeof DeviceRole)[keyof typeof DeviceRole];
export type Language = (typeof Language)[keyof typeof Language];
export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];
export type Priority = (typeof Priority)[keyof typeof Priority];
export type SystemHealth = (typeof SystemHealth)[keyof typeof SystemHealth];
