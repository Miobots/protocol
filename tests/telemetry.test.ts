import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Kind, Topics, TopicKind, queuesInOutbox, newEnvelope, encode, parse, isNavGotoPayload } from '../src/index.ts';

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
    assert.equal(queuesInOutbox(pose.kind, pose.topic), false);
    assert.equal(queuesInOutbox(battery.kind, battery.topic), false);
    assert.equal(queuesInOutbox(TopicKind[Topics.NAV_RESULT], Topics.NAV_RESULT), true);
  });

  it('the map is telemetry too, and periodic or request/response events never queue', () => {
    assert.equal(queuesInOutbox(TopicKind[Topics.MAP_SNAPSHOT], Topics.MAP_SNAPSHOT), false);
    for (const topic of [Topics.SYS_HEARTBEAT, Topics.CAP_MANIFEST, Topics.MCP_RESPONSE, Topics.MCP_NOTIFICATION]) {
      assert.equal(queuesInOutbox(Kind.EVT, topic), false, topic);
    }
    for (const topic of [Topics.SCHED_FIRED, Topics.OBS_SIGHTING, Topics.DIAG_FAULT, Topics.NAV_FEEDBACK]) {
      assert.equal(queuesInOutbox(TopicKind[topic], topic), true, topic);
    }
  });

  it('rejects malformed pose and battery telemetry before a consumer sees it', () => {
    const badPose = newEnvelope({ kind: Kind.TELEM, topic: Topics.STATE_POSE,
      payload: { x: 0, y: 0, yaw: 0, confidence: 2 }, seq: 1 });
    const badBattery = newEnvelope({ kind: Kind.TELEM, topic: Topics.STATE_BATTERY,
      payload: { percentage: 150, voltage: 12, is_charging: false }, seq: 2 });
    assert.equal(parse(encode(badPose)).success, false);
    assert.equal(parse(encode(badBattery)).success, false);
    assert.equal(isNavGotoPayload({ goal_id: 'g', x: 1 }), false);
    assert.equal(isNavGotoPayload({ goal_id: 'g', x: 1, y: 2 }), true);
  });
});
