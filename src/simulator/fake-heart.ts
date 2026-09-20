/**
 * Canonical Fake Heart Simulator.
 * Dials out to Brain over WebSocket, authenticates with dev token, exchanges bidirectional heartbeats,
 * and handles speech commands.
 * Run with: bun run src/simulator/fake-heart.ts
 */

import { WebSocket } from 'ws';
import {
  Kind,
  Topics,
  DeviceRole,
  SystemHealth,
  Language,
  ExecutionStatus,
  Priority,
  ProtocolDefaults,
  newEnvelope,
  createAck,
  encode,
  parse,
  SequenceCounter,
  HeartCapabilities,
  type Envelope,
  type HelloPayload,
  type WelcomePayload,
  type SpeakPayload,
  type HeartbeatPayload,
  type CapabilityManifestPayload,
  type AckPayload,
} from '../index.ts';

const BRAIN_URL = process.env['BRAIN_URL'] || ProtocolDefaults.DEFAULT_BRAIN_URL;
const DEV_TOKEN = process.env['DEV_TOKEN'] || ProtocolDefaults.DEFAULT_DEV_TOKEN;
const DEVICE_ID = process.env['DEVICE_ID'] || ProtocolDefaults.DEFAULT_FAKE_HEART_ID;
const DOCKING_UNAVAILABLE = process.env['FAKE_HEART_DOCKING_UNAVAILABLE'] === 'true';

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let capabilityTimer: NodeJS.Timeout | null = null;
let backoffDelayMs: number = ProtocolDefaults.RECONNECT_INITIAL_DELAY_MS;
const MAX_BACKOFF_MS = ProtocolDefaults.RECONNECT_MAX_DELAY_MS;
const BACKOFF_MULTIPLIER = ProtocolDefaults.RECONNECT_BACKOFF_MULTIPLIER;
let isShuttingDown = false;

// Per-connection outbound sequence counter
let outboundSeq = new SequenceCounter();
let lastHeartbeatReceivedMs = 0;

function log(message: string): void {
  const time = new Date().toISOString().substring(11, 23);
  console.log(`[${time}] [Fake Heart] ${message}`);
}

/**
 * Receiver-side idempotency (B0.5, ENVELOPE.md §5).
 *
 * The Brain de-duplicates on the way *out*; that stops it re-sending, not the receiver
 * re-executing. A retry that crosses the wire — a flaky hotspot, a reconnect drain — still
 * arrives here, so the side that performs the action is the side that has to remember.
 *
 * Deliberately survives reconnects: the retry that matters is the one after the link dropped.
 */
interface RememberedAck {
  ack: Envelope<string, AckPayload>;
  atMs: number;
}
const executedCommands = new Map<string, RememberedAck>();

export function replayIfSeen(idemKey: string | undefined): Envelope<string, AckPayload> | undefined {
  if (!idemKey) return undefined;
  const seen = executedCommands.get(idemKey);
  if (!seen) return undefined;
  if (Date.now() - seen.atMs >= ProtocolDefaults.IDEMPOTENCY_TTL_MS) {
    executedCommands.delete(idemKey);
    return undefined;
  }
  return seen.ack;
}

export function remember(idemKey: string | undefined, ack: Envelope<string, AckPayload>): void {
  if (!idemKey) return;
  executedCommands.set(idemKey, { ack, atMs: Date.now() });
}

/** Drops entries past the TTL. Called from the heartbeat tick, which already runs every 5 s. */
export function pruneIdempotencyCache(nowMs: number = Date.now()): void {
  for (const [key, seen] of executedCommands) {
    if (nowMs - seen.atMs >= ProtocolDefaults.IDEMPOTENCY_TTL_MS) {
      executedCommands.delete(key);
    }
  }
}

/** Test seam — the cache is module state and outlives a single connection by design. */
export function resetIdempotencyCache(): void {
  executedCommands.clear();
}

/**
 * Calculates exponential backoff with random jitter factor (0.5 to 1.5).
 * Conforms to ENVELOPE.md §8.
 */
export function calculateBackoffWithJitter(
  baseDelayMs: number,
  randomFactor: number = ProtocolDefaults.RECONNECT_JITTER_MIN_FACTOR +
    Math.random() * (ProtocolDefaults.RECONNECT_JITTER_MAX_FACTOR - ProtocolDefaults.RECONNECT_JITTER_MIN_FACTOR)
): number {
  return Math.round(baseDelayMs * randomFactor);
}

function sendEnvelope<TTopic extends string, TPayload>(envelope: Envelope<TTopic, TPayload>): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(encode(envelope));
  }
}

function cleanupTimers(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (capabilityTimer) {
    clearInterval(capabilityTimer);
    capabilityTimer = null;
  }
}

function startHeartbeat(): void {
  cleanupTimers();
  lastHeartbeatReceivedMs = Date.now();

  heartbeatTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      cleanupTimers();
      return;
    }

    // 1. Send outbound heartbeat event to Brain
    const heartbeatEnv = newEnvelope<typeof Topics.SYS_HEARTBEAT, HeartbeatPayload>({
      kind: Kind.EVT,
      topic: Topics.SYS_HEARTBEAT,
      seq: outboundSeq,
      payload: {
        status: SystemHealth.OK,
        t_wall_ms: Date.now(),
        battery_pct: 95,
      },
    });
    sendEnvelope(heartbeatEnv);

    // 2. Drop idempotency entries past their TTL (piggy-backed on this tick, no extra timer)
    pruneIdempotencyCache();

    // 3. Watchdog: check for 3 missed heartbeats from Brain (> 15s)
    const elapsedSinceLastPeerBeat = Date.now() - lastHeartbeatReceivedMs;
    if (elapsedSinceLastPeerBeat >= ProtocolDefaults.HEARTBEAT_TIMEOUT_MS) {
      log(
        `Dead link detected: no heartbeat received from Brain for ${(elapsedSinceLastPeerBeat / 1000).toFixed(
          1
        )}s (>= ${ProtocolDefaults.HEARTBEAT_MISSED_THRESHOLD} missed beats). Closing connection...`
      );
      cleanupTimers();
      ws.terminate();
    }
  }, ProtocolDefaults.HEARTBEAT_INTERVAL_MS);
}

function sendCapabilities(): void {
  capabilityTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      cleanupTimers();
      return;
    }

    const capabilityEnv = newEnvelope<typeof Topics.CAP_MANIFEST, CapabilityManifestPayload>({
      kind: Kind.EVT,
      topic: Topics.CAP_MANIFEST,
      seq: outboundSeq,
      payload: {
        // The robot's half only (TASKS.md S1.2). IDs come from the shared registry so that the
        // publisher and whatever renders it cannot drift apart.
        capabilities: {
          [HeartCapabilities.DRIVING]: { state: 'available' },
          [HeartCapabilities.DOCKING]: DOCKING_UNAVAILABLE
            ? { state: 'unavailable', reason: 'no dock in the map yet' }
            : { state: 'available' },
          [HeartCapabilities.RECORDING]: { state: 'available' },
          [HeartCapabilities.LOCAL_VOICE]: {
            state: 'degraded',
            note: 'offline — simple phrasing only',
          },
          [HeartCapabilities.ROBOT_HEALTH]: { state: 'available' },
        },
      },
    });
    sendEnvelope(capabilityEnv);
  }, ProtocolDefaults.CAP_MANIFEST_INTERVAL_MS);
}

export function connect(): void {
  if (isShuttingDown) return;

  // Reset per-connection sequence counter
  outboundSeq = new SequenceCounter();
  cleanupTimers();

  log(`Dialing out to Brain at ${BRAIN_URL}...`);
  ws = new WebSocket(BRAIN_URL);

  ws.on('open', () => {
    log(`Connected! Sending handshake sys.hello...`);
    backoffDelayMs = ProtocolDefaults.RECONNECT_INITIAL_DELAY_MS;

    const helloEnv = newEnvelope<typeof Topics.SYS_HELLO, HelloPayload>({
      kind: Kind.CMD,
      topic: Topics.SYS_HELLO,
      seq: outboundSeq,
      payload: {
        device_id: DEVICE_ID,
        token: DEV_TOKEN,
        protocol_version: ProtocolDefaults.PROTOCOL_VERSION,
        role: DeviceRole.HEART,
        client_wall_ms: Date.now(),
        capabilities: ['voice.speak', 'sim.motion', 'sys.heartbeat'],
      },
    });

    sendEnvelope(helloEnv);
  });

  ws.on('message', (rawData: Buffer | string) => {
    const result = parse(rawData);
    if (!result.success) {
      log(`Failed to parse incoming envelope: ${result.error.message}`);
      return;
    }

    const env = result.data;

    // Handle handshake response
    if (env.topic === Topics.SYS_WELCOME) {
      const welcome = env.payload as WelcomePayload;
      if (welcome.accepted) {
        log(`Handshake accepted by Brain! Session: ${welcome.session_id}`);
        startHeartbeat();
        sendCapabilities();
      } else {
        log(`Handshake rejected by Brain: ${welcome.reason || 'Unauthorized'}. Closing socket.`);
        cleanupTimers();
        if (ws) ws.close(4000, welcome.reason || 'Handshake rejected');
      }
      return;
    }

    // Handle voice.speak command
    if (env.topic === Topics.VOICE_SPEAK && env.kind === Kind.CMD) {
      // Replay before executing. ENVELOPE.md §5: "Every CMD carries an idem_key and is never
      // executed twice." A flaky hotspot must not make the robot say the same thing three times.
      const replayed = replayIfSeen(env.idem_key);
      if (replayed) {
        sendEnvelope(replayed);
        log(`Duplicate idem_key=${env.idem_key} — replayed original ACK, did not speak again`);
        return;
      }

      const speak = env.payload as SpeakPayload;
      const lang = speak.lang || Language.EN;
      const priority = speak.priority || Priority.NORMAL;
      console.log(`\n🔊 [SPEAK ${lang}] "${speak.text}" (priority: ${priority})\n`);

      const ack = createAck(
        env,
        { accepted: true, exec_status: ExecutionStatus.COMPLETED },
        outboundSeq
      );
      remember(env.idem_key, ack);
      sendEnvelope(ack);
      log(`Sent ACK for msg_id: ${env.msg_id}`);
      return;
    }

    // Handle heartbeat from Brain
    if (env.topic === Topics.SYS_HEARTBEAT) {
      lastHeartbeatReceivedMs = Date.now();
      log(`Heartbeat received from Brain`);
      return;
    }

    log(`Received unhandled topic: ${env.topic} [kind=${env.kind}]`);
  });

  ws.on('close', (code, reason) => {
    cleanupTimers();
    log(`Connection closed (${code} - ${reason.toString() || 'no reason'}).`);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    log(`Socket error: ${err.message}`);
  });
}

export function scheduleReconnect(): void {
  if (isShuttingDown || reconnectTimer) return;

  const jitteredDelay = calculateBackoffWithJitter(backoffDelayMs);
  log(`Reconnecting in ${(jitteredDelay / 1000).toFixed(2)}s (base: ${(backoffDelayMs / 1000).toFixed(1)}s + jitter)...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    backoffDelayMs = Math.min(backoffDelayMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
    connect();
  }, jitteredDelay);
}

export function shutdown(): void {
  isShuttingDown = true;
  cleanupTimers();
  log('Shutting down Fake Heart simulator...');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) ws.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Auto-start only when executed directly
if (import.meta.main) {
  connect();
}
