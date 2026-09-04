# @miobots/protocol

Universal 10-field message envelope, wire codecs, topic registry, and canonical Fake Heart simulator for MioBots.

Shared across `miobots-brain`, `miobots-heart`, `miobots-synapse`, and `miobots-ganglion`.

---

## 📚 Complete Learning Guide

If you are new to this codebase or want to understand every architectural decision and TypeScript pattern in detail, check out:
👉 **[`TEACHER.md`](./TEACHER.md)** — *The Ultimate TypeScript & Systems Engineering Masterclass for MioBots Protocol*.

---

## Features

- **10-Field Wire Envelope:** Compliant with `ENVELOPE.md` (ULID identifiers, monotonic ns clocks, wallclock ms, session sequence counters, idempotency keys, expiration timestamps).
- **Isolated Codec:** JSON wire serialization (`encode`, `decode`, `parse`) cleanly decoupled from domain logic.
- **Canonical Fake Heart (`src/simulator/fake-heart.ts`):** Standalone robot simulator that dials out to Brain over WebSocket, authenticates, exchanges bidirectional heartbeats with 3-miss watchdog detection, and handles speech actions with real-time ACKs.
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
│   ├── topics/               # sys.* and voice.* payload definitions & validators
│   └── simulator/            # Canonical Fake Heart simulator (fake-heart.ts)
├── conformance/              # 31 JSON test vectors (valid & invalid)
│   ├── valid/                # 15 valid envelope vectors
│   └── invalid/              # 16 invalid envelope vectors
├── tests/                    # Bun test suite (envelope, codec, gaps, conformance)
├── TEACHER.md                # Comprehensive learning masterclass guide
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

