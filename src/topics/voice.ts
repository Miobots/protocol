/**
 * Voice Interaction Topic Types.
 */

import { Language, Priority } from '../constants/index.ts';
import { isRecord, isText } from './guards.ts';

export interface SpeakPayload {
  text: string;
  lang: Language;
  priority?: Priority;
}

export function isSpeakPayload(value: unknown): value is SpeakPayload {
  return isRecord(value) && isText(value.text) &&
    Object.values(Language).includes(value.lang as Language) &&
    (value.priority === undefined || Object.values(Priority).includes(value.priority as Priority));
}
