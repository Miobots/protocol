import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  TeleopDefaults,
  encodeTeleopFrame,
  parseTeleopFrame,
  teleopConnectionLost,
  type TeleopFrame,
} from '../src/index.ts';

interface TeleopVector {
  description: string;
  raw: string;
  expect: { parses: boolean; frame?: TeleopFrame };
}

const vectors: TeleopVector[] = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'conformance', 'teleop.json'), 'utf-8'));

describe('Teleop frames (P2.6) — conformance/teleop.json', () => {
  for (const vector of vectors) {
    it(`${vector.expect.parses ? 'parses' : 'drops'}: ${vector.description}`, () => {
      const frame = parseTeleopFrame(vector.raw);
      if (!vector.expect.parses) {
        assert.equal(frame, undefined);
        return;
      }
      assert.deepEqual(frame, vector.expect.frame);
      assert.deepEqual(parseTeleopFrame(encodeTeleopFrame(frame!)), frame);
    });
  }

  it('drops a frame over the size cap before parsing it', () => {
    const long = encodeTeleopFrame({ t: 'hello', token: 'x'.repeat(TeleopDefaults.MAX_FRAME_CHARS), protocol_version: 1 });
    assert.equal(parseTeleopFrame(long), undefined);
  });

  it('calls the connection lost when the robot says so, or goes quiet for a deadman window', () => {
    const driving = { t: 'status', seq: 7, deadman: false } as const;
    assert.equal(teleopConnectionLost(undefined, 0, 1000), true);
    assert.equal(teleopConnectionLost(driving, 1000, 1000 + TeleopDefaults.DEADMAN_MS - 1), false);
    assert.equal(teleopConnectionLost(driving, 1000, 1000 + TeleopDefaults.DEADMAN_MS), true);
    assert.equal(teleopConnectionLost({ ...driving, deadman: true }, 1000, 1001), true);
  });
});
