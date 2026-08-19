/**
 * Per-connection, per-direction sequence counters and gap detectors.
 * Conforms to ENVELOPE.md §6.
 */

import { Kind } from '../constants/index.ts';

/**
 * Isolated monotonic sequence counter for a single connection in one direction.
 */
export class SequenceCounter {
  private currentSeq: number;

  constructor(initialValue: number = 0) {
    this.currentSeq = initialValue >>> 0;
  }

  /**
   * Advances and returns the next sequence number (uint32).
   */
  public next(): number {
    this.currentSeq = (this.currentSeq + 1) >>> 0;
    return this.currentSeq;
  }

  /**
   * Returns the current sequence number without advancing.
   */
  public current(): number {
    return this.currentSeq;
  }

  /**
   * Resets the counter to a given initial value.
   */
  public reset(initialValue: number = 0): void {
    this.currentSeq = initialValue >>> 0;
  }
}

/**
 * Factory helper to create an isolated sequence counter.
 */
export function createSequenceCounter(initialValue: number = 0): SequenceCounter {
  return new SequenceCounter(initialValue);
}

export interface SequenceEvaluationResult {
  valid: boolean;
  gap: boolean;
  gapSize: number;
  droppedOldTelemetry: boolean;
  expectedSeq: number;
  receivedSeq: number;
  message?: string;
}

/**
 * Inbound sequence gap and stale telemetry detector per connection/topic.
 */
export class SequenceGapDetector {
  private lastSeenSeq: number | null = null;

  constructor(initialLastSeen?: number) {
    if (initialLastSeen !== undefined) {
      this.lastSeenSeq = initialLastSeen >>> 0;
    }
  }

  /**
   * Evaluates an incoming message's sequence number against prior history.
   */
  public evaluate(seq: number, kind: Kind = Kind.EVT): SequenceEvaluationResult {
    const receivedSeq = seq >>> 0;

    if (this.lastSeenSeq === null) {
      this.lastSeenSeq = receivedSeq;
      return {
        valid: true,
        gap: false,
        gapSize: 0,
        droppedOldTelemetry: false,
        expectedSeq: receivedSeq,
        receivedSeq,
      };
    }

    const expectedSeq = (this.lastSeenSeq + 1) >>> 0;

    // Rule 1: TELEM with seq <= lastSeenSeq is dropped (stale readings are discarded)
    if (kind === Kind.TELEM && receivedSeq <= this.lastSeenSeq) {
      return {
        valid: true,
        gap: false,
        gapSize: 0,
        droppedOldTelemetry: true,
        expectedSeq,
        receivedSeq,
        message: `Discarded stale telemetry sequence ${receivedSeq} (newest seen was ${this.lastSeenSeq})`,
      };
    }

    // Rule 2: EVT arriving out of order is still processed, but gaps are detected
    let hasGap = false;
    let gapSize = 0;

    if (receivedSeq > expectedSeq) {
      hasGap = true;
      gapSize = receivedSeq - expectedSeq;
    }

    this.lastSeenSeq = Math.max(this.lastSeenSeq, receivedSeq);

    return {
      valid: true,
      gap: hasGap,
      gapSize,
      droppedOldTelemetry: false,
      expectedSeq,
      receivedSeq,
      message: hasGap
        ? `Sequence gap detected: expected ${expectedSeq}, received ${receivedSeq} (missing ${gapSize} message(s))`
        : undefined,
    };
  }

  /**
   * Returns the highest sequence number seen so far.
   */
  public getLastSeen(): number | null {
    return this.lastSeenSeq;
  }

  /**
   * Resets the gap detector state.
   */
  public reset(initialLastSeen?: number): void {
    this.lastSeenSeq = initialLastSeen !== undefined ? initialLastSeen >>> 0 : null;
  }
}
