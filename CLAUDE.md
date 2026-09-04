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
bun test         # Runs full unit and cross-language conformance test suites
bun run typecheck
bun run sim      # Starts the canonical Fake Heart simulator
```

## Current state

**Fully implemented & tested.**
- Universal 10-field envelope format (`src/envelope/`)
- Isolated JSON wire codec with strict runtime validation (`src/codec/`)
- Topics registry for `sys.*` and `voice.*` (`src/topics/`)
- Canonical Fake Heart simulator with heartbeat watchdog & jittered backoff (`src/simulator/fake-heart.ts`)
- 31 cross-language conformance test vectors (`conformance/`)
- Exhaustive masterclass learning guide in `TEACHER.md`

## Where the design lives

- `TEACHER.md` — **The ultimate systems & TypeScript masterclass for this protocol.**
- `../../03 Engineering/Protocol/ENVELOPE.md` — **The full specification.** Message kinds, acknowledgement, idempotency, queuing, expiry, error handling, and worked examples.

