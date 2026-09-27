# @miobots/protocol

Universal 10-field message envelope, wire codecs, topic registry, and canonical Fake Heart simulator for MioBots.

Shared across `miobots-brain`, `miobots-heart`, `miobots-synapse`, and `miobots-ganglion`.

---

## 📚 Complete Learning Guide

If you are new to this codebase or want to understand every architectural decision and TypeScript pattern in detail, check out
**`TEACHER.md`** — *The Ultimate TypeScript & Systems Engineering Masterclass for MioBots Protocol*. It is a personal study
guide kept locally and **gitignored**, so it is not on GitHub; the specification is `ENVELOPE.md` in the vault.

---

## Features

- **10-Field Wire Envelope:** Compliant with `ENVELOPE.md` (ULID identifiers, monotonic ns clocks, wallclock ms, session sequence counters, idempotency keys, expiration timestamps).
- **Isolated Codec:** JSON wire serialization (`encode`, `decode`, `parse`) cleanly decoupled from domain logic.
- **Topic → payload binding (`src/topics/registry.ts`):** `sys.hello`, `sys.welcome`, `sys.heartbeat`, `cap.manifest` and `voice.speak`, each bound to its payload type at compile time — a `voice.speak` envelope with the wrong payload does not typecheck, and adding a topic without a payload is a compile error.
- **Capability manifest (`src/topics/capability.ts`):** the shared capability IDs for both halves — `HeartCapabilities` (the robot's) and `BrainCapabilities` (the cloud side) — and the three states `available` · `degraded` (with a `note`) · `unavailable` (with a `reason`).
- **Canonical Fake Heart (`src/simulator/fake-heart.ts`):** Standalone robot simulator that dials out to Brain over WebSocket, authenticates, exchanges bidirectional heartbeats with 3-miss watchdog detection, and handles `voice.speak` with real-time ACKs. It is the **receiver** for `idem_key` (a duplicate replays the original ACK and is not re-executed) and for `expires_at` (a command that arrives late is rejected with reason `expired`), and it publishes the robot's half of `cap.manifest` every 10 s.
- **Isomorphic:** no Node-only APIs in the envelope or codec, so the same package runs under Bun, Node, React Native (Synapse) and browsers.
- **Zero-Dependency ULID Generator:** Monotonically sortable 26-char Crockford Base32 IDs.
- **Cross-Language Conformance Vectors (`conformance/`):** 31 canonical test vectors enforcing wire protocol parity between TypeScript and Rust.
- **Session Sequence Isolation & Gap Detector:** Independent per-connection sequence counters and stale telemetry drop logic.

---

## Repository Structure

```text
miobots-protocol/
├── src/
│   ├── index.ts              # Package entry point (re-exports everything)
│   ├── constants/            # Kinds, roles, errors, protocol defaults
│   ├── envelope/             # 10-field Envelope interface, ULID generator, sequence counter
│   ├── codec/                # encode(), decode(), and parse() JSON codecs
│   ├── topics/               # sys.*, cap.manifest and voice.* payloads, and the topic→payload registry
│   └── simulator/            # Canonical Fake Heart simulator (fake-heart.ts)
├── conformance/              # 31 JSON test vectors (valid & invalid)
│   ├── valid/                # 15 valid envelope vectors
│   └── invalid/              # 16 invalid envelope vectors
├── tests/                    # Bun test suite (envelope, codec, gaps, conformance, idempotency, expiry)
├── CHANGELOG.md              # What changed, newest first
└── README.md                 # Overview and quickstart
```

---

## Installation & Linkage

In other repositories (e.g. `miobots-brain`), link locally via `package.json`:
```json
{
  "dependencies": {
    "@miobots/protocol": "file:../miobots-protocol"
  }
}
```

**Re-run `bun install` in the consumer after every change here.** Bun links a `file:` dependency as
per-file symlinks made at install time, so a file added to this package afterwards is missing from
the consumer's `node_modules` until it re-installs.

---

## Commands (with Bun)

```bash
# 1. Install dependencies
bun install

# 2. Run unit & conformance test suite
bun test

# 3. Run typecheck
bun run typecheck

# 4. Start the Fake Heart simulator
bun run sim
# (or: bun run src/simulator/fake-heart.ts)
```

To stop the Fake Heart, press **Ctrl-C in its terminal.** Killing the `bun run sim` process from
elsewhere stops only the wrapper, and the simulator keeps running underneath.

| Variable | Default | Does |
|---|---|---|
| `BRAIN_URL` | `ws://localhost:8080/ws` | Where the Fake Heart dials |
| `DEV_TOKEN` | `mio-dev-secret-token` | Token sent in `sys.hello` |
| `DEVICE_ID` | `heart-sim-01` | Device id sent in `sys.hello` |
| `FAKE_HEART_DOCKING_UNAVAILABLE` | unset | `true` publishes docking as `unavailable` |

