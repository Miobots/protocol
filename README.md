# @miobots/protocol

Universal 10-field message envelope, isolated wire codecs, topic registry with compile-time payload bindings, the teleop frame contract, and canonical Fake Heart simulator for MioBots.

Shared across `miobots-brain`, `miobots-heart`, `miobots-synapse`, and `miobots-ganglion`.

---

## Documentation & Specifications

- **`ENVELOPE.md`** (`../../03 Engineering/Protocol/ENVELOPE.md`): The canonical wire protocol specification. Defines envelope schema, message kinds, idempotency, queuing, clock synchronization, and error handling.
- **`TELEOP.md`** (`../../03 Engineering/Protocol/TELEOP.md`): The phone-to-robot driving contract — the one path that is deliberately not an envelope.
- **`CHANGELOG.md`**: Chronological log of wire changes, envelope schema evolution, and simulator additions.

---

## Core Protocol Invariants

1. **Owned by nobody, imported by everybody:** The envelope is never copied into consumer repositories. A copy is a fork waiting to happen.
2. **Codec isolation:** Wire serialization (`encode`, `decode`, `parse` in `src/codec/json.ts`) is strictly decoupled from domain logic and message handlers.
3. **Events queue; telemetry is discarded:**
   - `EVT` is a domain fact (e.g., `nav.result`, `sched.fired`, `obs.sighting`) and persists in the durable outbox across network outages (`queuesInOutbox(kind, topic) === true`).
   - `TELEM` is a transient reading (e.g., `state.pose`, `state.battery`, `map.snapshot`) and is discarded immediately on disconnect.
   - Four `EVT` topics never queue, because a stored copy is only ever stale: `sys.heartbeat` and `cap.manifest` are re-published on a timer, and `mcp.response` / `mcp.notification` answer a request that has long since timed out.
   - The outbox is trimmed only when Brain names the events in a `sys.receipt` — never on send.
4. **Asymmetric queuing:** Heart queues events upward. Brain never queues commands downward — it resends current state on reconnect.
5. **ACK means accepted/rejected, never finished:** Long-running operations (like `nav.goto`) emit an immediate `ACK`, stream progress via `EVT nav.feedback`, and conclude with `EVT nav.result`.
6. **Command idempotency (`idem_key`):** Every `CMD` carries a unique ULID idempotency key. Receivers cache the outcome for 10 minutes (`IDEMPOTENCY_TTL_MS = 600000`) and replay the original `ACK` for duplicate arrivals.
7. **Canonical Fake Heart:** A single reference simulator living in `src/simulator/fake-heart.ts` that dials *out* to Brain over WebSocket, acting as the ground-truth integration fixture.

---

## The 10-Field Wire Envelope

All communication traversing WebSocket connections or persistent queues adheres to the strict 10-field envelope structure:

| Field | Type | Description |
|---|---|---|
| `msg_id` | `string` | Canonical message identifier (26-character Crockford Base32 ULID). |
| `corr_id` | `string` | Correlation identifier linking commands, replies, progress events, and audit logs. |
| `t_mono_ns` | `string` | Monotonic clock timestamp in nanoseconds for micro-benchmarking and latency profiling. |
| `t_wall_ms` | `number` | Unix epoch timestamp in milliseconds (`Date.now()`). |
| `kind` | `Kind` | Message category: `CMD`, `ACK`, `EVT`, `TELEM`, `QRY`, `RPY`, or `ERR`. |
| `topic` | `string` | Message topic string identifying action and domain payload (e.g. `nav.goto`). |
| `seq` | `number` | Monotonically increasing `uint32` sequence counter scoped per-connection and direction. |
| `idem_key` | `string` (opt) | Idempotency key. Mandatory for `CMD` messages to prevent duplicate execution. |
| `expires_at` | `number` (opt) | Unix epoch ms timestamp after which a delayed command must be rejected as expired. |
| `payload` | `TPayload` | Domain-specific payload bound to the topic at compile time. |

---

## Canonical Topic Registry

Every topic is bound to its payload at compile time in `src/topics/registry.ts` (`TopicPayloadMap`). Registering a topic without a payload, or sending the wrong payload shape for a topic, is a compile-time type error.

### Topic Classification & Allowed Kinds

| Category | Topic | Allowed Kinds | Outbox Queued | Payload Interface | Description |
|---|---|---|---|---|---|
| **System** | `sys.hello` | `CMD` | No | `HelloPayload` | Client handshake announcing role, device ID, protocol version, and auth token. |
| | `sys.welcome` | `ACK` | No | `WelcomePayload` | Server response confirming connection parameters and heartbeat intervals. |
| | `sys.heartbeat` | `EVT` | No (periodic) | `HeartbeatPayload` | Bidirectional liveness ping carrying device health and battery %. |
| | `sys.error` | `ERR` | No | `ErrorPayload` | "Your message was bad": a `reason`, and the `msg_id` and `field` when they can be named. Never closes the connection. |
| | `sys.receipt` | `ACK` | No | `ReceiptPayload` | Brain confirming events by `msg_id`. The only thing that trims an outbox. |
| **Capabilities** | `cap.manifest` | `EVT`, `QRY`, `RPY` | No (periodic) | `CapabilityManifestPayload` | Published on connect and every 10 s; declares `HeartCapabilities` and `BrainCapabilities` (`available` / `degraded` / `unavailable`). |
| **Permission** | `sys.approval` | `CMD` | No | `ApprovalPayload` | Asks a human, showing the exact `tool_name` and `args` and when it lapses (`expires_at`). The ACK is the answer. |
| | `sys.killswitch` | `CMD` | No | `KillSwitchPayload` | Everything off at once, or back on (`active`). |
| **Voice** | `voice.speak` | `CMD` | No | `SpeakPayload` | Speech synthesis request with language (`en`, `ur`, `mixed`), priority, and text. |
| **Navigation** | `nav.goto` | `CMD` | No | `NavGotoPayload` | `goal_id` plus a coordinate goal (`x`, `y`, optional `yaw`) or a named location (`region`). |
| | `nav.cancel` | `CMD` | No | `NavCancelPayload` | Cancels an active navigation goal by `goal_id`. |
| | `nav.feedback` | `EVT` | Yes | `NavFeedbackPayload` | Periodic progress (`distance_remaining_m`, `estimated_time_remaining_s`). |
| | `nav.result` | `EVT` | Yes | `NavResultPayload` | Terminal outcome (`success`, `total_time_s`, `final_pose`, optional `reason`). |
| **Telemetry** | `state.pose` | `TELEM` | No (dropped) | `PosePayload` | Transient odometry reading (`x`, `y`, `yaw`, `confidence`). |
| | `state.battery` | `TELEM` | No (dropped) | `BatteryPayload` | Battery `percentage`, `voltage`, and `is_charging`. |
| **Reminders** | `sched.window` | `CMD` | No | `SchedWindowPayload` | The next 72 h of concrete `occurrences`. Replaces what the robot held; never a delta. |
| | `sched.fired` | `EVT` | Yes | `SchedFiredPayload` | "I announced it", keyed on `occurrence_id`. |
| **Perception** | `obs.sighting` | `EVT` | Yes | `SightingPayload` | What was seen: `label`, Urdu and English `aliases`, `confidence`, `pose`, optional `region_id` and `thumbnail_url`. |
| **Diagnostics** | `diag.fault` | `EVT` | Yes | `FaultPayload` | A structured fault: `subsystem`, an upper-case `code` (never a sentence), `severity`, optional `recovery_hint` and `pose`. |
| **Map** | `map.snapshot` | `TELEM` | No (dropped) | `MapSnapshotPayload` | The occupancy grid as it is now, run-length encoded (`encodeCells` / `decodeCells`). |
| | `region.upsert` | `CMD` | No | `RegionPayload` | A room: `polygon`, `name_en` / `name_ur`, and whether a human has `confirmed` it. |
| | `region.confirm` | `CMD` | No | `RegionConfirmPayload` | A human agreeing with a label the robot proposed. |
| | `zone.upsert` | `CMD` | No | `ZonePayload` | An area the robot must never enter. |
| **MCP** | `mcp.request` | `CMD` | No | `MCPRequestPayload` | JSON-RPC 2.0 request envelope (`id`, `method`, optional `params`). |
| | `mcp.response` | `EVT` | No (a reply) | `MCPResponsePayload` | JSON-RPC 2.0 response carrying `result` or typed `error` (`code`, `message`, `data`). |
| | `mcp.notification` | `CMD`, `EVT` | No | `MCPNotificationPayload` | JSON-RPC 2.0 notification without an `id`. |

No topic carries a velocity. Driving from the phone uses the four teleop frames in `src/teleop/` on its own socket — see `TELEOP.md`.

---

## Codec & Runtime Validation

The codec (`src/codec/json.ts`) provides strict serialization and schema validation:

- **`encode(envelope)`**: Serializes an envelope to JSON and enforces the 512 KB message limit.
- **`decode(raw)`**: Deserializes raw wire JSON into a validated `Envelope`, verifying required fields, kind-topic pairing, timestamp sanity, sequence bounds, and — for every topic listed in `PayloadGuards` — the payload's shape. IDs are checked for presence, not for ULID format.
- **`parse(raw)`**: Non-throwing safe parser returning `{ success: true, data } | { success: false, error }`.
- **Payload & Message Constraints:** Up to 512 KB (`MAX_PAYLOAD_BYTES` / `MAX_MESSAGE_BYTES`), supporting structured attachments and rich MCP payloads.
- **MCP Security Guards:**
  - Maximum JSON object recursion depth of 32 levels.
  - Maximum array/object entry limit of 1,024 elements.
  - Prototype pollution guards rejecting `__proto__`, `prototype`, and `constructor` keys.

---

## Canonical Fake Heart Simulator

The simulator (`src/simulator/fake-heart.ts`) mimics a real MioBots robot for testing without hardware:

- **Connection:** Dials out to Brain over WebSocket (`DEFAULT_BRAIN_URL = ws://localhost:8080/ws`).
- **Watchdog:** Sends heartbeats every 5 s and drops dead links after 3 consecutive missed beats (15 s timeout).
- **Jittered Backoff:** Reconnects with exponential backoff (1 s to 10 s) randomized between 0.5× and 1.5× factor.
- **Receiver-Side Expiry:** Commands arriving past `expires_at` are rejected with `accepted: false, reason: "expired"`.
- **Receiver-Side Idempotency:** Duplicate `idem_key` payloads replay their cached `ACK` without re-executing.
- **Navigation Simulation:** Simulates drives with periodic feedback (0.5 s ticks), supports cancellation, and allows interactive refusal testing. A drive carries on when Brain goes away.
- **Its Own Schedule:** Caches a `sched.window`, sets its own timers, and announces reminders on time even with Brain switched off — once per `occurrence_id`, however often the window is pushed again.
- **Outbox:** Events wait while Brain is unreachable, go out oldest-first on reconnect with their original timestamps, and are deleted only when Brain names them in a `sys.receipt`. In memory, capped at 1,000.
- **Invented Sightings:** With `FAKE_HEART_SIGHTINGS=true`, emits an `obs.sighting` every 5 s from a fixed list (glasses, keys, wallet, medicine).
- **Errors:** A message it cannot parse, or a topic it does not know, is answered with `ERR sys.error` and the link stays up.

### Simulator Controls & Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BRAIN_URL` | `ws://localhost:8080/ws` | Target WebSocket endpoint for the Brain. |
| `DEV_TOKEN` | `mio-dev-secret-token` | Authentication secret sent in `sys.hello`. |
| `DEVICE_ID` | `heart-sim-01` | Identifier advertised during handshake. |
| `FAKE_HEART_DOCKING_UNAVAILABLE` | unset | Set to `true` to publish docking capability as `unavailable`. |
| `FAKE_HEART_REFUSE_NAV` | unset | Set to `true` to reject `nav.goto` commands due to simulated low battery. |
| `FAKE_HEART_NAV_DISTANCE_M` | `5` | Simulated drive distance (1 m per 0.5 s tick; `30` gives 15 s of drive time). |
| `FAKE_HEART_SIGHTINGS` | unset | Set to `true` to emit an invented `obs.sighting` every 5 s. |

> [!TIP]
> **Interactive Live Refusal Toggle:** Press `r` + Enter in the Fake Heart simulator terminal while it is running to toggle navigation refusal on or off without restarting.
> 
> To stop the simulator, press **Ctrl-C** in its terminal. Killing the `bun run sim` process from elsewhere stops only the wrapper, and the simulator keeps running underneath.

---

## Repository Structure

```text
miobots-protocol/
├── src/
│   ├── index.ts              # Package entry point (re-exports constants, envelope, codec, topics)
│   ├── constants/            # Kinds, roles, execution statuses, error codes, defaults
│   │   ├── defaults.ts       # Protocol defaults (512 KB cap, 5 s heartbeats, 10 min TTL)
│   │   ├── errors.ts         # ProtocolErrorCode and ProtocolErrorReason definitions
│   │   ├── kinds.ts          # Kind constants (CMD, ACK, EVT, TELEM, QRY, RPY, ERR)
│   │   └── roles.ts          # DeviceRole, Language, ExecutionStatus, Priority
│   ├── envelope/             # Envelope interface, factory, ULID, and sequence tracking
│   │   ├── envelope.ts       # newEnvelope() and createAck() constructors
│   │   ├── sequence.ts       # Per-connection SequenceCounter implementation
│   │   ├── types.ts          # Envelope, AckPayload, and ProtocolError classes
│   │   └── ulid.ts           # Zero-dependency Crockford Base32 ULID generator (sortable to the millisecond)
│   ├── codec/                # Wire serialization and schema validation
│   │   └── json.ts           # encode(), decode(), parse(), and UTF-8 byte measurement
│   ├── topics/               # Canonical topic definitions and typed payloads
│   │   ├── capability.ts     # cap.manifest schemas (HeartCapabilities, BrainCapabilities)
│   │   ├── diag.ts           # diag.fault schema and FaultSeverity
│   │   ├── guards.ts         # Shared runtime checks (isRecord, isPose, isPolygon, …)
│   │   ├── map.ts            # map.snapshot (with run-length cells), region.* and zone.upsert schemas
│   │   ├── mcp.ts            # MCP JSON-RPC 2.0 payloads and validation guards
│   │   ├── nav.ts            # nav.goto, nav.cancel, nav.feedback, nav.result schemas
│   │   ├── obs.ts            # obs.sighting schema
│   │   ├── registry.ts       # TopicPayloadMap compile-time binding
│   │   ├── sched.ts          # sched.window and sched.fired schemas
│   │   ├── state.ts          # state.pose and state.battery telemetry schemas
│   │   ├── sys.ts            # sys.hello, welcome, heartbeat, error, receipt, approval, killswitch
│   │   └── voice.ts          # voice.speak schema
│   ├── teleop/               # LAN-direct driving frames — deliberately not envelopes
│   │   └── index.ts          # hello / welcome / drive / status, parse and encode
│   └── simulator/            # Canonical Fake Heart robot simulator
│       └── fake-heart.ts     # Simulator implementation with WebSocket dialout
├── conformance/              # Cross-language wire test vectors
│   ├── valid/                # 29 canonical valid envelope vectors
│   ├── invalid/              # 30 canonical invalid envelope vectors
│   └── teleop.json           # 14 teleop frame vectors
├── bench/
│   └── codec.bench.ts        # Encode + decode cost per message (bun run bench)
├── tests/                    # Bun test suite
│   ├── codec.test.ts         # Codec serialization, parsing, and boundary tests
│   ├── conformance.test.ts   # Conformance vector validation suite
│   ├── envelope.test.ts      # Envelope factory, ULID, and sequence tests
│   ├── expiry.test.ts        # Receiver-side expires_at rejection tests
│   ├── fake-heart.e2e.test.ts # The simulator over a real socket against a stand-in Brain
│   ├── gaps.test.ts          # Sequence gap detection and watchdog tests
│   ├── idempotency.test.ts   # Receiver-side idem_key replay tests
│   ├── mcp.test.ts           # MCP JSON-RPC payloads and security guard tests
│   ├── navigation.test.ts    # Navigation goal validation and cancellation tests
│   ├── outbox.test.ts        # Outbox trimming, the robot's own schedule, invented sightings
│   ├── telemetry.test.ts     # Telemetry classification and outbox drop tests
│   ├── teleop.test.ts        # Teleop frame vectors and the connection-lost rule
│   └── topics.test.ts        # Map cell round trip and compile-time binding of the new topics
├── CHANGELOG.md              # Version and feature changelog
├── package.json              # Package manifest and scripts
├── tsconfig.json             # Modern TypeScript ES2023 / NodeNext configuration
└── README.md                 # Project documentation and guide
```

---

## Installation & Linkage

In consuming packages (`miobots-brain`, `miobots-heart`, `miobots-synapse`, `miobots-ganglion`), link locally via `package.json`:

```json
{
  "dependencies": {
    "@miobots/protocol": "file:../miobots-protocol"
  }
}
```

> [!IMPORTANT]
> **Re-run `bun install` in consumer repositories after adding files here.**
> Bun establishes local `file:` dependencies as per-file symlinks at install time. Files added to this package will not be visible in consumer `node_modules` until `bun install` is re-run in the consumer.

---

## Verification & Development Commands

```bash
# 1. Install dependencies
bun install

# 2. Run TypeScript typecheck (in-memory verification)
bun run typecheck

# 3. Run the full test suite
bun test

# 4. Run a specific test file
bun test tests/mcp.test.ts
bun test tests/navigation.test.ts

# 5. Launch the canonical Fake Heart simulator
bun run sim
# or:
bun run src/simulator/fake-heart.ts

# 6. Measure what the JSON codec costs per message
bun run bench
```
