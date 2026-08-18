/**
 * Message Kind Constants.
 */

export const Kind = {
  CMD: 'CMD',
  ACK: 'ACK',
  EVT: 'EVT',
  TELEM: 'TELEM',
  QRY: 'QRY',
  RPY: 'RPY',
  ERR: 'ERR',
} as const;

export type Kind = (typeof Kind)[keyof typeof Kind];
