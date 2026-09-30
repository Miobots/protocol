import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Kind, Topics, TopicKind, queuesInOutbox, newEnvelope } from '../src/index.ts';

describe('Telemetry topics (P2.4)', () => {
  it('state.pose and state.battery are classified as TELEM', () => {
    assert.equal(TopicKind[Topics.STATE_POSE], Kind.TELEM);
    assert.equal(TopicKind[Topics.STATE_BATTERY], Kind.TELEM);
  });

  it('the outbox ignores telemetry but keeps events', () => {
    const pose = newEnvelope({
      kind: TopicKind[Topics.STATE_POSE],
      topic: Topics.STATE_POSE,
      payload: { x: 3.2, y: -0.8, yaw: 0.78, confidence: 0.98 },
      seq: 1,
    });
    const battery = newEnvelope({
      kind: TopicKind[Topics.STATE_BATTERY],
      topic: Topics.STATE_BATTERY,
      payload: { percentage: 76.5, voltage: 15.2, is_charging: false },
      seq: 2,
    });
    assert.equal(queuesInOutbox(pose.kind), false);
    assert.equal(queuesInOutbox(battery.kind), false);
    assert.equal(queuesInOutbox(TopicKind[Topics.NAV_RESULT]), true);
  });
});
