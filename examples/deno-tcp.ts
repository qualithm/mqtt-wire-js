/**
 * Deno TCP server example.
 *
 * Demonstrates accepting MQTT client connections over TCP using Deno's native
 * network API with mqtt-wire handling the protocol codec.
 *
 * @example
 * ```bash
 * # Run this server
 * deno run --allow-net --allow-env examples/deno-tcp.ts
 *
 * # Then connect with any MQTT client
 * mosquitto_pub -h localhost -p 1883 -t test/hello -m "Hello"
 * mosquitto_sub -h localhost -p 1883 -t test/#
 * ```
 */

/* eslint-disable no-console */

// Deno global type declarations (this file runs in Deno only)
declare const Deno: {
  env: { get: (key: string) => string | undefined }
  listen: (options: { hostname: string; port: number }) => {
    [Symbol.asyncIterator]: () => AsyncIterableIterator<{
      read: (buffer: Uint8Array) => Promise<number | null>
      write: (data: Uint8Array) => Promise<number>
      close: () => void
    }>
  }
  errors: { BadResource: new () => Error }
}

import {
  type ConnackPacket,
  type ConnectPacket,
  decodePacket,
  type DisconnectPacket,
  encodePacket,
  type MqttPacket,
  PacketType,
  type PubackPacket,
  type PublishPacket,
  StreamFramer,
  type SubackPacket,
  type SubscribePacket
} from "../src/index.ts"
import type { ProtocolVersion } from "../src/types.ts"

const PORT = Number(Deno.env.get("MQTT_PORT") ?? 1883)

/**
 * Per-connection state.
 */
type ClientConnection = {
  clientId: string
  protocolVersion: ProtocolVersion
  framer: StreamFramer
  subscriptions: Set<string>
}

/**
 * Handle decoded MQTT packet from client.
 */
function handlePacket(
  packet: MqttPacket,
  conn: ClientConnection,
  send: (data: Uint8Array) => Promise<void>
): void {
  switch (packet.type) {
    case PacketType.CONNECT:
      void handleConnect(packet, conn, send)
      break

    case PacketType.PUBLISH:
      void handlePublish(packet, conn, send)
      break

    case PacketType.SUBSCRIBE:
      void handleSubscribe(packet, conn, send)
      break

    case PacketType.PINGREQ:
      // Respond with PINGRESP
      void send(encodePacket({ type: PacketType.PINGRESP }, conn.protocolVersion))
      break

    case PacketType.DISCONNECT:
      handleDisconnect(packet, conn)
      break

    case PacketType.CONNACK:
    case PacketType.PUBACK:
    case PacketType.PUBREC:
    case PacketType.PUBREL:
    case PacketType.PUBCOMP:
    case PacketType.SUBACK:
    case PacketType.UNSUBACK:
    case PacketType.PINGRESP:
    case PacketType.AUTH:
    case PacketType.UNSUBSCRIBE:
      // Server should not receive these packet types from clients
      console.log(`[${conn.clientId}] Unexpected packet type: ${String(packet.type)}`)
      break
  }
}

async function handleConnect(
  packet: ConnectPacket,
  conn: ClientConnection,
  send: (data: Uint8Array) => Promise<void>
): Promise<void> {
  conn.clientId = packet.clientId || `server-assigned-${String(Date.now())}`
  conn.protocolVersion = packet.protocolVersion

  console.log(`[${conn.clientId}] CONNECT received`, {
    protocolVersion: packet.protocolVersion,
    cleanStart: packet.cleanStart,
    keepAlive: packet.keepAlive
  })

  // Send CONNACK
  const connack: ConnackPacket = {
    type: PacketType.CONNACK,
    sessionPresent: false,
    reasonCode: 0x00, // Success
    properties:
      conn.protocolVersion === "5.0"
        ? {
            assignedClientIdentifier: packet.clientId ? undefined : conn.clientId
          }
        : undefined
  }

  await send(encodePacket(connack, conn.protocolVersion))
  console.log(`[${conn.clientId}] CONNACK sent`)
}

async function handlePublish(
  packet: PublishPacket,
  conn: ClientConnection,
  send: (data: Uint8Array) => Promise<void>
): Promise<void> {
  const payload = new TextDecoder().decode(packet.payload)
  console.log(`[${conn.clientId}] PUBLISH: [${packet.topic}] ${payload}`)

  // Send PUBACK for QoS 1
  if (packet.qos === 1 && packet.packetId !== undefined) {
    const puback: PubackPacket = {
      type: PacketType.PUBACK,
      packetId: packet.packetId
    }
    await send(encodePacket(puback, conn.protocolVersion))
  }

  // TODO: Route message to subscribers
}

async function handleSubscribe(
  packet: SubscribePacket,
  conn: ClientConnection,
  send: (data: Uint8Array) => Promise<void>
): Promise<void> {
  const filters = packet.subscriptions.map((s) => s.topicFilter)
  console.log(`[${conn.clientId}] SUBSCRIBE:`, filters)

  // Track subscriptions
  for (const sub of packet.subscriptions) {
    conn.subscriptions.add(sub.topicFilter)
  }

  // Send SUBACK
  const suback: SubackPacket = {
    type: PacketType.SUBACK,
    packetId: packet.packetId,
    reasonCodes: packet.subscriptions.map((s) => s.options.qos) // Grant requested QoS
  }
  await send(encodePacket(suback, conn.protocolVersion))
  console.log(`[${conn.clientId}] SUBACK sent`)
}

function handleDisconnect(packet: DisconnectPacket, conn: ClientConnection): void {
  console.log(`[${conn.clientId}] DISCONNECT`, {
    reasonCode: packet.reasonCode
  })
}

// Handle a single client connection
async function handleClient(socket: {
  read: (buffer: Uint8Array) => Promise<number | null>
  write: (data: Uint8Array) => Promise<number>
  close: () => void
}): Promise<void> {
  const conn: ClientConnection = {
    clientId: "(unknown)",
    protocolVersion: "5.0",
    framer: new StreamFramer(),
    subscriptions: new Set()
  }

  const send = async (data: Uint8Array): Promise<void> => {
    await socket.write(data)
  }

  console.log("Client connected")

  const buffer = new Uint8Array(4096)
  try {
    let bytesRead = await socket.read(buffer)
    while (bytesRead !== null) {
      conn.framer.push(buffer.subarray(0, bytesRead))

      // Process complete packets
      for (
        let frame = conn.framer.read();
        frame.status !== "incomplete";
        frame = conn.framer.read()
      ) {
        if (frame.status === "error") {
          console.error(`[${conn.clientId}] Frame error:`, frame.error.message)
          socket.close()
          return
        }

        const result = decodePacket(frame.packetData, conn.protocolVersion)
        if (!result.ok) {
          console.error(`[${conn.clientId}] Decode error:`, result.error.message)
          continue
        }

        handlePacket(result.value.packet, conn, send)
      }

      bytesRead = await socket.read(buffer)
    }
  } catch (err: unknown) {
    if (!(err instanceof Deno.errors.BadResource)) {
      console.error(`[${conn.clientId}] Read error:`, err)
    }
  }

  console.log(`[${conn.clientId}] Disconnected`)
}

// Start TCP server using Deno
console.log(`Starting MQTT server on port ${String(PORT)}...`)

const listener = Deno.listen({ hostname: "0.0.0.0", port: PORT })
console.log(`MQTT server listening on port ${String(PORT)}`)
console.log("Test with: mosquitto_pub -t test/hello -m 'Hello World'")

for await (const conn of listener) {
  // Handle each connection concurrently
  handleClient(conn).catch((err: unknown) => {
    console.error("Connection handler error:", err)
  })
}
