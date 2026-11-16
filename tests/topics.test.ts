import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  Kind,
  MapCell,
  SequenceCounter,
  Topics,
  decode,
  decodeCells,
  encode,
  encodeCells,
  isMapSnapshotPayload,
  newEnvelope,
  type MapSnapshotPayload,
} from '../src/index.ts';

describe('Map snapshot cells (P2.5)', () => {
  it('survive a run-length round trip, through the codec', () => {
    const { UNKNOWN: U, FREE: F, OCCUPIED: X } = MapCell;
    // 4 wide, 3 tall, row 0 at the top.
    const cells = Uint8Array.from([U, U, U, U, F, F, F, X, F, F, F, F]);
    const payload: MapSnapshotPayload = {
      width: 4,
      height: 3,
      resolution: 0.05,
      origin: { x: -3.952, y: -2.949 },
      cells: encodeCells(cells),
    };
    assert.deepEqual(payload.cells, [U, 4, F, 3, X, 1, F, 4]);

    const wire = encode(newEnvelope({ kind: Kind.TELEM, topic: Topics.MAP_SNAPSHOT, payload, seq: new SequenceCounter() }));
    const received = decode<typeof Topics.MAP_SNAPSHOT, MapSnapshotPayload>(wire).payload;
    assert.deepEqual(decodeCells(received), cells);
  });

  it('refuses a grid that claims more cells than it describes, or none', () => {
    const base = { width: 2, height: 2, resolution: 0.05, origin: { x: 0, y: 0 } };
    assert.equal(isMapSnapshotPayload({ ...base, cells: [MapCell.FREE, 4] }), true);
    assert.equal(isMapSnapshotPayload({ ...base, cells: [MapCell.FREE, 3] }), false);
    assert.equal(isMapSnapshotPayload({ ...base, cells: [MapCell.FREE, 5] }), false);
    assert.equal(isMapSnapshotPayload({ ...base, cells: [7, 4] }), false);
    assert.equal(isMapSnapshotPayload({ ...base, cells: [MapCell.FREE] }), false);
    assert.equal(isMapSnapshotPayload({ ...base, width: 100_000, height: 100_000, cells: [MapCell.FREE, 1e10] }), false);
  });
});

describe('New topics are bound to their payloads at compile time (P0.3)', () => {
  it('rejects the wrong shape for a registered topic', () => {
    const seq = new SequenceCounter();
    newEnvelope({ kind: Kind.EVT, topic: Topics.SCHED_FIRED, payload: { occurrence_id: 'oc-11' }, seq });
    newEnvelope({ kind: Kind.CMD, topic: Topics.SYS_KILLSWITCH, payload: { active: true }, seq });

    // @ts-expect-error — a fired reminder is named by its occurrence, not by its text
    newEnvelope({ kind: Kind.EVT, topic: Topics.SCHED_FIRED, payload: { text: 'meeting' }, seq });
    // @ts-expect-error — a fault carries a code and a severity, never a bare message
    newEnvelope({ kind: Kind.EVT, topic: Topics.DIAG_FAULT, payload: { message: 'left encoder stopped' }, seq });
    // @ts-expect-error — a region needs an outline and to say whether a human has agreed
    newEnvelope({ kind: Kind.CMD, topic: Topics.REGION_UPSERT, payload: { region_id: 'kitchen' }, seq });
  });
});
