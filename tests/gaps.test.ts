import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  Kind,
  Topics,
  DeviceRole,
  SystemHealth,
  ProtocolDefaults,
  newEnvelope,
  validateHello,
  createWelcomeAck,
  SequenceCounter,
  createSequenceCounter,
  SequenceGapDetector,
  type HelloPayload,
} from '../src/index.ts';
import { calculateBackoffWithJitter } from '../src/simulator/fake-heart.ts';

describe('P0.7 Spec Gaps Fixes', () => {
  describe('1. Version Number Handshake Refusal', () => {
    it('accepts sys.hello when protocol_version matches ProtocolDefaults.PROTOCOL_VERSION', () => {
      const validHello: HelloPayload = {
        device_id: 'heart-sim-01',
        token: 'dev-token',
        protocol_version: ProtocolDefaults.PROTOCOL_VERSION,
        role: DeviceRole.HEART,
      };

      const result = validateHello(validHello);
      assert.equal(result.valid, true);
    });

    it('refuses sys.hello with protocol_version mismatch (e.g. Heart 2, Brain 1)', () => {
      const mismatchedHello = {
        device_id: 'heart-sim-01',
        token: 'dev-token',
        protocol_version: 2,
        role: DeviceRole.HEART,
      };

      const result = validateHello(mismatchedHello);
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'protocol_version_mismatch');
      assert.match(result.error ?? '', /Protocol version mismatch/);
    });

    it('creates a clear refusal sys.welcome ACK envelope on version mismatch', () => {
      const helloCmd = newEnvelope<typeof Topics.SYS_HELLO, HelloPayload>({
        kind: Kind.CMD,
        topic: Topics.SYS_HELLO,
        payload: {
          device_id: 'heart-sim-01',
          token: 'dev-token',
          protocol_version: 99,
          role: DeviceRole.HEART,
        },
        seq: new SequenceCounter(),
      });

      const validation = validateHello(helloCmd.payload);
      assert.equal(validation.valid, false);

      const welcomeAck = createWelcomeAck(helloCmd, {
        accepted: false,
        reason: validation.error,
        seq: new SequenceCounter(),
      });

      assert.equal(welcomeAck.kind, Kind.ACK);
      assert.equal(welcomeAck.topic, 'sys.welcome');
      assert.equal(welcomeAck.corr_id, helloCmd.corr_id);
      assert.equal(welcomeAck.payload.accepted, false);
      assert.match(welcomeAck.payload.reason ?? '', /Protocol version mismatch/);
    });
  });

  describe('2. Heartbeat Timing & Dead-Link Watchdog Parameters', () => {
    it('defines standard 5s interval and 3-miss (15s) dead link timeout', () => {
      assert.equal(ProtocolDefaults.HEARTBEAT_INTERVAL_MS, 5000);
      assert.equal(ProtocolDefaults.HEARTBEAT_MISSED_THRESHOLD, 3);
      assert.equal(ProtocolDefaults.HEARTBEAT_TIMEOUT_MS, 15000);
    });

    it('creates compliant sys.heartbeat event envelopes in both directions', () => {
      const hb = newEnvelope({
        kind: Kind.EVT,
        topic: Topics.SYS_HEARTBEAT,
        payload: {
          status: SystemHealth.OK,
          t_wall_ms: Date.now(),
          battery_pct: 88,
        },
        seq: new SequenceCounter(),
      });

      assert.equal(hb.kind, Kind.EVT);
      assert.equal(hb.topic, Topics.SYS_HEARTBEAT);
      assert.equal(hb.payload.status, SystemHealth.OK);
      assert.equal(typeof hb.payload.t_wall_ms, 'number');
    });
  });

  describe('3. Reconnect Delays with Jitter', () => {
    it('calculates jittered delay within 0.5x and 1.5x of base delay', () => {
      const baseDelay = 2000;
      const minExpected = baseDelay * ProtocolDefaults.RECONNECT_JITTER_MIN_FACTOR;
      const maxExpected = baseDelay * ProtocolDefaults.RECONNECT_JITTER_MAX_FACTOR;

      // Test boundary factors explicitly
      assert.equal(calculateBackoffWithJitter(baseDelay, 0.5), 1000);
      assert.equal(calculateBackoffWithJitter(baseDelay, 1.5), 3000);

      // Test across 50 random samples
      const delays: number[] = [];
      for (let i = 0; i < 50; i++) {
        const jittered = calculateBackoffWithJitter(baseDelay);
        assert.ok(
          jittered >= minExpected && jittered <= maxExpected,
          `Jittered delay ${jittered} outside expected range [${minExpected}, ${maxExpected}]`
        );
        delays.push(jittered);
      }

      // Verify that jitter produces multiple distinct delays (no thundering herd)
      const uniqueDelays = new Set(delays);
      assert.ok(uniqueDelays.size > 10, 'Expected distinct randomized backoff delays across runs');
    });
  });

  describe('4. Per-Connection Independent Sequence Numbers', () => {
    it('maintains independent counters for separate connections', () => {
      const connHeart = createSequenceCounter(0);
      const connSynapse = createSequenceCounter(0);
      const connGanglion = createSequenceCounter(0);

      // Heart sends 3 messages
      assert.equal(connHeart.next(), 1);
      assert.equal(connHeart.next(), 2);
      assert.equal(connHeart.next(), 3);

      // Synapse sends 1 message
      assert.equal(connSynapse.next(), 1);

      // Verify independence
      assert.equal(connHeart.current(), 3);
      assert.equal(connSynapse.current(), 1);
      assert.equal(connGanglion.current(), 0);
    });

    it('integrates SequenceCounter with newEnvelope()', () => {
      const counter = new SequenceCounter(10);

      const env1 = newEnvelope({
        kind: Kind.EVT,
        topic: 'test.evt',
        seq: counter,
        payload: { step: 1 },
      });

      const env2 = newEnvelope({
        kind: Kind.EVT,
        topic: 'test.evt',
        seq: counter,
        payload: { step: 2 },
      });

      assert.equal(env1.seq, 11);
      assert.equal(env2.seq, 12);
      assert.equal(counter.current(), 12);
    });

    it('detects sequence gaps on event channels and discards stale telemetry', () => {
      const detector = new SequenceGapDetector();

      // Message 1: initial baseline
      const r1 = detector.evaluate(1, Kind.EVT);
      assert.equal(r1.gap, false);
      assert.equal(r1.droppedOldTelemetry, false);

      // Message 2: normal next sequence
      const r2 = detector.evaluate(2, Kind.EVT);
      assert.equal(r2.gap, false);
      assert.equal(r2.droppedOldTelemetry, false);

      // Message 3: gap detected (jump from 2 to 5)
      const r3 = detector.evaluate(5, Kind.EVT);
      assert.equal(r3.gap, true);
      assert.equal(r3.gapSize, 2); // missing seq 3 and 4

      // Stale Telemetry (seq 3 <= newest seen 5) must be discarded
      const r4 = detector.evaluate(3, Kind.TELEM);
      assert.equal(r4.droppedOldTelemetry, true);

      // Fresh Telemetry (seq 6 > newest seen 5) must be accepted
      const r5 = detector.evaluate(6, Kind.TELEM);
      assert.equal(r5.droppedOldTelemetry, false);
    });
  });
});
