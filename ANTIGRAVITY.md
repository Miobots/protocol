# Protocol (`@miobots/protocol`) — Antigravity Rules

**Owned by nobody, imported by everybody.** Houses the 10-field message envelope, wire codecs, topic definitions, and the canonical standalone Fake Heart simulator.

---

## Non-Negotiable Invariants

1. **The envelope is NEVER copied into consumer repos.** Both Heart, Brain, Synapse, and Ganglion import from here.
2. **`encode`/`decode`/`parse` stay isolated in `src/codec/json.ts`.** JSON wire serialization is decoupled from message handlers.
3. **Events queue; Telemetry is discarded:**
   - `EVT` is a domain fact (`nav.result`, `diag.fault`, `obs.sighting`, `sched.fired`) and survives network outages in durable outbox.
   - `TELEM` is a transient reading (`state.pose`, `state.battery`) and drops immediately during disconnects.
4. **Asymmetric Queuing:** Heart queues events upward; Brain never queues commands downward (resends current state on reconnect).
5. **`ACK` means accepted/rejected, NEVER finished.** Long operations emit immediate ACK, stream `EVT nav.feedback`, and finish with `EVT nav.result`.
6. **Every `CMD` carries `idem_key`:** Duplicate deliveries replay the original ACK without re-executing.
7. **Canonical Fake Heart (`src/simulator/fake-heart.ts`):** Dials out to Brain over WebSocket (`ws://localhost:8080/ws`). Must remain the single canonical simulation fixture for all components.

---

## Toolchain & Commands (Bun)

```bash
bun install        # Install dependencies
bun test           # Run unit tests
bun run typecheck  # TypeScript check
bun run sim        # Start canonical Fake Heart simulator
```

Consumers must re-run `bun install` after any change here — a `file:` dependency is linked as
per-file symlinks at install time (see `CLAUDE.md`).
