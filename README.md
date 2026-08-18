# @miobots/protocol

Universal 10-field message envelope, wire codecs, topic registry, and canonical Fake Heart simulator for MioBots.

Shared across `miobots-brain`, `miobots-heart`, `miobots-synapse`, and `miobots-ganglion`.

---

## Features

- **10-Field Wire Envelope:** Compliant with `03 Engineering/Protocol/ENVELOPE.md` (ULID identifiers, monotonic ns clocks, wallclock ms, session sequence counters, idempotency keys, expiration timestamps).
- **Isolated Codec:** JSON wire serialization (`encode`, `decode`, `parse`) cleanly decoupled from domain logic.
- **Canonical Fake Heart (`src/fake-heart.ts`):** Standalone robot simulator that dials out to Brain over WebSocket, authenticates, and handles speech actions with real-time ACKs.
- **Zero-Dependency ULID Generator:** Monotonically sortable 26-char Crockford Base32 IDs.

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

# 2. Run unit test suite
bun test

# 3. Run typecheck
bun run typecheck

# 4. Start the Fake Heart simulator
bun run sim
# (or: bun run src/fake-heart.ts)
```
