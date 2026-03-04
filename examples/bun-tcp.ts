/**
 * Bun TCP server example.
 *
 * Demonstrates accepting MQTT client connections over TCP using Bun's native
 * socket API with mqtt-wire handling the protocol codec.
 *
 * @example
 * ```bash
 * # Run this server
 * bun run examples/bun-tcp.ts
 *
 * # Then connect with any MQTT client
 * mosquitto_pub -h localhost -p 1883 -t test/hello -m "Hello"
 * mosquitto_sub -h localhost -p 1883 -t test/#
 * ```
 */

/* eslint-disable no-console */

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
} from "../src/index.js"
import type { ProtocolVersion } from "../src/types.js"

const PORT = Number(process.env.MQTT_PORT ?? 1883)

/**
 * Per-connection state.
 */
type ClientConnection = {
  clientId: string
  protocolVersion: ProtocolVersion
  framer: StreamFramer
  subscriptions: Set<string>
}

const clients = new Map<object, ClientConnection>()

/**
 * Handle decoded MQTT packet from client.
 */
function handlePacket(
  packet: MqttPacket,
  conn: ClientConnection,
  send: (data: Uint8Array) => void
): void {
  switch (packet.type) {
    case PacketType.CONNECT:
      handleConnect(packet, conn, send)
      break

    case PacketType.PUBLISH:
      handlePublish(packet, conn, send)
      break

    case PacketType.SUBSCRIBE:
      handleSubscribe(packet, conn, send)
      break

    case PacketType.PINGREQ:
      // Respond with PINGRESP
      send(encodePacket({ type: PacketType.PINGRESP }, conn.protocolVersion))
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

function handleConnect(
  packet: ConnectPacket,
  conn: ClientConnection,
  send: (data: Uint8Array) => void
): void {
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

  send(encodePacket(connack, conn.protocolVersion))
  console.log(`[${conn.clientId}] CONNACK sent`)
}

function handlePublish(
  packet: PublishPacket,
  conn: ClientConnection,
  send: (data: Uint8Array) => void
): void {
  const payload = new TextDecoder().decode(packet.payload)
  console.log(`[${conn.clientId}] PUBLISH: [${packet.topic}] ${payload}`)

  // Send PUBACK for QoS 1
  if (packet.qos === 1 && packet.packetId !== undefined) {
    const puback: PubackPacket = {
      type: PacketType.PUBACK,
      packetId: packet.packetId
    }
    send(encodePacket(puback, conn.protocolVersion))
  }

  // TODO: Route message to subscribers
}

function handleSubscribe(
  packet: SubscribePacket,
  conn: ClientConnection,
  send: (data: Uint8Array) => void
): void {
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
  send(encodePacket(suback, conn.protocolVersion))
  console.log(`[${conn.clientId}] SUBACK sent`)
}

function handleDisconnect(packet: DisconnectPacket, conn: ClientConnection): void {
  console.log(`[${conn.clientId}] DISCONNECT`, {
    reasonCode: packet.reasonCode
  })
}

// Start TCP server using Bun
console.log(`Starting MQTT server on port ${String(PORT)}...`)

Bun.listen({
  hostname: "0.0.0.0",
  port: PORT,
  socket: {
    open(socket) {
      const conn: ClientConnection = {
        clientId: "(unknown)",
        protocolVersion: "5.0",
        framer: new StreamFramer(),
        subscriptions: new Set()
      }
      clients.set(socket, conn)
      console.log("Client connected")
    },

    data(socket, data) {
      const conn = clients.get(socket)
      if (!conn) {
        return
      }

      conn.framer.push(data)

      // Process complete packets
      for (
        let frame = conn.framer.read();
        frame.status !== "incomplete";
        frame = conn.framer.read()
      ) {
        if (frame.status === "error") {
          console.error(`[${conn.clientId}] Frame error:`, frame.error.message)
          socket.end()
          break
        }

        const result = decodePacket(frame.packetData, conn.protocolVersion)
        if (!result.ok) {
          console.error(`[${conn.clientId}] Decode error:`, result.error.message)
          continue
        }

        handlePacket(result.value.packet, conn, (d) => socket.write(d))
      }
    },

    close(socket) {
      const conn = clients.get(socket)
      if (conn) {
        console.log(`[${conn.clientId}] Disconnected`)
        clients.delete(socket)
      }
    },

    error(socket, err) {
      const conn = clients.get(socket)
      console.error(`[${conn?.clientId ?? "unknown"}] Socket error:`, err)
    }
  }
})

console.log(`MQTT server listening on port ${String(PORT)}`)
console.log("Test with: mosquitto_pub -t test/hello -m 'Hello World'")
