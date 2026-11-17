# Changelog — @miobots/protocol

Newest entries first. Records wire protocol changes, envelope schema evolution, and Fake Heart updates.

## 2026-11-18 — Paired devices for the app (S9.2)

- `sys.devices` (EVT, Brain → Synapse): the paired laptops, each with `device_id`, `name`, `paired_at` and `online`. It never carries a token or its hash. Sent when an app connects and whenever a pairing or a laptop's connection changes. `isDevicesPayload` is exported for the app and is not in `PayloadGuards`, the same as the pairing topics.
- One valid vector. The Rust conformance test still passes.

## 2026-11-18 — Approval ticket for laptop actions (BRAIN_DECISIONS 27)

- `ApprovalTicket`, `isApprovalTicket` and `APPROVAL_META_KEY` (`"miobots/approval"`): Brain puts the ticket in an MCP `tools/call`'s `params._meta` after a human taps Approve. Ganglion runs an Action-tier tool only against a matching, unexpired, unused ticket.
- `canonicalJson()`: sorted-key JSON, so Brain and Ganglion hash the same bytes for the same arguments. Pure, because Synapse imports this package; each consumer hashes with its own crypto.
- No envelope or topic change. Conformance vectors are untouched.

## 2026-11-18 — Pairing a laptop daemon (G0.2, S9.2)

- `sys.pair` (Ganglion → Brain, sent instead of `sys.hello` while unpaired) and `sys.pair_confirm` (Synapse → Brain). Both are CMD. The ACK to `sys.pair` arrives once a human confirms the code, and carries the daemon's own `token`.
- `AckPayload` gains optional `token` and `name`.
- `isPairPayload` / `isPairConfirmPayload` (exactly six digits) and `PAIRING_CODE_TTL_MS` (5 minutes). The guards are exported for Brain's handler and are not in `PayloadGuards`; Heart never receives these topics, and the Rust decoder accepts them by kind.
- Three valid vectors. The Rust conformance test still passes.

## 2026-11-17 — Boundary validation and replay corrections

- The codec rejects non-object payloads and malformed ACKs, including an ACK on a telemetry topic.
- Fake Heart refuses malformed `voice.speak` without crashing and gives replayed ACKs a fresh `seq` on each connection.
- Teleop drops `drive.seq: 0`; drive sequences start at 1.
- Added eight envelope vectors for the new validation and MCP JSON-RPC parity, plus a teleop vector. The Rust decoder in `miobots-heart/src/mio_gateway` now runs these same vectors.

## 2026-11-17 — The rest of the registry, the outbox and the teleop contract (P2.5, P2.6, P3.1–P3.3, P4.1–P4.3, P5.1, P5.2)

### Added

- **Twelve topics**, each with a payload type, a runtime guard and conformance vectors:
  `sched.window`, `sched.fired` (P4.1) · `obs.sighting` (P3.1) · `diag.fault` (P3.3) ·
  `map.snapshot`, `region.upsert`, `region.confirm`, `zone.upsert` (P2.5) · `sys.approval`,
  `sys.killswitch` (P5.1) · `sys.error` (ENVELOPE §9) · `sys.receipt` (ENVELOPE §8).
- **`PayloadGuards`** (`src/topics/index.ts`) — one table the codec consults for every inbound
  envelope. The three hard-coded MCP checks in `decode` are now three rows in it.
- **`sys.receipt`** — Brain confirms events by `msg_id`, and that is the only thing that trims an
  outbox. Brain does not send it yet (B4.3).
- **Fake Heart: its own schedule (P4.2).** A `sched.window` is cached and fired from the robot's
  own timers, with Brain switched off, once per `occurrence_id`.
- **Fake Heart: outbox (P4.3).** Events wait while Brain is away, drain oldest-first with their
  original timestamps and a fresh `seq`, and are trimmed only on a receipt. In memory, capped at
  1,000.
- **Fake Heart: invented sightings (P3.2).** `FAKE_HEART_SIGHTINGS=true` emits one every 5 s.
- **Fake Heart: `ERR sys.error`** for a message it cannot parse or a topic it does not know.
- **Teleop frames (P2.6)** in `src/teleop/` — `hello`, `welcome`, `drive`, `status` — with
  `conformance/teleop.json`. Deliberately not envelopes; the contract is `TELEOP.md` in the vault.
- **`bun run bench` (P5.2).** On an i5-12450H laptop an encode + decode costs 1.4–2.3 µs for an
  ordinary message and 49 µs for a 200 × 200 map — at 20 msg/s, 0.10% of one core at worst, against
  a switch condition of 2%. **JSON stays.** Not yet run on the Pi.
- **`tests/fake-heart.e2e.test.ts`** — the simulator over a real socket against a stand-in Brain.

### Changed

- **`queuesInOutbox(kind, topic)` now takes the topic.** Four `EVT` topics never queue:
  `sys.heartbeat` and `cap.manifest` are re-published on a timer, and `mcp.response` /
  `mcp.notification` answer a request that has already timed out.
- **A Fake Heart drive carries on when Brain disconnects**, and its feedback and result wait in the
  outbox. It used to be discarded, because there was nowhere to keep the result.
- **Every Fake Heart command goes through one replay-and-expiry check** instead of a copy per topic.
- `conformance/valid/seq-zero-and-large.json` carried a placeholder `obs.sighting` payload from
  before the topic had a shape; it now carries a real one.

### Fixed

- **`main` was failing its own suite.** #17 raised the size cap to 512 KB and left
  `conformance/invalid/oversized-payload.json` at 72 KB, which then parsed. The vector is now just
  over 512 KB.
- A topic named `constructor` or `toString` reached `Object.prototype` in the codec's registry
  lookup and surfaced as an unknown parse error.

---

## 2026-11-13 — MCP protocol foundation (Phase 2A)

### Added

- `mcp.request`, `mcp.response`, and `mcp.notification` envelope topics.
- Typed JSON-RPC 2.0 request, response, error, and notification payloads.
- Bounded runtime validation for MCP JSON values, nesting, collections, IDs, methods, params, and response shape.
- Registered topic/kind validation and full-envelope UTF-8 size enforcement in the existing codec.

---

## 2026-10-17 — Fake Heart controls for the I3 demo (B2.5)

### Added

- `FAKE_HEART_NAV_DISTANCE_M` — drive length; the default 5 m finishes in 2.5 s, before a "stop" can arrive.
- Typing `r` + Enter in the simulator's terminal toggles the `nav.goto` refusal, so a drive and a refusal fit in one run.

### Fixed

- The robot's half of `cap.manifest` is published on connect, not 10 s later. Until then the Brain's situation block (B2.3) said the robot had reported nothing, and the agent declined to drive.

## 2026-10-01 — Telemetry topics (P2.4)

### Added

- `state.pose` and `state.battery` topics with payloads matching the conformance vectors.
- `TopicKind` — every topic's kind from ENVELOPE.md §10; an unclassified topic fails to compile.
- `queuesInOutbox(kind)` — only `EVT` waits in the outbox; telemetry is dropped.

## 2026-09-30 — Fake Heart navigation lifecycle (M-69)

### Added

- Validated `nav.goto` and `nav.cancel` payloads against the shared protocol types.
- Added navigation refusal, malformed-payload, and unknown-goal cancellation handling.
- Documented `FAKE_HEART_REFUSE_NAV` and goal-based cancellation.

### Changed

- Navigation feedback and terminal results now use the canonical payload shapes from the conformance vectors.

## 2026-09-30 — Navigation payload parity (P2.1)

### Changed

- Aligned navigation payload types with the canonical conformance vectors, including coordinate
  goals, estimated feedback time, final pose results, and optional failure reasons.
- Added compile-time coverage for the four navigation topics and goal-based cancellation.

## 2026-09-27 — Receiver-side expiry in the Fake Heart (B0.5) · #11

The Fake Heart ACKed `accepted: true` however late a command arrived. The codec's check compares
`expires_at` with the sender's own `t_wall_ms`, both stamped at send time, so a command delayed on
the wire passed it. Lateness is only visible against the receiver's clock.

### Added

- **`rejectIfExpired()`** in `src/simulator/fake-heart.ts`: a command at or past `expires_at` gets
  an ACK with `accepted: false`, `reason: "expired"`, `exec_status: "rejected"` and is not executed.
  It runs after the duplicate replay, so a retry of a command that already ran still gets its
  original ACK, and the rejection is remembered under the `idem_key`.
- **`tests/expiry.test.ts`** (4 tests).

The real Heart's `mio_gateway` needs the same check (H3.4).

## 2026-09-27 — Fixes from the 2026-09-20 review · #6 #7 #8 #9 #10

Five exit checks that had been ticked did not hold. Each was fixed here before its consumers.

### Fixed

- **Per-connection `seq` (P0.7) · #6.** `newEnvelope()` still fell back to a process-global counter
  when no `SequenceCounter` was passed — the exact failure ENVELOPE §6 names. The fallback is gone;
  every caller passes its connection's counter.
- **Topic bound to payload (P0.3) · #7.** Nothing tied a topic to its payload, so a `voice.speak`
  envelope with an unrelated payload typechecked. `src/topics/registry.ts` (`TopicPayloadMap`) now
  binds them at compile time, and adding a topic without a payload is a compile error.
- **Receiver-side idempotency (B0.5) · #8.** Idempotency was sender-side only, so the Fake Heart
  re-executed duplicates. It now remembers each `idem_key` for 10 minutes and replays the original
  ACK instead of acting twice. Added `tests/idempotency.test.ts`.
- **Capability IDs the app renders (S1.2) · #9.** The stub manifest published `navigation` and
  `voice`, which no consumer knew. `src/topics/capability.ts` now pins `HeartCapabilities` and
  `BrainCapabilities`, and the Fake Heart publishes the robot's half from the shared IDs.

### Changed

- **#10** tracks `ANTIGRAVITY.md` and pins TypeScript exactly, matching the other repositories.

## 2026-09-13 — `cap.manifest` from the Fake Heart (P2.3) · #5

### Added

- The `cap.manifest` topic and its payload types.
- The Fake Heart publishes a capability manifest every 10 s after a successful handshake
  (`ProtocolDefaults.CAP_MANIFEST_INTERVAL_MS`).
- `FAKE_HEART_DOCKING_UNAVAILABLE=true` publishes docking as unavailable, for testing the
  `unavailable` state.

## 2026-09-08 — Isomorphic package for React Native and browsers · #4

Synapse bundles this package with Metro, which failed on Node-only APIs.

### Changed

- **`src/envelope/ulid.ts`:** `globalThis.crypto.getRandomValues` instead of `node:crypto`.
- **`src/codec/json.ts`:** `TextEncoder`/`TextDecoder` instead of `Buffer`; `decode` and `parse`
  accept `string | Uint8Array`.
- **`src/envelope/envelope.ts`:** falls back to `performance.now()` for the monotonic clock when
  `process.hrtime` is absent.

## 2026-09-04 — Package exports · #3

### Changed

- `package.json` declares `main`, `types` and `exports`, so consumers resolve one entry point.
- `README.md` and `CLAUDE.md` updated for the Bun toolchain.

## 2026-08-19 05:40 PKT — P0.7: Closing the Four Spec Gaps (Version Handshake, Heartbeat Watchdog, Jitter & Sequence Counters)

### Summary Description

Closed all four architectural and behavioural gaps between `ENVELOPE.md` (§6, §8) and the runtime protocol implementation:
1. **Protocol Version Handshake Refusal:** Added `validateHello()` and `createWelcomeAck()` in `src/topics/sys.ts`. Protocol version mismatches are explicitly rejected with `reason: "protocol_version_mismatch"` and `sys.welcome { accepted: false }`, with `fake-heart.ts` closing rejected connections immediately.
2. **Bidirectional Heartbeat & Dead-Link Detection:** Configured `fake-heart.ts` to actively emit `sys.heartbeat` every 5 seconds (`ProtocolDefaults.HEARTBEAT_INTERVAL_MS`) and implemented a watchdog that declares dead links and terminates sockets if 3 consecutive heartbeats (>15 s, `ProtocolDefaults.HEARTBEAT_TIMEOUT_MS`) are missed from Brain.
3. **Reconnection Jitter:** Implemented `calculateBackoffWithJitter()` applying a randomized factor ($0.5 \times \text{delay}$ to $1.5 \times \text{delay}$) to prevent thundering-herd reconnect spikes.
4. **Per-Connection Monotonic Sequence Counters & Gap Detectors:** Replaced global shared sequence state with isolated `SequenceCounter` instances and a `SequenceGapDetector` module (`src/envelope/sequence.ts`). Supported `SequenceCounter` integration in `newEnvelope()`, ensuring multi-connection environments maintain per-connection sequence isolation and discard stale telemetry.

### Added

- **`src/envelope/sequence.ts`:** `SequenceCounter`, `createSequenceCounter()`, and `SequenceGapDetector` for per-connection sequence isolation and stale telemetry pruning.
- **`src/topics/sys.ts`:** `validateHello()` and `createWelcomeAck()` helpers for strict handshake negotiation.
- **`tests/gaps.test.ts`:** Automated test suite validating version handshake refusal, heartbeat parameters, jittered backoffs, and isolated sequence tracking.
- **`src/constants/defaults.ts`:** Added `HEARTBEAT_INTERVAL_MS` (5000), `HEARTBEAT_MISSED_THRESHOLD` (3), `HEARTBEAT_TIMEOUT_MS` (15000), `RECONNECT_JITTER_MIN_FACTOR` (0.5), and `RECONNECT_JITTER_MAX_FACTOR` (1.5).

### Changed

- **`src/envelope/envelope.ts`:** Updated `newEnvelope()` to accept `SequenceCounter` instances in `options.seq`.
- **`src/simulator/fake-heart.ts`:** Integrated per-connection `SequenceCounter`, bidirectional 5s heartbeats with 3-miss dead-link watchdog, version rejection handling, and jittered reconnection backoff.


## 2026-08-19 05:30 PKT — P0.6: Cross-Language Conformance Vectors & Strict Parity Validation

### Summary Description

Implemented the shared protocol conformance test suite mandated by **HEART_DECISIONS #33** and **ENVELOPE.md §11**. Establishes 31 canonical test vectors across `conformance/valid/` (15 envelopes) and `conformance/invalid/` (16 envelopes and wire payloads) designed for cross-language validation between TypeScript (`miobots-protocol`, `miobots-brain`) and Rust (`mio_gateway`).

Enhanced the runtime JSON codec and envelope factory with strict invariant validation, including requiring `idem_key` on `CMD` envelopes, rejecting non-CMD envelopes carrying `idem_key` or `expires_at`, catching expired commands (`expires_at < t_wall_ms`), enforcing stringified decimal digits on `t_mono_ns`, and capping payload/message wire sizes at 64 KB (`ProtocolDefaults.MAX_PAYLOAD_BYTES`). Added dynamic vector testing in `tests/conformance.test.ts` running under Bun and Node.

### Added

- **`conformance/README.md`:** Two-line rule establishing that adding a field means adding a vector.
- **`conformance/valid/`:** 15 canonical valid envelopes covering commands (`nav.goto`, `voice.speak`, `sys.hello`), acknowledgements (`sys.welcome`, acceptances, refusal with reason), events (`sys.heartbeat`, `diag.fault`, `nav.feedback`, `nav.result`), telemetry (`state.pose`, `state.battery`), and queries/replies (`cap.manifest`).
- **`conformance/invalid/`:** 16 canonical rejection vectors covering missing fields (`topic`, `msg_id`, `corr_id`), empty/unknown `kind` (`BANANA`), missing or empty `idem_key` on `CMD`, non-CMD with `idem_key` or `expires_at`, number or malformed `t_mono_ns`, expired commands, oversized payloads (>64 KB), negative sequence numbers, and malformed wire JSON syntax.
- **`tests/conformance.test.ts`:** Automated test suite dynamically loading and validating all conformance vectors.
- **`src/constants/errors.ts`:** Added `ProtocolErrorReason` constants (`invalid_envelope`, `unknown_kind`, `unknown_topic`, `malformed`, `expired`, `oversized_payload`) and error codes `ERR_EXPIRED` and `ERR_PAYLOAD_TOO_LARGE`.
- **`src/constants/defaults.ts`:** Added `MAX_PAYLOAD_BYTES` and `MAX_MESSAGE_BYTES` (64 KB).

### Changed

- **`src/envelope/types.ts`:** Enhanced `ProtocolError` with `reason` and `field` properties.
- **`src/envelope/envelope.ts`:** `newEnvelope()` automatically populates a default `idem_key` when `kind === Kind.CMD` if omitted.
- **`src/codec/json.ts`:** Enforced strict wire validation, size limits, and machine-readable error reasons.


## 2026-08-16 06:00 PKT — Centralized Constants & Configuration Module

### Summary Description

Eliminated scattered hardcoded values across the protocol package by establishing a dedicated, centralized `src/constants/` module. Magic strings and magic numbers for device roles, execution statuses, languages, error codes, network endpoints, reconnection backoffs, and ULID alphabet dimensions are now managed from single authoritative definitions.

All modules (`src/envelope/`, `src/codec/`, `src/topics/`, `src/simulator/`, and `tests/`) have been refactored to import directly from this constants system. This ensures that adjusting default network timeouts, authentication tokens, error codes, or topic categories requires updating a single file rather than hunting down strings across the entire codebase.

### Added

- **`src/constants/roles.ts`:** `DeviceRole` (`heart`, `synapse`, `ganglion`), `Language` (`en`, `ur`, `mixed`), `ExecutionStatus` (`queued`, `executing`, `rejected`, `completed`), `Priority`, `SystemHealth`.
- **`src/constants/kinds.ts`:** Canonical `Kind` constants (`CMD`, `ACK`, `EVT`, `TELEM`, `QRY`, `RPY`, `ERR`).
- **`src/constants/errors.ts`:** Comprehensive `ProtocolErrorCode` enum constants.
- **`src/constants/defaults.ts`:** `ProtocolDefaults` containing default port (`8080`), default Brain URL (`ws://localhost:8080/ws`), backoff settings, and ULID sizes.
- **`src/constants/index.ts`:** Constants sub-module barrel export.

---

## 2026-08-16 05:50 PKT — Modular Subdirectory Architecture Reorganization

### Summary Description

Refactored the internal package layout of `miobots-protocol` from a flat single-directory structure into dedicated, modular subdirectories. This improves separation of concerns and architectural clarity as new topics, codec formats, and simulators are added.

The code is now organized into clean domain modules: `src/envelope/` for envelope definitions and ULID generation, `src/codec/` for JSON wire serialization and validation, `src/topics/` for system lifecycle and voice payloads, `src/simulator/` for the canonical Fake Heart client, and a dedicated top-level `tests/` directory for test suites.

Root files retain backward-compatible forwarding re-exports, and `package.json` scripts have been updated to target the modular paths cleanly under Bun.

### Changed & Modularized

- **`src/envelope/`:** `types.ts`, `envelope.ts`, `ulid.ts`, `index.ts`.
- **`src/codec/`:** `json.ts`, `index.ts`.
- **`src/topics/`:** `sys.ts`, `voice.ts`, `index.ts`.
- **`src/simulator/`:** `fake-heart.ts`.
- **`tests/`:** `envelope.test.ts`, `codec.test.ts`.

---

## 2026-08-16 05:45 PKT — Wave 0: Envelope Types, Isolated JSON Codec, Topics & Canonical Fake Heart

### Summary Description

Implemented the foundational wire protocol package for the MioBots ecosystem from scratch. This package establishes the universal 10-field envelope structure mandated by `03 Engineering/Protocol/ENVELOPE.md`, enabling typed, reliable, and asynchronous message exchange between Brain, Heart, Synapse, and Ganglion across WebSocket and queue boundaries.

The implementation isolates JSON serialization inside a dedicated codec (`src/codec/json.ts`), ensuring future migrations to binary formats like MessagePack or CBOR will require modifying only two functions without leaking encoding logic into consumer message handlers. A zero-dependency, 26-character Crockford Base32 ULID generator was implemented in `src/envelope/ulid.ts` to provide sortable, collision-resistant message and correlation identifiers. The canonical standalone `Fake Heart` simulator (`src/simulator/fake-heart.ts`) was delivered, featuring auto-reconnecting dial-out behavior to Brain, credential handshake handling, and real-time speech output logging with immediate correlation ACKs.

The repository was fully adapted for the Bun runtime (`bun install`, `bun test`, `bun run sim`), accompanied by an automated unit test suite in `tests/` validating envelope validity, unique identifier generation, monotonic sequence and timestamp progression, and strict error handling on malformed payloads.

### Added

- **`src/envelope/types.ts`:** Defined `Kind` constants, 10-field `Envelope<TTopic, TPayload>` interface, `AckPayload`, and `ProtocolError`.
- **`src/envelope/ulid.ts`:** Zero-dependency 48-bit timestamp + 80-bit randomness Crockford Base32 ULID generator.
- **`src/envelope/envelope.ts`:** Factory functions `newEnvelope()` and `createAck()`.
- **`src/codec/json.ts`:** `encode()`, `decode()`, and `parse()` with exhaustive schema validation.
- **`src/topics/`:** Type definitions for v0 topics: `sys.hello`, `sys.welcome`, `sys.heartbeat`, `voice.speak`.
- **`src/simulator/fake-heart.ts`:** Standalone canonical simulator dialing into `ws://localhost:8080/ws`.
- **`tests/`:** Comprehensive unit tests compatible with Node and Bun test runners.
- **`ANTIGRAVITY.md` & `README.md`:** Bun-centric developer guides and architectural invariants.
