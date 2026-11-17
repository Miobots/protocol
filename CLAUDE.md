# Protocol — the shared wire format

**Owned by nobody, imported by everybody.** This repo holds the message envelope that Heart, Brain,
Synapse and Ganglion all speak, plus the canonical Fake Heart both sides test against.

**This is the repo where two people's assumptions silently diverge.** Changes get reviewed by
whoever else they affect.

---

## Non-negotiable rules

**The envelope is never copied into another repo.** Both Heart and Brain import it from here. A
copy is a fork waiting to happen.

**`encode`/`decode` stay isolated in one file.** JSON for now; the switch to a binary format is
supposed to cost two functions. If encoding logic leaks into message handlers, that stops being
true.

**Events queue, telemetry is discarded.** An event is a fact — a fault, a nav result, a fired
reminder — and it waits in the outbox until delivered. Telemetry is a reading; a twenty-minute-old
pose is worse than no pose. **Classifying a new topic as `EVT` or `TELEM` is a real decision, made
once, and it is what keeps the durable outbox tractable.**

**Four `EVT` topics never queue**, because a stored copy is only ever stale: `sys.heartbeat` and
`cap.manifest` are re-published on a timer, and `mcp.response` / `mcp.notification` answer a
request that has already timed out. `queuesInOutbox(kind, topic)` is the one place that says so.

**An outbox is trimmed on `sys.receipt` and on nothing else** — never on send.

**No topic carries a velocity.** Driving from the phone uses the teleop frames in `src/teleop/` on
their own socket, so that "nothing Brain says can reach the wheels" stays checkable.

**Heart queues events upward. Brain does not queue commands downward** — it re-sends current state
on reconnect. A queue of commands is a queue of stale intentions.

**`ACK` means received and accepted, never finished.** Long operations complete via a separate
event on the same `corr_id`. An `ACK` may also *reject*, and rejection is normal operation.

**Every `CMD` carries an `idem_key` and is never executed twice.** A flaky hotspot must not send
the robot to the kitchen three times.

**Nothing disconnects the peer except an authentication failure.** A daemon that drops the
connection on a malformed message turns one bug into a reconnect loop.

---

## The canonical Fake Heart

One Fake Heart, living here, imported by both sides — **not** a stub inside Brain and a different
one inside Heart.

The risk this addresses is not two developers drifting apart. It is one person in Brain-mode on a
Tuesday guessing what Heart's acknowledgement looks like, and that guess quietly not matching what
gets built into real Heart three weeks later.

It dials **out** to Brain, the way real Heart is specified to. It never listens for inbound.

Later it becomes the CI fixture rather than being thrown away.

---

## Run (with Bun)

```bash
bun install
bun test         # Runs unit tests and the TypeScript half of conformance
bun run typecheck
bun run sim      # Starts the canonical Fake Heart simulator
```

## Current state

See the vault's `STATUS.md` for the project's state; this covers only what is true inside this repo.

**Every protocol task on the board is implemented and tested (P0.1–P5.2).**
- Universal 10-field envelope format (`src/envelope/`)
- Isolated JSON wire codec with strict runtime validation (`src/codec/`)
- Topic registry — 26 topics, each bound to its payload type and its kind at compile time (`src/topics/registry.ts`, `TopicKind`)
- Runtime payload guards for the MCP topics and everything added since, in one table the codec reads (`PayloadGuards`). **The older topics — `sys.hello`, `voice.speak`, `nav.*`, `state.*`, `cap.manifest` — are still checked by their handlers, not by the codec.**
- Shared capability IDs for both manifest halves (`src/topics/capability.ts`)
- Teleop frames, deliberately not envelopes (`src/teleop/`, spec in `TELEOP.md`)
- Canonical Fake Heart: heartbeat watchdog, jittered backoff, receiver-side idempotency and expiry, navigation, its own reminder schedule, an in-memory outbox, invented sightings, and the robot's half of `cap.manifest` on connect and every 10 s (`src/simulator/fake-heart.ts`)
- 59 envelope vectors and 14 teleop vectors (`conformance/`) — both the TypeScript suite here and the Rust decoder tests in `miobots-heart/src/mio_gateway` read them
- `bun run bench` — what the JSON codec costs; measured on a laptop, not yet on the Pi
- `TEACHER.md` — a local study guide, gitignored

**Not here yet:** Brain does not send `sys.receipt`, so today the Fake Heart re-sends every unconfirmed event on each reconnect. Nothing deletes a region or a zone.

**Consumers must re-run `bun install` after any change here** — a `file:` dependency is linked as per-file symlinks at install time.

## Where the design lives

- `TEACHER.md` (local, gitignored) — a systems & TypeScript study guide for this protocol.
- `../../03 Engineering/Protocol/ENVELOPE.md` — **The full specification.** Message kinds, acknowledgement, idempotency, queuing, expiry, error handling, and worked examples.
- `../../03 Engineering/Protocol/TELEOP.md` — the phone-to-robot driving contract.

