# Examples

Runnable examples demonstrating mqtt-wire usage. Server examples accept MQTT client connections;
codec examples run standalone.

## Prerequisites

Connect to a running server with any MQTT client:

```bash
# Install Mosquitto clients
brew install mosquitto   # macOS
sudo apt install mosquitto-clients   # Ubuntu/Debian

# Publish a message
mosquitto_pub -h localhost -p 1883 -t test/hello -m "Hello World"

# Subscribe to messages
mosquitto_sub -h localhost -p 1883 -t test/#
```

## Environment Variables

| Variable       | Default | Description           |
| -------------- | ------- | --------------------- |
| `MQTT_PORT`    | `1883`  | TCP server port       |
| `MQTT_WS_PORT` | `9001`  | WebSocket server port |

## Running Examples

### TCP Servers

```bash
# Bun TCP server (port 1883)
bun run examples/bun-tcp.ts

# Node.js TCP server (port 1883)
npx tsx examples/node-tcp.ts

# Deno TCP server (port 1883)
deno run --allow-net --allow-env examples/deno-tcp.ts
```

### WebSocket Server

```bash
bun run examples/websocket.ts
```

### Codec Examples

```bash
bun run examples/basic-usage.ts
bun run examples/error-handling.ts
```

## Example Files

| File                                       | Description                           |
| ------------------------------------------ | ------------------------------------- |
| [basic-usage.ts](basic-usage.ts)           | Codec utilities demo                  |
| [error-handling.ts](error-handling.ts)     | Input validation and error handling   |
| [batch-processing.ts](batch-processing.ts) | Processing multiple items             |
| [bun-tcp.ts](bun-tcp.ts)                   | Bun TCP server accepting MQTT clients |
| [node-tcp.ts](node-tcp.ts)                 | Node.js TCP server                    |
| [deno-tcp.ts](deno-tcp.ts)                 | Deno TCP server                       |
| [websocket.ts](websocket.ts)               | Bun WebSocket server                  |
