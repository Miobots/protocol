import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Kind, Topics, isSightingPayload, newEnvelope, type Envelope } from '../src/index.ts';
import {
  cacheWindow,
  confirmDelivered,
  enqueue,
  pendingEvents,
  resetOutbox,
  resetSchedule,
  sightingAt,
} from '../src/simulator/fake-heart.ts';

function fired(occurrenceId: string): Envelope {
  return newEnvelope({ kind: Kind.EVT, topic: Topics.SCHED_FIRED, payload: { occurrence_id: occurrenceId }, seq: 0 });
}

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Fake Heart outbox (P4.3)', () => {
  beforeEach(() => {
    resetOutbox();
    resetSchedule();
  });

  it('keeps events in order and trims only the ones Brain names', () => {
    const [a, b, c] = [fired('oc-1'), fired('oc-2'), fired('oc-3')];
    enqueue(a);
    enqueue(b);
    enqueue(c);
    assert.deepEqual(pendingEvents().map((e) => e.msg_id), [a.msg_id, b.msg_id, c.msg_id]);

    // Brain confirms the middle one and one it was never sent: only the real one goes.
    assert.equal(confirmDelivered([b.msg_id, 'never-sent']), 1);
    assert.deepEqual(pendingEvents().map((e) => e.msg_id), [a.msg_id, c.msg_id]);
  });
});

describe('Fake Heart schedule (P4.2)', () => {
  beforeEach(() => {
    resetOutbox();
    resetSchedule();
  });

  it('fires with no Brain connected, and never announces one occurrence twice', async () => {
    const window = {
      occurrences: [
        { occurrence_id: 'oc-11', reminder_id: 'r-3', text: 'meeting in 10 minutes', due_time_ms: Date.now() + 10 },
        { occurrence_id: 'oc-12', reminder_id: 'r-4', text: 'much later', due_time_ms: Date.now() + 60_000 },
      ],
    };

    cacheWindow(window);
    await settle(60);
    const waiting = pendingEvents();
    assert.equal(waiting.length, 1);
    assert.equal(waiting[0]!.topic, Topics.SCHED_FIRED);
    assert.deepEqual(waiting[0]!.payload, { occurrence_id: 'oc-11' });

    // Brain re-pushes the window on reconnect. oc-11 is overdue in it, and must stay silent.
    cacheWindow(window);
    await settle(60);
    assert.equal(pendingEvents().length, 1);

    resetSchedule();
  });
});

describe('Fake Heart invented sightings (P3.2)', () => {
  it('cycles through sightings that pass the wire check', () => {
    const labels = [0, 1, 2, 3, 4].map((tick) => sightingAt(tick).label);
    assert.deepEqual(labels, ['glasses', 'keys', 'wallet', 'medicine', 'glasses']);
    for (let tick = 0; tick < 4; tick++) assert.equal(isSightingPayload(sightingAt(tick)), true);
  });
});
