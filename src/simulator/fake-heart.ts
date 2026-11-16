/**
 * Canonical Fake Heart Simulator.
 * Dials out to Brain over WebSocket, authenticates with dev token, exchanges bidirectional heartbeats,
 * and handles speech, navigation and schedule commands. What it has to report is kept in an outbox
 * until Brain confirms it, so reminders and drives carry on while Brain is away.
 * Run with: bun run src/simulator/fake-heart.ts [--refuse-nav]
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
  ProtocolErrorReason,
  newEnvelope,
  createAck,
  encode,
  parse,
  SequenceCounter,
  HeartCapabilities,
  queuesInOutbox,
  isReceiptPayload,
  type Envelope,
  type HelloPayload,
  type WelcomePayload,
  type SpeakPayload,
  type HeartbeatPayload,
  type CapabilityManifestPayload,
  type AckPayload,
  type NavCancelPayload,
  type NavGotoPayload,
  type NavResultPayload,
  type SchedWindowPayload,
  type ScheduleOccurrence,
  type SightingPayload,
} from '../index.ts';
import { isRecord } from '../topics/guards.ts';

const BRAIN_URL = process.env['BRAIN_URL'] || ProtocolDefaults.DEFAULT_BRAIN_URL;
const DEV_TOKEN = process.env['DEV_TOKEN'] || ProtocolDefaults.DEFAULT_DEV_TOKEN;
const DEVICE_ID = process.env['DEVICE_ID'] || ProtocolDefaults.DEFAULT_FAKE_HEART_ID;
const DOCKING_UNAVAILABLE = process.env['FAKE_HEART_DOCKING_UNAVAILABLE'] === 'true';
// `let`: typing `r` + Enter in the simulator's terminal flips it, so a demo can show a drive and a
// refusal in one run instead of restarting with the flag.
let refuseNav = process.env['FAKE_HEART_REFUSE_NAV'] === 'true' || process.argv.includes('--refuse-nav');
const SIGHTINGS = process.env['FAKE_HEART_SIGHTINGS'] === 'true';
const REFUSAL_BATTERY_PCT = 16;
const NAV_TICK_MS = 500;
const SIGHTING_INTERVAL_MS = 5000;

/**
 * Metres a goal starts from, one per tick. The default 5 m finishes in 2.5 s — fine for tests, too
 * short to say "stop" in. `FAKE_HEART_NAV_DISTANCE_M=30` gives a 15 s drive.
 */
export function parseNavDistance(raw: string | undefined): number {
  const metres = Number(raw);
  return Number.isFinite(metres) && metres > 0 ? metres : 5;
}
const NAV_START_DISTANCE_M = parseNavDistance(process.env['FAKE_HEART_NAV_DISTANCE_M']);

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let capabilityTimer: NodeJS.Timeout | null = null;
let navigationTimer: NodeJS.Timeout | null = null;
let sightingTimer: NodeJS.Timeout | null = null;
let backoffDelayMs: number = ProtocolDefaults.RECONNECT_INITIAL_DELAY_MS;
const MAX_BACKOFF_MS = ProtocolDefaults.RECONNECT_MAX_DELAY_MS;
const BACKOFF_MULTIPLIER = ProtocolDefaults.RECONNECT_BACKOFF_MULTIPLIER;
let isShuttingDown = false;

// Per-connection outbound sequence counter
let outboundSeq = new SequenceCounter();
let lastHeartbeatReceivedMs = 0;
/** True between an accepted `sys.welcome` and the socket closing. */
let linkUp = false;

interface ActiveNavigation {
  goalId: string;
  corrId: string;
  distanceRemainingM: number;
  startedAtMs: number;
  finalPose: NavResultPayload['final_pose'];
}

let activeNavigation: ActiveNavigation | null = null;

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

/**
 * Receiver-side expiry (B0.5, ENVELOPE.md §6 and §9).
 *
 * The codec only checks `expires_at` against the sender's own `t_wall_ms`, both stamped at send
 * time, so a command that arrives late still passes it. Lateness is only visible here, against the
 * receiver's clock. Returns the rejecting ACK, or undefined if the command is still live.
 */
export function rejectIfExpired(
  env: Envelope,
  seq: SequenceCounter,
  nowMs: number = Date.now()
): Envelope<string, AckPayload> | undefined {
  if (env.expires_at === undefined || nowMs < env.expires_at) return undefined;
  return createAck(
    env,
    { accepted: false, reason: ProtocolErrorReason.EXPIRED, exec_status: ExecutionStatus.REJECTED },
    seq
  );
}

/** Test seam — the cache is module state and outlives a single connection by design. */
export function resetIdempotencyCache(): void {
  executedCommands.clear();
}

/**
 * Outbox mock (P4.3, ENVELOPE.md §5 and §8).
 *
 * An event is a fact. With Brain away it waits here; on reconnect everything still here goes out
 * oldest-first; and an entry leaves only when Brain names it in a `sys.receipt` — never on send,
 * because acknowledging on send is how the one message that mattered gets lost.
 */
// ponytail: in memory and capped, so a restart loses it. The real one is on disk (H3.2).
const OUTBOX_LIMIT = 1000;
const outbox: Envelope[] = [];

export function enqueue(event: Envelope): void {
  outbox.push(event);
  if (outbox.length > OUTBOX_LIMIT) {
    const dropped = outbox.shift();
    log(`OUTBOX FULL — dropped the oldest event (${dropped?.topic} ${dropped?.msg_id}). Brain has not confirmed in a long time.`);
  }
}

export function pendingEvents(): readonly Envelope[] {
  return outbox;
}

/** Trims the events Brain says it has. Returns how many went. */
export function confirmDelivered(msgIds: readonly string[]): number {
  const confirmed = new Set(msgIds);
  const before = outbox.length;
  for (let i = outbox.length - 1; i >= 0; i--) {
    if (confirmed.has(outbox[i]!.msg_id)) outbox.splice(i, 1);
  }
  return before - outbox.length;
}

/** Test seam. */
export function resetOutbox(): void {
  outbox.length = 0;
}

/** Placeholder `seq` for an event that has not gone out yet — see {@link sendStamped}. */
const UNSENT = 0;

/**
 * `seq` belongs to the connection, not to the event (ENVELOPE.md §6), so it is stamped at the
 * moment of sending, every time. `msg_id` and both clocks stay as they were when it happened.
 */
function sendStamped(event: Envelope): void {
  sendEnvelope({ ...event, seq: outboundSeq.next() });
}

/** Something the robot wants Brain to know: sent now if Brain is listening, kept until confirmed. */
function publish(event: Envelope): void {
  if (queuesInOutbox(event.kind, event.topic)) enqueue(event);
  if (linkUp) sendStamped(event);
}

function drainOutbox(): void {
  if (outbox.length === 0) return;
  log(`Draining ${outbox.length} event(s) Brain has not confirmed, oldest first`);
  for (const event of outbox) sendStamped(event);
}

/**
 * The robot's own schedule (P4.2). The timers are the robot's, not the connection's: a reminder
 * fires on time whether or not Brain is there to hear about it.
 */
const scheduled = new Map<string, NodeJS.Timeout>();
/** Idempotent on occurrence id: a window pushed again must not announce the same moment twice. */
const firedOccurrences = new Set<string>();
/** `setTimeout` wraps round past this and fires at once — about 24.8 days, well beyond a 72 h window. */
const MAX_TIMER_MS = 0x7fffffff;

export function cacheWindow(window: SchedWindowPayload, nowMs: number = Date.now()): void {
  resetSchedule(false);
  for (const occurrence of window.occurrences) {
    const delayMs = Math.max(0, occurrence.due_time_ms - nowMs);
    if (firedOccurrences.has(occurrence.occurrence_id) || delayMs > MAX_TIMER_MS) continue;
    scheduled.set(occurrence.occurrence_id, setTimeout(() => fireOccurrence(occurrence), delayMs));
    log(`  ⏱ ${occurrence.occurrence_id} in ${(delayMs / 1000).toFixed(1)}s "${occurrence.text}"`);
  }
  log(`Cached ${scheduled.size} occurrence(s) for the next 72h`);
}

function fireOccurrence(occurrence: ScheduleOccurrence): void {
  scheduled.delete(occurrence.occurrence_id);
  firedOccurrences.add(occurrence.occurrence_id);
  console.log(`\n⏰ [REMINDER] "${occurrence.text}"\n`);
  publish(
    newEnvelope({
      kind: Kind.EVT,
      topic: Topics.SCHED_FIRED,
      seq: UNSENT,
      payload: { occurrence_id: occurrence.occurrence_id },
    })
  );
}

/** Drops every pending timer. Tests also forget what has fired. */
export function resetSchedule(forgetFired: boolean = true): void {
  for (const timer of scheduled.values()) clearTimeout(timer);
  scheduled.clear();
  if (forgetFired) firedOccurrences.clear();
}

/**
 * Invented sightings (P3.2) — enough to fill Brain's memory with no camera and no vision model.
 * Real sightings later arrive through the same door.
 */
const SIGHTING_FIXTURES: readonly SightingPayload[] = [
  { label: 'glasses', aliases: ['chashma', 'spectacles'], confidence: 0.82, region_id: 'living_room', pose: [3.1, -0.4, 0] },
  { label: 'keys', aliases: ['chabi', 'chabiyan'], confidence: 0.77, region_id: 'entrance', pose: [0.4, 1.2, 1.57] },
  { label: 'wallet', aliases: ['batwa', 'purse'], confidence: 0.71, region_id: 'bedroom', pose: [-2.2, 2.6, 3.14] },
  { label: 'medicine', aliases: ['dawai', 'tablets'], confidence: 0.88, region_id: 'kitchen', pose: [3.2, -1.1, 0] },
];

export function sightingAt(tick: number): SightingPayload {
  return SIGHTING_FIXTURES[tick % SIGHTING_FIXTURES.length]!;
}

function startSightings(): void {
  let tick = 0;
  sightingTimer = setInterval(() => {
    const sighting = sightingAt(tick++);
    publish(newEnvelope({ kind: Kind.EVT, topic: Topics.OBS_SIGHTING, seq: UNSENT, payload: sighting }));
    log(`Sent obs.sighting ${sighting.label} in ${sighting.region_id}`);
  }, SIGHTING_INTERVAL_MS);
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

function stopNavigation(): void {
  if (navigationTimer) {
    clearInterval(navigationTimer);
    navigationTimer = null;
  }
  activeNavigation = null;
}

export function isNavGotoPayload(value: unknown): value is NavGotoPayload {
  if (!isRecord(value) || typeof value.goal_id !== 'string' || value.goal_id.length === 0) return false;

  const hasRegion = typeof value.region === 'string' && value.region.length > 0;
  const hasCoordinates = typeof value.x === 'number'
    && Number.isFinite(value.x)
    && typeof value.y === 'number'
    && Number.isFinite(value.y);
  const hasValidYaw = value.yaw === undefined || (typeof value.yaw === 'number' && Number.isFinite(value.yaw));

  return (hasRegion || hasCoordinates) && hasValidYaw;
}

export function navigationPayloadReason(value: unknown): 'invalid_navigation_payload' | undefined {
  return isNavGotoPayload(value) ? undefined : 'invalid_navigation_payload';
}

export function isNavCancelPayload(value: unknown): value is NavCancelPayload {
  return isRecord(value) && typeof value.goal_id === 'string' && value.goal_id.length > 0;
}

export function hasActiveNavigationGoal(navigation: ActiveNavigation | null, goalId: string): boolean {
  return navigation !== null && navigation.goalId === goalId;
}

export function navigationCancelReason(
  navigation: ActiveNavigation | null,
  goalId: string
): 'goal_not_found' | undefined {
  return hasActiveNavigationGoal(navigation, goalId) ? undefined : 'goal_not_found';
}

function sendNavigationResult(success: boolean, reason?: string): void {
  if (!activeNavigation) return;

  const navigation = activeNavigation;
  const payload: NavResultPayload = {
    success,
    total_time_s: (Date.now() - navigation.startedAtMs) / 1000,
    final_pose: navigation.finalPose,
    ...(reason ? { reason } : {}),
  };
  const result = newEnvelope({
    kind: Kind.EVT,
    topic: Topics.NAV_RESULT,
    corr_id: navigation.corrId,
    seq: UNSENT,
    payload,
  });
  publish(result);
  log(`Sent nav.result goal_id=${navigation.goalId} success=${success}`);
  stopNavigation();
}

function startNavigation(payload: NavGotoPayload, corrId: string): void {
  activeNavigation = {
    goalId: payload.goal_id,
    corrId,
    distanceRemainingM: NAV_START_DISTANCE_M,
    startedAtMs: Date.now(),
    finalPose: {
      x: payload.x ?? 0,
      y: payload.y ?? 0,
      yaw: payload.yaw ?? 0,
    },
  };

  navigationTimer = setInterval(() => {
    // No link check: the robot keeps driving when Brain goes away, and what it has to say waits
    // in the outbox.
    if (!activeNavigation) {
      stopNavigation();
      return;
    }

    activeNavigation.distanceRemainingM = Math.max(0, activeNavigation.distanceRemainingM - 1);
    const navigation = activeNavigation;
    const feedback = newEnvelope({
      kind: Kind.EVT,
      topic: Topics.NAV_FEEDBACK,
      corr_id: navigation.corrId,
      seq: UNSENT,
      payload: {
        distance_remaining_m: navigation.distanceRemainingM,
        estimated_time_remaining_s: navigation.distanceRemainingM,
      },
    });
    publish(feedback);
    log(`Sent nav.feedback goal_id=${navigation.goalId} distance_remaining_m=${navigation.distanceRemainingM}`);

    if (navigation.distanceRemainingM === 0) {
      sendNavigationResult(true);
    }
  }, NAV_TICK_MS);

  log(`Accepted nav.goto goal_id=${payload.goal_id}`);
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
  // Publish at once, then every 10 s. Waiting for the first tick left the Brain with no robot half
  // for 10 s after connecting, and its agent turned down "go to the kitchen" as "can't drive".
  publishCapabilities();
  capabilityTimer = setInterval(publishCapabilities, ProtocolDefaults.CAP_MANIFEST_INTERVAL_MS);
}

function publishCapabilities(): void {
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
}

/**
 * Answers a command and remembers the answer under its `idem_key`, so a retry gets the same one
 * back instead of running twice.
 */
function answer(env: Envelope, payload: AckPayload): void {
  const ack = createAck(env, payload, outboundSeq);
  remember(env.idem_key, ack);
  sendEnvelope(ack);
}

/**
 * Runs before any command does. A duplicate gets its original ACK replayed (ENVELOPE.md §4:
 * "never executed twice" — a flaky hotspot must not make the robot say the same thing three
 * times), and a command past `expires_at` is refused. True if either answered it.
 */
function answeredAlready(env: Envelope): boolean {
  const replayed = replayIfSeen(env.idem_key);
  if (replayed) {
    sendEnvelope(replayed);
    log(`Duplicate idem_key=${env.idem_key} — replayed the original ${env.topic} ACK, did not run it again`);
    return true;
  }

  // After the replay: a retry of a command that already ran gets its original ACK, not this.
  const expired = rejectIfExpired(env, outboundSeq);
  if (expired) {
    remember(env.idem_key, expired);
    sendEnvelope(expired);
    log(`Expired ${env.topic} msg_id=${env.msg_id} (expires_at=${env.expires_at}) — rejected, did not run it`);
    return true;
  }
  return false;
}

/** ENVELOPE.md §9: a bad message is answered and logged. It never closes the connection. */
function sendError(reason: string, about: { msg_id?: string; field?: string } = {}): void {
  sendEnvelope(
    newEnvelope({ kind: Kind.ERR, topic: Topics.SYS_ERROR, seq: outboundSeq, payload: { reason, ...about } })
  );
}

/** Commands the real robot stores in its map. The fixture accepts and logs them. */
const MAP_COMMANDS: ReadonlySet<string> = new Set([Topics.REGION_UPSERT, Topics.REGION_CONFIRM, Topics.ZONE_UPSERT]);

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
      sendError(result.error.reason, { field: result.error.field });
      return;
    }

    const env = result.data;

    // Handle handshake response
    if (env.topic === Topics.SYS_WELCOME) {
      const welcome = env.payload as WelcomePayload;
      if (welcome.accepted) {
        log(`Handshake accepted by Brain! Session: ${welcome.session_id}`);
        linkUp = true;
        drainOutbox();
        startHeartbeat();
        sendCapabilities();
      } else {
        log(`Handshake rejected by Brain: ${welcome.reason || 'Unauthorized'}. Closing socket.`);
        cleanupTimers();
        if (ws) ws.close(4000, welcome.reason || 'Handshake rejected');
      }
      return;
    }

    // Handle heartbeat from Brain
    if (env.topic === Topics.SYS_HEARTBEAT) {
      lastHeartbeatReceivedMs = Date.now();
      log(`Heartbeat received from Brain`);
      return;
    }

    // Brain confirming events arrived — the only thing that trims the outbox.
    if (env.topic === Topics.SYS_RECEIPT) {
      if (isReceiptPayload(env.payload)) {
        const trimmed = confirmDelivered(env.payload.msg_ids);
        log(`Brain confirmed ${trimmed} event(s); ${outbox.length} still waiting`);
      }
      return;
    }

    if (env.kind === Kind.ERR) {
      log(`Brain could not use a message: ${JSON.stringify(env.payload)}`);
      return;
    }

    if (env.kind === Kind.CMD && answeredAlready(env)) return;

    if (env.topic === Topics.NAV_GOTO && env.kind === Kind.CMD) {
      if (!isNavGotoPayload(env.payload)) {
        answer(env, {
          accepted: false,
          reason: navigationPayloadReason(env.payload),
          exec_status: ExecutionStatus.REJECTED,
        });
        log('nav.goto received -> REJECTED (invalid_navigation_payload)');
        return;
      }

      if (refuseNav) {
        answer(env, {
          accepted: false,
          reason: 'battery_below_return_margin',
          exec_status: ExecutionStatus.REJECTED,
          details: { battery_pct: REFUSAL_BATTERY_PCT },
        });
        log(`nav.goto received -> REJECTED (battery_below_return_margin, ${REFUSAL_BATTERY_PCT}%)`);
      } else if (activeNavigation) {
        answer(env, { accepted: false, reason: 'navigation_goal_active', exec_status: ExecutionStatus.REJECTED });
        log(`nav.goto received -> REJECTED (navigation_goal_active, ${activeNavigation.goalId})`);
      } else {
        startNavigation(env.payload, env.corr_id);
        answer(env, { accepted: true, exec_status: ExecutionStatus.EXECUTING, goal_id: env.payload.goal_id });
      }
      return;
    }

    if (env.topic === Topics.NAV_CANCEL && env.kind === Kind.CMD) {
      if (!isNavCancelPayload(env.payload)) {
        answer(env, { accepted: false, reason: 'invalid_navigation_payload', exec_status: ExecutionStatus.REJECTED });
        return;
      }

      const cancelReason = navigationCancelReason(activeNavigation, env.payload.goal_id);
      if (cancelReason) {
        answer(env, { accepted: false, reason: cancelReason, exec_status: ExecutionStatus.REJECTED });
        log(`nav.cancel received -> REJECTED (goal_not_found, ${env.payload.goal_id})`);
        return;
      }

      // The ACK goes first: the result is a separate event on the same corr_id (ENVELOPE.md §3).
      answer(env, { accepted: true, exec_status: ExecutionStatus.COMPLETED });
      log(`nav.cancel received -> ACCEPTED (${env.payload.goal_id})`);
      sendNavigationResult(false, 'cancelled');
      return;
    }

    // Handle voice.speak command
    if (env.topic === Topics.VOICE_SPEAK && env.kind === Kind.CMD) {
      const speak = env.payload as SpeakPayload;
      const lang = speak.lang || Language.EN;
      const priority = speak.priority || Priority.NORMAL;
      console.log(`\n🔊 [SPEAK ${lang}] "${speak.text}" (priority: ${priority})\n`);

      answer(env, { accepted: true, exec_status: ExecutionStatus.COMPLETED });
      log(`Sent ACK for msg_id: ${env.msg_id}`);
      return;
    }

    // The codec has already checked these payloads against their guards (PayloadGuards).
    if (env.topic === Topics.SCHED_WINDOW && env.kind === Kind.CMD) {
      cacheWindow(env.payload as SchedWindowPayload);
      answer(env, { accepted: true, exec_status: ExecutionStatus.COMPLETED });
      return;
    }

    if (env.kind === Kind.CMD && MAP_COMMANDS.has(env.topic)) {
      log(`${env.topic} received: ${JSON.stringify(env.payload)}`);
      answer(env, { accepted: true, exec_status: ExecutionStatus.COMPLETED });
      return;
    }

    log(`Received unhandled topic: ${env.topic} [kind=${env.kind}]`);
    // ENVELOPE.md §9: an unknown topic gets an ERR, never a guess. An ACK is itself an answer and
    // gets none back, or two peers that do not know each other's topics would answer for ever.
    if (env.kind !== Kind.ACK) {
      sendError(ProtocolErrorReason.UNKNOWN_TOPIC, { msg_id: env.msg_id });
    }
  });

  ws.on('close', (code, reason) => {
    linkUp = false;
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
  stopNavigation();
  resetSchedule(false);
  if (sightingTimer) clearInterval(sightingTimer);
  log('Shutting down Fake Heart simulator...');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) ws.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Auto-start only when executed directly
if (import.meta.main) {
  log(`Drives start ${NAV_START_DISTANCE_M} m out. Refusal is ${refuseNav ? 'ON' : 'OFF'} — type r + Enter to toggle.`);
  if (SIGHTINGS) {
    log(`Inventing a sighting every ${SIGHTING_INTERVAL_MS / 1000} s (FAKE_HEART_SIGHTINGS).`);
    startSightings();
  }
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (line: string) => {
    if (line.trim().toLowerCase() !== 'r') return;
    refuseNav = !refuseNav;
    log(refuseNav
      ? `Refusal ON — nav.goto will be rejected (battery ${REFUSAL_BATTERY_PCT}%)`
      : 'Refusal OFF — nav.goto will be accepted');
  });
  connect();
}
