# CONTEXT.md

> **This is the single source of truth for this repository.** When CONTEXT.md conflicts with any
> other document, CONTEXT.md is correct.

---

## System Intent

MQTT protocol codec and connection state machine for JavaScript and TypeScript runtimes. Parses
bytes into typed packets, encodes packets into bytes, and manages per-connection protocol state.

**Key capabilities:**

- Packet codec (all 15 MQTT packet types, 3.1.1 and 5.0)
- QoS 0/1/2 flows (PUBACK, PUBREC/PUBREL/PUBCOMP)
- Keepalive tracking, topic aliases, receive maximum (5.0)
- Lifecycle hooks (`onConnect`, `onPublish`, `onSubscribe`, `onDisconnect`, etc.)
- Bun, Node.js, and Deno runtime support

**Scope:** Protocol layer only; excludes TCP/WebSocket servers, message routing, subscription
storage, session persistence, and will message publishing.

---

## Current Reality

### Architecture

| Component | Technology             |
| --------- | ---------------------- |
| Language  | TypeScript (ESM-only)  |
| Runtime   | Bun, Node.js 20+, Deno |
| Build     | TypeScript compiler    |
| Test      | Vitest                 |
| Lint      | ESLint, Prettier       |
| Docs      | TypeDoc                |

### Modules

| Module     | Purpose          |
| ---------- | ---------------- |
| `index.ts` | Main entry point |
| `greet.ts` | Greeting utility |

### Directory Structure

| Directory   | Purpose                 |
| ----------- | ----------------------- |
| `bench/`    | Benchmarks with stats   |
| `examples/` | Runnable usage examples |
| `scripts/`  | Development utilities   |
| `src/`      | Source code             |

### Features

| Feature           | Status      | Notes                       |
| ----------------- | ----------- | --------------------------- |
| Packet encoding   | Not started | —                           |
| Packet decoding   | Not started | —                           |
| QoS handling      | Not started | —                           |
| Keepalive         | Not started | —                           |
| Lifecycle hooks   | Not started | —                           |
| Topic utilities   | Not started | —                           |
| Testing utilities | Not started | Subpath `mqtt-wire/testing` |

---

## Locked Decisions

1. **Runtime-agnostic** — No TCP server; runtime provides bytes in/out via `receive()`, `onSend()`
2. **Transport-agnostic** — Works over TCP, WebSocket, anything that delivers ordered bytes
3. **MQTT 3.1.1 + 5.0** — Both versions supported, negotiated at connect time
4. **Self-contained testing** — `mqtt-wire/testing` subpath export, not separate package
5. **No runtime adapters** — Examples only; adapter wiring is trivial, no abstraction value
6. **Hooks not events** — Lifecycle hooks (`onConnect`, `onPublish`, etc.) over EventEmitter
7. **Zero runtime deps** — Bundle size, supply chain risk
8. **Uint8Array only** — No `Buffer` in public API; `Buffer` is a subclass so Node callers pass it
   directly, but return types and internal code use `Uint8Array` exclusively
9. **Result types for decoding** — Decode functions return
   `DecodeResult<T> = { ok: true, value: T } | { ok: false, error: DecodeError }`; no exceptions in
   hot paths
10. **Library manages packet IDs** — Outbound packet ID assignment handled internally; sequential
    allocation with wraparound at 65535, freed IDs reused after acknowledgment
11. **Strict spec compliance, fail closed** — Reject invalid UTF-8, enforce packet size limits,
    validate client IDs per spec; when spec is unclear or packets are borderline invalid, reject
    rather than guess; log with spec section reference; no "permissive mode"
12. **Property-based testing** — Use fast-check for arbitrary chunk splits, random packet mutations,
    and mutation-based fuzzing
13. **Spec-linked tests** — Tests tagged with `[§x.x.x]` spec section references; `.spec.ts` files
    for compliance tests, `.test.ts` for unit tests
14. **Spec compliance via fixtures** — Test against packet examples from MQTT 3.1.1 and 5.0 specs
    (§3.x hex examples); supplement with edge-case corpus (max sizes, all property types, malformed
    inputs); no broker matrix required

---

## Open Decisions & Risks

### Open Decisions

| ID  | Question | Context |
| --- | -------- | ------- |

### Risks

| ID  | Risk                          | Impact                                           | Mitigation                                                      |
| --- | ----------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| R-1 | Spec ambiguity (3.1.1 vs 5.0) | Interop failures with edge-case brokers          | Test against Mosquitto, EMQX, HiveMQ; document deviations       |
| R-2 | Partial packet at boundaries  | Data corruption or hangs if framing logic flawed | Extensive fast-check property tests with arbitrary chunk splits |
| R-3 | Unbounded in-flight tracking  | Memory exhaustion under load                     | Enforce receive maximum; expose metrics; document backpressure  |
| R-4 | Malformed packet exploits     | DoS via crafted packets                          | fast-check mutation fuzzing; strict bounds checking in reader   |

---

## Work In Flight

> Claim before starting. Remove within 24h of completion.

| ID  | Agent | Started | Task | Files |
| --- | ----- | ------- | ---- | ----- |

---

## Work Queue

### Protocol Foundation

- [ ] Core primitives: DecodeResult, DecodeError, ProtocolVersion, QoS, ReasonCode
- [ ] Constants: packet types (§2.1.2), property IDs (§2.2.2.2), reason codes (§2.4)
- [ ] Variable-length integer codec (§2.2.3), UTF-8 validation (§1.5.4)
- [ ] Binary reader/writer with bounds checking
- [ ] Stream framing: chunk accumulation, partial packet handling

**Exit:** §2.2.3 test vectors pass; UTF-8 rejects malformed; chunk-split property tests pass.

### Packet Codec

- [ ] Packet types as discriminated union; encode/decode all 15 packet types
- [ ] All 5.0 properties; reason codes with 3.1.1 compat
- [ ] Topic utilities: parse, match (+/#), validate, shared subscription parsing

**Exit:** Encode/decode symmetry; reject malformed; fast-check fuzzing passes; topic spec examples
work.

### State Machine

- [ ] Connection states, QoS 1/2 flows, keepalive (1.5x), packet ID recycling
- [ ] Topic alias resolution, receive maximum flow control
- [ ] Session state, will message handling, subscription options
- [ ] MqttWire class: receive(), deliver(), disconnect(), hooks, lifecycle

**Exit:** Full connect→disconnect sequence works; QoS 2 transitions correct; passes Mosquitto/EMQX.

### Infrastructure

- [ ] `mqtt-wire/testing` subpath: test harness, packet builder, fuzzer, fixtures
- [ ] Examples: Bun/Node/Deno TCP, WebSocket
- [ ] Conformance CI against Mosquitto 2.x, EMQX 5.x
- [ ] TypeDoc, benchmark suite

**Exit:** Subpath imports work; conformance blocks merge on failure; docs generate.

---

## Learnings

> Append-only. Never edit or delete existing entries.

| Date | Learning |
| ---- | -------- |
