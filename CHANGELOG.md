# Changelog — @miobots/protocol

Newest entries first. Records wire protocol changes, envelope schema evolution, and Fake Heart updates.

---

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
