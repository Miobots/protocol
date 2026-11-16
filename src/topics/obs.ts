/** `obs.sighting` (P3.1) — "I saw a thing". The fact that feeds memory. */

import { isNumber, isPose, isRecord, isText, type Pose } from './guards.ts';

export interface SightingPayload {
  label: string;
  /**
   * Other names for the same thing, Urdu and English. Required, even if empty: they are the whole
   * reason "chashma kahan hai?" finds a row labelled "glasses".
   */
  aliases: string[];
  /** 0 to 1. */
  confidence: number;
  /** Absent when the robot is somewhere nobody has labelled yet. */
  region_id?: string;
  pose: Pose;
  /** Announces a picture sent over the bulk channel. The image itself never rides in an envelope. */
  thumbnail_url?: string;
}

export function isSightingPayload(value: unknown): value is SightingPayload {
  return (
    isRecord(value) &&
    isText(value.label) &&
    Array.isArray(value.aliases) &&
    value.aliases.every(isText) &&
    isNumber(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    isPose(value.pose) &&
    (value.region_id === undefined || isText(value.region_id)) &&
    (value.thumbnail_url === undefined || isText(value.thumbnail_url))
  );
}
