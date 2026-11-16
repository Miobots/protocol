/**
 * Reminders (P4.1). Brain expands recurrence rules and pushes concrete occurrences; the robot
 * never sees a rule, only moments.
 */

import { isNumber, isRecord, isText } from './guards.ts';

export interface ScheduleOccurrence {
  /** One specific moment of one reminder. `sched.fired` and Brain's de-duplication key on this. */
  occurrence_id: string;
  reminder_id: string;
  text: string;
  due_time_ms: number;
}

/**
 * `sched.window` — the whole next 72 h. It **replaces** whatever the robot held; it is not a
 * delta, so a robot offline for a day never replays a pile of stale edits (ENVELOPE.md §5).
 */
export interface SchedWindowPayload {
  occurrences: ScheduleOccurrence[];
}

/**
 * `sched.fired` — "I announced it." *When* is the envelope's own `t_wall_ms`, which is stamped at
 * the announcement and survives a wait in the outbox.
 */
export interface SchedFiredPayload {
  occurrence_id: string;
}

export function isSchedWindowPayload(value: unknown): value is SchedWindowPayload {
  return (
    isRecord(value) &&
    Array.isArray(value.occurrences) &&
    value.occurrences.every(
      (o) => isRecord(o) && isText(o.occurrence_id) && isText(o.reminder_id) && isText(o.text) && isNumber(o.due_time_ms)
    )
  );
}

export function isSchedFiredPayload(value: unknown): value is SchedFiredPayload {
  return isRecord(value) && isText(value.occurrence_id);
}
