# CONTEXT.md

> **This is the single source of truth for this repository.** When CONTEXT.md conflicts with any
> other document, CONTEXT.md is correct.

---

## System Intent

Server-side MQTT protocol codec and connection state machine for JavaScript and TypeScript runtimes.
Accepts connections from MQTT clients, parses bytes into typed packets, encodes packets into bytes,
and manages per-connection protocol state.

**Key capabilities:**

- Packet codec (all 15 MQTT packet types, 3.1.1 and 5.0)
- Server-side QoS 0/1/2 flow handling
- Keepalive tracking, topic aliases, receive maximum (5.0)
- Lifecycle hooks (`onConnect`, `onPublish`, `onSubscribe`, `onDisconnect`, etc.)
- Bun, Node.js, and Deno runtime support

**Scope:** Server-side protocol layer only; excludes TCP/WebSocket servers, message routing,
subscription storage, session persistence, will message publishing, and client-side functionality.

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

| Module                 | Purpose                                |
| ---------------------- | -------------------------------------- |
| `index.ts`             | Main entry point                       |
| `types.ts`             | Core primitives: DecodeResult, QoS     |
| `constants.ts`         | Packet types, property IDs, limits     |
| `codec/varint.ts`      | Variable byte integer codec (§2.2.3)   |
| `codec/utf8.ts`        | UTF-8 validation, MQTT strings         |
| `codec/reader.ts`      | Binary reader with bounds checking     |
| `codec/writer.ts`      | Binary writer, size calculator         |
| `codec/framing.ts`     | Stream framing, packet reassembly      |
| `topic.ts`             | Topic validation, matching, shared     |
| `wire.ts`              | MqttWire state machine, lifecycle      |
| `state/types.ts`       | Connection states, flow types, options |
| `state/packet-id.ts`   | Packet ID allocation and recycling     |
| `state/qos-flow.ts`    | QoS 1/2 flow tracking                  |
| `state/topic-alias.ts` | MQTT 5.0 topic alias management        |

### Directory Structure

| Directory   | Purpose                 |
| ----------- | ----------------------- |
| `bench/`    | Benchmarks with stats   |
| `examples/` | Runnable usage examples |
| `scripts/`  | Development utilities   |
| `src/`      | Source code             |

### Features

| Feature            | Status   | Notes                              |
| ------------------ | -------- | ---------------------------------- |
| Core primitives    | Complete | DecodeResult, QoS, types           |
| Protocol constants | Complete | Packet types, properties           |
| Variable byte int  | Complete | §2.2.3 test vectors pass           |
| UTF-8 validation   | Complete | §1.5.4 malformed rejected          |
| Binary reader      | Complete | Bounds-checked cursor              |
| Binary writer      | Complete | Auto-growing, size calc            |
| Stream framing     | Complete | Chunk-split tests pass             |
| Packet encoding    | Complete | All 15 packet types                |
| Packet decoding    | Complete | 5.0 properties, 3.1.1 compat       |
| QoS handling       | Complete | QoS 1/2 flow tracking via MqttWire |
| Keepalive          | Complete | 1.5x timeout, PINGREQ on idle      |
| Lifecycle hooks    | Complete | onConnect, onPublish, onSend, etc  |
| Topic aliases      | Complete | MQTT 5.0 bidirectional aliasing    |
| Packet ID alloc    | Complete | Sequential with wraparound         |
| Topic utilities    | Complete | Validation, matching, shared       |
| MqttWire class     | Complete | Connection state machine           |
| Session state      | Complete | Export/restore, onSessionLost hook |
| Will validation    | Complete | Topic and QoS validation           |
| Testing utilities  | Complete | Builders, generators, harness      |

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
15. **Server-only** — Library handles incoming client connections; no client-side functionality.
    MQTT client libraries already exist (mqtt.js, etc.)

---

## Open Decisions & Risks

### Open Decisions

| ID  | Question | Context |
| --- | -------- | ------- |

### Risks

| ID  | Risk                          | Impact                                           | Mitigation                                                             |
| --- | ----------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| R-1 | Spec ambiguity (3.1.1 vs 5.0) | Interop failures with edge-case clients          | Test against mosquitto CLI, mqtt.js, Paho clients; document deviations |
| R-2 | Partial packet at boundaries  | Data corruption or hangs if framing logic flawed | Extensive fast-check property tests with arbitrary chunk splits        |
| R-3 | Unbounded in-flight tracking  | Memory exhaustion under load                     | Enforce receive maximum; expose metrics; document backpressure         |
| R-4 | Malformed packet exploits     | DoS via crafted packets                          | fast-check mutation fuzzing; strict bounds checking in reader          |

---

## Work In Flight

> Claim before starting. Remove within 24h of completion.

| ID  | Agent | Started | Task | Files |
| --- | ----- | ------- | ---- | ----- |

---

## Work Queue

### Protocol Foundation ✓

- [x] Core primitives: DecodeResult, DecodeError, ProtocolVersion, QoS, ReasonCode
- [x] Constants: packet types (§2.1.2), property IDs (§2.2.2.2), reason codes (§2.4)
- [x] Variable-length integer codec (§2.2.3), UTF-8 validation (§1.5.4)
- [x] Binary reader/writer with bounds checking
- [x] Stream framing: chunk accumulation, partial packet handling

**Exit:** ✓ §2.2.3 test vectors pass; UTF-8 rejects malformed; chunk-split tests pass.

### Packet Codec ✓

- [x] Packet types as discriminated union; encode/decode all 15 packet types
- [x] All 5.0 properties; reason codes with 3.1.1 compat
- [x] Topic utilities: parse, match (+/#), validate, shared subscription parsing

**Exit:** ✓ Encode/decode symmetry; reject malformed; fast-check fuzzing passes; topic spec examples
work.

### State Machine ✓

- [x] Connection states, QoS 1/2 flows, keepalive (1.5x), packet ID recycling
- [x] Topic alias resolution, receive maximum flow control
- [x] MqttWire class: receive(), publish(), subscribe(), disconnect(), hooks, lifecycle
- [x] Session state persistence (for reconnect with cleanStart=false)
- [x] Will message handling

**Exit:** ✓ Unit tests pass; session export/restore working; will validation enforced.

### Infrastructure

- [x] `mqtt-wire/testing` subpath: test harness, packet builder, fuzzer, fixtures
- [x] Examples: Bun/Node/Deno TCP, WebSocket
- [x] Conformance CI against MQTT clients (mosquitto CLI, mqtt.js)
- [ ] TypeDoc, benchmark suite

**Exit:** Subpath imports work; conformance blocks merge on failure; docs generate.

### Server-Side Refactor ✓

- [x] Refactor `MqttWire` class from client-side to server-side (receives CONNECT, sends CONNACK)
- [x] Remove client-only methods (`connect()`, `subscribe()`, `unsubscribe()`)
- [x] Add server hooks: `onConnect` receives ConnectPacket, returns ConnackPacket
- [x] Update tests for server-side behaviour
- [x] Update exports and documentation

**Exit:** ✓ MqttWire handles incoming client connections; no client-initiating code remains.

---

## Learnings

> Append-only. Never edit or delete existing entries.

| Date       | Learning                                                                        |
| ---------- | ------------------------------------------------------------------------------- |
| 2025-07-16 | StreamFramer.push() must preserve unconsumed buffer data when new chunks arrive |
| 2026-03-03 | MqttWire setInterval keepalive must use void/catch pattern, not async callback  |
| 2026-03-05 | Library is server-only; MqttWire was incorrectly designed as client-side        |
| 2026-03-05 | Server-side MqttWire: hooks return response packets (onConnect→ConnackPacket)   |
| 2026-03-05 | Conformance tests use TestServer (real TCP) + mqtt.js client + mosquitto CLI    |
