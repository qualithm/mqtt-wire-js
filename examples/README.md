# Examples

This directory contains runnable examples demonstrating mqtt-wire as a **server-side** protocol
handler. MQTT clients connect to these servers.

## Running Server Examples

### TCP Servers

Start an MQTT server that accepts client connections:

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
# Bun WebSocket server (port 9001)
bun run examples/websocket.ts
```

## Testing the Servers

Once a server is running, connect with any MQTT client:

```bash
# Install Mosquitto clients
brew install mosquitto   # macOS
sudo apt install mosquitto-clients   # Ubuntu/Debian

# Publish a message
mosquitto_pub -h localhost -p 1883 -t test/hello -m "Hello World"

# Subscribe to messages
mosquitto_sub -h localhost -p 1883 -t test/#
```

## Codec Examples

Low-level codec utilities (no network required):

```bash
# Basic codec usage
bun run examples/basic-usage.ts

# Error handling
bun run examples/error-handling.ts
```

## Environment Variables

| Variable       | Default | Description           |
| -------------- | ------- | --------------------- |
| `MQTT_PORT`    | `1883`  | TCP server port       |
| `MQTT_WS_PORT` | `9001`  | WebSocket server port |

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
