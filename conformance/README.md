# Conformance Vectors

Canonical protocol envelope test vectors for cross-language parity between TypeScript and Rust.
Adding a field, changing a type, or tightening validation means adding a vector.

`teleop.json` holds the teleop frame vectors ([TELEOP.md](../../../03%20Engineering/Protocol/TELEOP.md)). They are frames, not envelopes, and the same rule applies.

`outbox.json` says which messages wait in a durable outbox when the link is down ([ENVELOPE.md](../../../03%20Engineering/Protocol/ENVELOPE.md) §5): every `EVT` except the ones re-sent anyway, and nothing else. `queuesInOutbox` and the Rust gateway both test against it, and the TypeScript test fails if a new `EVT` topic has no case — so every new event has to decide whether it waits.
