# MQTT Wire

[![CI](https://github.com/qualithm/mqtt-wire-js/actions/workflows/ci.yaml/badge.svg)](https://github.com/qualithm/mqtt-wire-js/actions/workflows/ci.yaml)
[![codecov](https://codecov.io/gh/qualithm/mqtt-wire-js/graph/badge.svg)](https://codecov.io/gh/qualithm/mqtt-wire-js)
[![npm](https://img.shields.io/npm/v/@qualithm/mqtt-wire)](https://www.npmjs.com/package/@qualithm/mqtt-wire)

Server-side MQTT protocol codec and connection state machine for JavaScript and TypeScript runtimes.
Accepts connections from MQTT clients, parses bytes into typed packets, encodes packets into bytes,
and manages per-connection protocol state.

## Features

- **MqttWire** — Connection state machine with lifecycle hooks for CONNECT, PUBLISH, SUBSCRIBE, etc.
- **Protocol Support** — MQTT 3.1.1 and 5.0 with full packet type coverage
- **Codec Utilities** — BinaryReader, BinaryWriter, StreamFramer for low-level protocol handling
- **QoS Tracking** — QoSFlowTracker and PacketIdAllocator for reliable message delivery
- **Topic Aliases** — TopicAliasManager for MQTT 5.0 topic alias negotiation
- **Multi-runtime** — Works with Bun, Node.js 20+, and Deno

## Installation

```bash
bun add @qualithm/mqtt-wire
# or
npm install @qualithm/mqtt-wire
```

## Quick Start

### TCP Server (Node.js)

```ts
import * as net from "node:net"
import { MqttWire, PacketType } from "@qualithm/mqtt-wire"

const server = net.createServer((socket) => {
  const wire = new MqttWire({
    onSend: (data) => socket.write(data),

    onConnect: (connect) => {
      console.log(`Client connected: ${connect.clientId}`)
      return {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      }
    },

    onPublish: (packet) => {
      const payload = new TextDecoder().decode(packet.payload)
      console.log(`[${packet.topic}] ${payload}`)
    },

    onSubscribe: (packet) => ({
      type: PacketType.SUBACK,
      packetId: packet.packetId,
      reasonCodes: packet.subscriptions.map((s) => s.options.qos)
    }),

    onDisconnect: () => console.log("Client disconnected")
  })

  socket.on("data", (chunk) => wire.receive(chunk))
  socket.on("close", () => wire.close())
})

server.listen(1883, () => console.log("MQTT server on port 1883"))
```

### Low-Level Codec

```ts
import {
  BinaryReader,
  BinaryWriter,
  decodeVariableByteInteger,
  encodeVariableByteIntegerToArray
} from "@qualithm/mqtt-wire"

// Encode a variable byte integer
const encoded = encodeVariableByteIntegerToArray(16384)
console.log(encoded) // Uint8Array [0x80, 0x80, 0x01]

// Decode it back
const decoded = decodeVariableByteInteger(encoded, 0)
if (decoded.ok) {
  console.log(decoded.value.value) // 16384
}

// Build a packet manually
const writer = new BinaryWriter()
writer
  .writeUint8(0x10) // CONNECT packet type
  .writeVariableByteInteger(12) // Remaining length
  .writeMqttString("MQTT") // Protocol name
  .writeUint8(5) // Protocol version

const packet = writer.toUint8Array()
```

## Error Handling

MqttWire uses lifecycle hooks for error reporting — `receive()` does not throw protocol errors.

```ts
import { MqttWire, ProtocolError, StateError, type DecodeResult } from "@qualithm/mqtt-wire"

// Protocol errors from receive() are reported via the onError hook
const wire = new MqttWire({
  onSend: (data) => socket.write(data),
  onConnect: (connect) => ({
    /* ... */
  }),

  onError: (error) => {
    // error is a ProtocolError with an MQTT reason code
    console.error(`protocol error: ${error.message}`, {
      reasonCode: error.reasonCode
    })
    socket.destroy()
  }
})

// receive() handles protocol errors internally; guard against unexpected failures
socket.on("data", (chunk) => {
  wire.receive(chunk).catch((err) => {
    console.error("unexpected receive error", err)
    socket.destroy()
  })
})

// StateError is thrown by outbound methods when called in the wrong state
try {
  await wire.publish("topic", payload)
} catch (error) {
  if (error instanceof StateError) {
    console.error(`state error: ${error.message}`, { state: error.state })
  }
}

// Codec functions return Result types (no exceptions)
const result: DecodeResult<number> = decodeVariableByteInteger(data, 0)
if (result.ok) {
  console.log(result.value)
} else {
  console.error(`[${result.error.code}] ${result.error.message}`)
}
```

## API Documentation

Full API documentation is available in the [docs](docs/) directory. Generate locally with:

```bash
bun run docs
```

## Examples

See the [examples](examples/) directory for runnable examples:

- [node-tcp.ts](examples/node-tcp.ts) — Node.js TCP server
- [bun-tcp.ts](examples/bun-tcp.ts) — Bun TCP server
- [deno-tcp.ts](examples/deno-tcp.ts) — Deno TCP server
- [websocket.ts](examples/websocket.ts) — WebSocket server
- [basic-usage.ts](examples/basic-usage.ts) — Low-level codec utilities
- [error-handling.ts](examples/error-handling.ts) — Result type patterns

## Development

### Prerequisites

- [Bun](https://bun.sh/) (recommended), Node.js 20+, or [Deno](https://deno.land/)

### Setup

```bash
bun install
```

### Building

```bash
bun run build
```

### Testing

```bash
bun test
```

### Linting & Formatting

```bash
bun run lint
bun run format
bun run typecheck
```

### Benchmarks

```bash
bun run bench
```

## Publishing

The package is automatically published to NPM when CI passes on main. Update the version in
`package.json` before merging to trigger a new release.

## Licence

Apache-2.0
