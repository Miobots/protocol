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
  type Envelope,
  type HelloPayload,
  type WelcomePayload,
  type SpeakPayload,
  type HeartbeatPayload,
} from '../index.ts';

const BRAIN_URL = process.env['BRAIN_URL'] || ProtocolDefaults.DEFAULT_BRAIN_URL;
const DEV_TOKEN = process.env['DEV_TOKEN'] || ProtocolDefaults.DEFAULT_DEV_TOKEN;
const DEVICE_ID = process.env['DEVICE_ID'] || ProtocolDefaults.DEFAULT_FAKE_HEART_ID;

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
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

    // 2. Watchdog: check for 3 missed heartbeats from Brain (> 15s)
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
      } else {
        log(`Handshake rejected by Brain: ${welcome.reason || 'Unauthorized'}. Closing socket.`);
        cleanupTimers();
        if (ws) ws.close(4000, welcome.reason || 'Handshake rejected');
      }
      return;
    }

    // Handle voice.speak command
    if (env.topic === Topics.VOICE_SPEAK && env.kind === Kind.CMD) {
      const speak = env.payload as SpeakPayload;
      const lang = speak.lang || Language.EN;
      const priority = speak.priority || Priority.NORMAL;
      console.log(`\n🔊 [SPEAK ${lang}] "${speak.text}" (priority: ${priority})\n`);

      const ack = createAck(env, {
        accepted: true,
        exec_status: ExecutionStatus.COMPLETED,
      });
      ack.seq = outboundSeq.next();
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
