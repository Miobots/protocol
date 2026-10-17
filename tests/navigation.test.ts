import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  navigationPayloadReason,
  navigationCancelReason,
  parseNavDistance,
} from '../src/simulator/fake-heart.ts';
import type { NavResultPayload } from '../src/index.ts';

describe('Fake Heart navigation payload validation', () => {
  it('rejects a malformed nav.goto payload', () => {
    const malformed: unknown = {
      goal_id: 'g-88',
      x: 3.2,
      // y is required when region is absent.
    };

    assert.equal(navigationPayloadReason(malformed), 'invalid_navigation_payload');
  });

  it('returns goal_not_found for a cancel targeting another goal', () => {
    const active = {
      goalId: 'g-88',
      corrId: 'corr-88',
      distanceRemainingM: 2,
      startedAtMs: Date.now(),
      finalPose: { x: 3.2, y: -1.1, yaw: 1.57 } satisfies NavResultPayload['final_pose'],
    };

    assert.equal(navigationCancelReason(active, 'g-99'), 'goal_not_found');
  });
});
describe('Fake Heart drive length (FAKE_HEART_NAV_DISTANCE_M)', () => {
  it('uses the configured distance and falls back to 5 m on anything unusable', () => {
    assert.equal(parseNavDistance('30'), 30);
    for (const bad of [undefined, '', 'abc', '0', '-3']) assert.equal(parseNavDistance(bad), 5);
  });
});
