/**
 * Canonical Fake Heart v0 Simulator.
 * Dials out to Brain over WebSocket, authenticates with dev token, and handles speech commands.
 * Run with: bun run src/simulator/fake-heart.ts
 */

import { WebSocket } from 'ws';
import {
  Kind,
  Topics,
  DeviceRole,
  Language,
  ExecutionStatus,
  Priority,
  ProtocolDefaults,
  newEnvelope,
  createAck,
  encode,
  parse,
  type Envelope,
  type HelloPayload,
  type WelcomePayload,
  type SpeakPayload,
} from '../index.ts';

const BRAIN_URL = process.env['BRAIN_URL'] || ProtocolDefaults.DEFAULT_BRAIN_URL;
const DEV_TOKEN = process.env['DEV_TOKEN'] || ProtocolDefaults.DEFAULT_DEV_TOKEN;
const DEVICE_ID = process.env['DEVICE_ID'] || ProtocolDefaults.DEFAULT_FAKE_HEART_ID;

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let backoffDelayMs: number = ProtocolDefaults.RECONNECT_INITIAL_DELAY_MS;
const MAX_BACKOFF_MS = ProtocolDefaults.RECONNECT_MAX_DELAY_MS;
const BACKOFF_MULTIPLIER = ProtocolDefaults.RECONNECT_BACKOFF_MULTIPLIER;
let isShuttingDown = false;

function log(message: string): void {
  const time = new Date().toISOString().substring(11, 23);
  console.log(`[${time}] [Fake Heart] ${message}`);
}

function sendEnvelope<TTopic extends string, TPayload>(envelope: Envelope<TTopic, TPayload>): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(encode(envelope));
  }
}

function connect(): void {
  if (isShuttingDown) return;

  log(`Dialing out to Brain at ${BRAIN_URL}...`);
  ws = new WebSocket(BRAIN_URL);

  ws.on('open', () => {
    log(`Connected! Sending handshake sys.hello...`);
    backoffDelayMs = ProtocolDefaults.RECONNECT_INITIAL_DELAY_MS;

    const helloEnv = newEnvelope<typeof Topics.SYS_HELLO, HelloPayload>({
      kind: Kind.CMD,
      topic: Topics.SYS_HELLO,
      payload: {
        device_id: DEVICE_ID,
        token: DEV_TOKEN,
        protocol_version: ProtocolDefaults.PROTOCOL_VERSION,
        role: DeviceRole.HEART,
        client_wall_ms: Date.now(),
        capabilities: ['voice.speak', 'sim.motion'],
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
      } else {
        log(`Handshake rejected: ${welcome.reason || 'Unauthorized'}`);
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
      sendEnvelope(ack);
      log(`Sent ACK for msg_id: ${env.msg_id}`);
      return;
    }

    // Handle heartbeat ping
    if (env.topic === Topics.SYS_HEARTBEAT) {
      log(`Heartbeat received from Brain`);
      return;
    }

    log(`Received unhandled topic: ${env.topic} [kind=${env.kind}]`);
  });

  ws.on('close', (code, reason) => {
    log(`Connection closed (${code} - ${reason.toString() || 'no reason'}).`);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    log(`Socket error: ${err.message}`);
  });
}

function scheduleReconnect(): void {
  if (isShuttingDown || reconnectTimer) return;

  log(`Reconnecting in ${(backoffDelayMs / 1000).toFixed(1)}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    backoffDelayMs = Math.min(backoffDelayMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
    connect();
  }, backoffDelayMs);
}

function shutdown(): void {
  isShuttingDown = true;
  log('Shutting down Fake Heart simulator...');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) ws.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start client
connect();
