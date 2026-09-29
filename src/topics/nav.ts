/** Payloads for the long-running navigation lifecycle. */

export interface NavGotoPayload {
  /** Provide either a named region or map coordinates (`x` and `y`). */
  region?: string;
  x?: number;
  y?: number;
  yaw?: number;
  goal_id: string;
}

export interface NavCancelPayload {
  goal_id: string;
}

export interface NavFeedbackPayload {
  distance_remaining_m: number;
  estimated_time_remaining_s: number;
}

export interface NavResultPayload {
  success: boolean;
  total_time_s: number;
  final_pose: {
    x: number;
    y: number;
    yaw: number;
  };
  reason?: string;
}
