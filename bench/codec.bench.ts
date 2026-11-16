/**
 * Codec speed (P5.2) — answers "is it time to leave JSON?" with a number instead of an opinion.
 *
 * ENVELOPE.md §11 fixes the condition in advance: switch to a binary encoding when a single link
 * sustains more than ~20 messages a second, or when encode + decode costs more than ~2% of the
 * Pi's CPU. This measures the second half on whatever machine it is run on.
 *
 *   bun run bench
 */

import {
  Kind,
  MapCell,
  SequenceCounter,
  SystemHealth,
  Topics,
  decode,
  encode,
  encodeCells,
  getUtf8ByteLength,
  newEnvelope,
  type Envelope,
} from '../src/index.ts';

const SWITCH_AT_MSG_PER_S = 20;
const SWITCH_AT_CPU_PCT = 2;
const MEASURE_MS = 300;

const seq = new SequenceCounter();

/** A 10 m × 10 m home at 5 cm: unknown outside, walls round the edge of a free interior. */
function homeGrid(side = 200): Uint8Array {
  const cells = new Uint8Array(side * side).fill(MapCell.UNKNOWN);
  for (let row = 20; row < side - 20; row++) {
    for (let col = 20; col < side - 20; col++) {
      const wall = row === 20 || row === side - 21 || col === 20 || col === side - 21 || (col === 100 && row % 40 > 8);
      cells[row * side + col] = wall ? MapCell.OCCUPIED : MapCell.FREE;
    }
  }
  return cells;
}

const samples: Array<[string, Envelope]> = [
  [
    'sys.heartbeat',
    newEnvelope({ kind: Kind.EVT, topic: Topics.SYS_HEARTBEAT, seq, payload: { status: SystemHealth.OK, t_wall_ms: Date.now(), battery_pct: 88 } }),
  ],
  [
    'nav.goto',
    newEnvelope({ kind: Kind.CMD, topic: Topics.NAV_GOTO, seq, expires_at: Date.now() + 60_000, payload: { x: 3.2, y: -1.1, yaw: 1.57, region: 'kitchen', goal_id: 'g-88' } }),
  ],
  [
    'obs.sighting',
    newEnvelope({ kind: Kind.EVT, topic: Topics.OBS_SIGHTING, seq, payload: { label: 'glasses', aliases: ['chashma', 'spectacles'], confidence: 0.82, region_id: 'living_room', pose: [3.1, -0.4, 0] } }),
  ],
  [
    'sched.window x20',
    newEnvelope({
      kind: Kind.CMD,
      topic: Topics.SCHED_WINDOW,
      seq,
      payload: {
        occurrences: Array.from({ length: 20 }, (_, i) => ({ occurrence_id: `oc-${i}`, reminder_id: `r-${i % 5}`, text: 'dawai ka waqt ho gaya', due_time_ms: Date.now() + i * 3_600_000 })),
      },
    }),
  ],
  [
    'map.snapshot 200x200',
    newEnvelope({ kind: Kind.TELEM, topic: Topics.MAP_SNAPSHOT, seq, payload: { width: 200, height: 200, resolution: 0.05, origin: { x: -5, y: -5 }, cells: encodeCells(homeGrid()) } }),
  ],
];

console.log(`${'message'.padEnd(22)} ${'bytes'.padStart(7)} ${'µs/round trip'.padStart(14)} ${'round trips/s'.padStart(14)} ${`% of a core at ${SWITCH_AT_MSG_PER_S}/s`.padStart(22)}`);

let worstPct = 0;
for (const [name, envelope] of samples) {
  for (let i = 0; i < 2_000; i++) decode(encode(envelope));

  let rounds = 0;
  const start = performance.now();
  while (performance.now() - start < MEASURE_MS) {
    for (let i = 0; i < 100; i++) decode(encode(envelope));
    rounds += 100;
  }
  const microseconds = ((performance.now() - start) * 1000) / rounds;
  const pct = (SWITCH_AT_MSG_PER_S * microseconds) / 10_000;
  worstPct = Math.max(worstPct, pct);

  console.log(
    `${name.padEnd(22)} ${String(getUtf8ByteLength(encode(envelope))).padStart(7)} ${microseconds.toFixed(2).padStart(14)} ${Math.round(1e6 / microseconds).toLocaleString('en').padStart(14)} ${pct.toFixed(4).padStart(22)}`
  );
}

console.log(
  `\nWorst case: ${worstPct.toFixed(4)}% of one core at ${SWITCH_AT_MSG_PER_S} msg/s. ` +
    `The switch condition is ${SWITCH_AT_CPU_PCT}% — this machine would have to be ${Math.floor(SWITCH_AT_CPU_PCT / worstPct)}x slower to reach it.`
);
