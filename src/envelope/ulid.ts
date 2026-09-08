/**
 * Zero-dependency ULID generator.
 * Uses Crockford's Base32 character set with 48-bit timestamp and 80-bit randomness.
 */

import { ProtocolDefaults } from '../constants/index.ts';

const ALPHABET = ProtocolDefaults.CROCKFORD_BASE32_ALPHABET;

function encodeTime(now: number, len: number): string {
  let str = '';
  let time = now;
  for (let i = len - 1; i >= 0; i--) {
    const mod = time % 32;
    str = ALPHABET.charAt(mod) + str;
    time = (time - mod) / 32;
  }
  return str;
}

function getRandomBytes(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

function encodeRandom(len: number): string {
  const bytes = getRandomBytes(len);
  let str = '';
  for (let i = 0; i < len; i++) {
    const byte = bytes[i] ?? 0;
    str += ALPHABET.charAt(byte % 32);
  }
  return str;
}

/**
 * Generates a 26-character canonical ULID string.
 */
export function generateUlid(timestamp: number = Date.now()): string {
  const timePart = encodeTime(timestamp, ProtocolDefaults.ULID_TIME_LEN);
  const randomPart = encodeRandom(ProtocolDefaults.ULID_RANDOM_LEN);
  return `${timePart}${randomPart}`;
}
