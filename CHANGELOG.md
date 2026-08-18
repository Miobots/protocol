# Changelog — @miobots/protocol

Newest entries first. Records wire protocol changes, envelope schema evolution, and Fake Heart updates.

---

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
