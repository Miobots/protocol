/**
 * The Fake Heart over a real socket, against a stand-in Brain. Everything else in this suite tests
 * its pure helpers; this is the one place the wire behaviour itself is exercised.
 */

import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';

import {
  Kind,
  SequenceCounter,
  Topics,
  createWelcomeAck,
  decode,
  encode,
  newEnvelope,
  type AckPayload,
  type Envelope,
  type SchedFiredPayload,
} from '../src/index.ts';

const SIMULATOR = join(import.meta.dirname, '..', 'src', 'simulator', 'fake-heart.ts');

interface Received {
  connection: number;
  env: Envelope;
}

it('reminders fire with Brain away, then arrive in order and are trimmed only on a receipt (P4.2, P4.3)', { timeout: 20_000 }, async () => {
  const server = new WebSocketServer({ port: 0 });
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  const received: Received[] = [];
  let connection = 0;
  let socket: WebSocket | undefined;
  let seq = new SequenceCounter();

  server.on('connection', (ws) => {
    const mine = ++connection;
    socket = ws;
    seq = new SequenceCounter();
    ws.on('message', (raw) => {
      const env = decode(raw.toString());
      if (env.topic === Topics.SYS_HELLO) ws.send(encode(createWelcomeAck(env, { accepted: true, seq })));
      received.push({ connection: mine, env });
    });
  });

  /** Polls for the first message from the robot that matches. */
  async function expectFromRobot(what: string, match: (r: Received) => boolean): Promise<Received> {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      const hit = received.find(match);
      if (hit) return hit;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${what}`);
  }

  const send = (env: Envelope) => socket!.send(encode(env));
  const ackOf = (env: Envelope) =>
    expectFromRobot(`the ACK of ${env.topic}`, (r) => r.env.kind === Kind.ACK && r.env.corr_id === env.corr_id);

  const robot = spawn(process.execPath, ['run', SIMULATOR], {
    env: { ...process.env, BRAIN_URL: `ws://localhost:${port}` },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  try {
    await expectFromRobot('the first hello', (r) => r.env.topic === Topics.SYS_HELLO);

    // An unknown topic is answered with an ERR naming the message, and the link stays up (§9).
    const stranger = newEnvelope({ kind: Kind.EVT, topic: 'test.unknown', payload: {}, seq });
    send(stranger);
    const error = await expectFromRobot('an ERR', (r) => r.env.kind === Kind.ERR);
    assert.equal(error.env.topic, Topics.SYS_ERROR);
    assert.deepEqual(error.env.payload, { reason: 'unknown_topic', msg_id: stranger.msg_id });

    // The same command twice is run once: the second ACK is the first one, replayed (§4).
    const speak = newEnvelope({ kind: Kind.CMD, topic: Topics.VOICE_SPEAK, payload: { text: 'salam', lang: 'ur' }, seq });
    send(speak);
    await ackOf(speak);
    send({ ...speak, seq: seq.next() });
    await expectFromRobot(
      'the replayed ACK',
      (r) => received.filter((x) => x.env.kind === Kind.ACK && x.env.corr_id === speak.corr_id).length === 2 && r === received.at(-1)
    );
    const speakAcks = received.filter((r) => r.env.kind === Kind.ACK && r.env.corr_id === speak.corr_id);
    assert.equal(speakAcks[0]!.env.msg_id, speakAcks[1]!.env.msg_id);

    // Three reminders, all due before the robot's first reconnect attempt (0.5 s at the earliest).
    const now = Date.now();
    const window = newEnvelope({
      kind: Kind.CMD,
      topic: Topics.SCHED_WINDOW,
      seq,
      payload: {
        occurrences: ['oc-1', 'oc-2', 'oc-3'].map((occurrence_id, i) => ({
          occurrence_id,
          reminder_id: 'r-1',
          text: `reminder ${i + 1}`,
          due_time_ms: now + 150 + i * 50,
        })),
      },
    });
    send(window);
    assert.equal(((await ackOf(window)).env.payload as AckPayload).accepted, true);

    // Brain goes away. The reminders fire into the outbox.
    socket!.terminate();
    const hello2 = await expectFromRobot('the second hello', (r) => r.connection === 2 && r.env.topic === Topics.SYS_HELLO);
    const backAt = Date.now();
    await expectFromRobot('the manifest after the drain', (r) => r.connection === 2 && r.env.topic === Topics.CAP_MANIFEST);

    const drained = received.filter((r) => r.connection === 2 && r.env.topic === Topics.SCHED_FIRED).map((r) => r.env);
    assert.deepEqual(
      drained.map((e) => (e.payload as SchedFiredPayload).occurrence_id),
      ['oc-1', 'oc-2', 'oc-3']
    );
    // Original timestamps: stamped when each one fired, which was before Brain came back.
    for (const event of drained) assert.ok(event.t_wall_ms < backAt, 'a drained event was re-stamped on send');
    assert.ok(drained[0]!.t_wall_ms <= drained[1]!.t_wall_ms && drained[1]!.t_wall_ms <= drained[2]!.t_wall_ms);
    // A fresh seq on the new connection, with no gap after the hello.
    assert.deepEqual(drained.map((e) => e.seq), [hello2.env.seq + 1, hello2.env.seq + 2, hello2.env.seq + 3]);

    // Brain confirms them. A command behind the receipt proves the robot has processed it.
    send(newEnvelope({ kind: Kind.ACK, topic: Topics.SYS_RECEIPT, seq, payload: { msg_ids: drained.map((e) => e.msg_id) } }));
    const after = newEnvelope({ kind: Kind.CMD, topic: Topics.VOICE_SPEAK, payload: { text: 'theek hai', lang: 'ur' }, seq });
    send(after);
    await ackOf(after);

    // One more outage. Nothing confirmed comes back.
    socket!.terminate();
    await expectFromRobot('the manifest on the third connection', (r) => r.connection === 3 && r.env.topic === Topics.CAP_MANIFEST);
    assert.equal(received.filter((r) => r.connection === 3 && r.env.topic === Topics.SCHED_FIRED).length, 0);
  } finally {
    robot.kill('SIGKILL');
    server.close();
    for (const client of server.clients) client.terminate();
  }
});
