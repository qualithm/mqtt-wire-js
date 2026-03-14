# CONTEXT.md

> **Single source of truth.** CONTEXT.md > Code > README > Comments.

---

## System Intent

Server-side MQTT protocol codec and connection state machine for JavaScript and TypeScript runtimes.
Implements the MQTT 3.1.1 and 5.0 binary protocols for accepting client connections, encoding and
decoding all 15 packet types, and managing per-connection protocol state.

**Key capabilities:**

- Packet codec (all 15 MQTT packet types, 3.1.1 and 5.0)
- Server-side QoS 0/1/2 flow handling
- Keepalive tracking, topic aliases, receive maximum (5.0)
- Lifecycle hooks (`onConnect`, `onPublish`, `onSubscribe`, `onUnsubscribe`, `onDisconnect`,
  `onSend`, `onError`)
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

| Module                  | Purpose                                |
| ----------------------- | -------------------------------------- |
| `index.ts`              | Main entry point                       |
| `types.ts`              | Core primitives: DecodeResult, QoS     |
| `constants.ts`          | Packet types, property IDs, limits     |
| `codec/varint.ts`       | Variable byte integer codec (§2.2.3)   |
| `codec/utf8.ts`         | UTF-8 validation, MQTT strings         |
| `codec/reader.ts`       | Binary reader with bounds checking     |
| `codec/writer.ts`       | Binary writer, size calculator         |
| `codec/framing.ts`      | Stream framing, packet reassembly      |
| `packets/types.ts`      | Packet type definitions (all 15 types) |
| `packets/encode.ts`     | Packet encoding                        |
| `packets/decode.ts`     | Packet decoding                        |
| `packets/properties.ts` | MQTT 5.0 property codec                |
| `topic.ts`              | Topic validation, matching, shared     |
| `wire.ts`               | MqttWire state machine, lifecycle      |
| `state/types.ts`        | Connection states, flow types, options |
| `state/packet-id.ts`    | Packet ID allocation and recycling     |
| `state/qos-flow.ts`     | QoS 1/2 flow tracking                  |
| `state/topic-alias.ts`  | MQTT 5.0 topic alias management        |
| `testing/builders.ts`   | Packet builder utilities               |
| `testing/fixtures.ts`   | Test fixture data                      |
| `testing/generators.ts` | fast-check generators                  |
| `testing/harness.ts`    | MqttWire test harness                  |

### Features

| Feature            | Notes                                                                           |
| ------------------ | ------------------------------------------------------------------------------- |
| Core primitives    | DecodeResult, QoS, types                                                        |
| Protocol constants | Packet types, properties                                                        |
| Variable byte int  | §2.2.3 test vectors pass                                                        |
| UTF-8 validation   | §1.5.4 malformed rejected                                                       |
| Binary reader      | Bounds-checked cursor                                                           |
| Binary writer      | Auto-growing, size calc                                                         |
| Stream framing     | Chunk-split tests pass                                                          |
| Packet encoding    | All 15 packet types                                                             |
| Packet decoding    | 5.0 properties, 3.1.1 compat                                                    |
| QoS handling       | QoS 1/2 flow tracking via MqttWire                                              |
| Keepalive          | 1.5x timeout, PINGREQ on idle                                                   |
| Lifecycle hooks    | onConnect, onPublish, onSubscribe, onUnsubscribe, onDisconnect, onSend, onError |
| Topic aliases      | MQTT 5.0 bidirectional aliasing                                                 |
| Packet ID alloc    | Sequential with wraparound                                                      |
| Topic utilities    | Validation, matching, shared                                                    |
| MqttWire class     | Connection state machine                                                        |
| Will messages      | Encode/decode in CONNECT packets                                                |
| Testing utilities  | Builders, generators, harness                                                   |

### File Structure

| Directory   | Purpose                 |
| ----------- | ----------------------- |
| `bench/`    | Benchmarks with stats   |
| `examples/` | Runnable usage examples |
| `scripts/`  | Development utilities   |
| `src/`      | Source code             |

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

| ID  | Risk                          | Impact | Mitigation                                                             |
| --- | ----------------------------- | ------ | ---------------------------------------------------------------------- |
| R-1 | Spec ambiguity (3.1.1 vs 5.0) | Medium | Test against mosquitto CLI, mqtt.js, Paho clients; document deviations |
| R-2 | Partial packet at boundaries  | High   | Extensive fast-check property tests with arbitrary chunk splits        |
| R-3 | Unbounded in-flight tracking  | Medium | Enforce receive maximum; expose metrics; document backpressure         |
| R-4 | Malformed packet exploits     | High   | fast-check mutation fuzzing; strict bounds checking in reader          |

---

## Work In Flight

> Claim work before starting. Include start timestamp. Remove within 24 hours of completion.

| ID  | Agent | Started | Task | Files |
| --- | ----- | ------- | ---- | ----- |

---

## Work Queue
