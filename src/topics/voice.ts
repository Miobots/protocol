/**
 * Voice Interaction Topic Types.
 */

import type { Language, Priority } from '../constants/index.ts';

export interface SpeakPayload {
  text: string;
  lang: Language;
  priority?: Priority;
}
