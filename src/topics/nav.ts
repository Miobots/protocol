/** Payloads for the long-running navigation lifecycle. */

export interface NavGotoPayload {
  region: string;
  goal_id: string;
}

export interface NavCancelPayload {
  goal_id: string;
}

export interface NavFeedbackPayload {
  goal_id: string;
  distance_remaining_m: number;
}

export type NavResultStatus = 'reached' | 'cancelled' | 'failed';

export interface NavResultPayload {
  goal_id: string;
  status: NavResultStatus;
}