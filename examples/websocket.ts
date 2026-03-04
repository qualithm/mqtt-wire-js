/**
 * Bun WebSocket server example.
 *
 * Demonstrates accepting MQTT client connections over WebSocket using Bun's
 * built-in HTTP/WebSocket server with mqtt-wire handling the protocol codec.
 *
 * @example
 * ```bash
 * # Run this server
 * bun run examples/websocket.ts
 *
 * # Then connect with any MQTT WebSocket client
 * # Browser clients or tools like MQTT Explorer with WebSocket support
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

const PORT = Number(process.env.MQTT_WS_PORT ?? 9001)

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

// Start WebSocket server using Bun
console.log(`Starting MQTT WebSocket server on port ${String(PORT)}...`)

Bun.serve<ClientConnection>({
  port: PORT,
  fetch(req, server) {
    // Check for WebSocket upgrade with 'mqtt' subprotocol
    const protocols = req.headers.get("Sec-WebSocket-Protocol")
    if (protocols?.includes("mqtt") === true) {
      const conn: ClientConnection = {
        clientId: "(unknown)",
        protocolVersion: "5.0",
        framer: new StreamFramer(),
        subscriptions: new Set()
      }
      const success = server.upgrade(req, { data: conn })
      if (success) {
        return undefined
      }
    }

    // Not a WebSocket request or upgrade failed
    return new Response("MQTT WebSocket Server - Connect with mqtt:// subprotocol", {
      status: 200
    })
  },
  websocket: {
    open(_ws) {
      console.log("WebSocket client connected")
    },

    message(ws, message) {
      const conn = ws.data
      const data =
        message instanceof ArrayBuffer ? new Uint8Array(message) : (message as Uint8Array)

      conn.framer.push(data)

      // Process complete packets
      for (
        let frame = conn.framer.read();
        frame.status !== "incomplete";
        frame = conn.framer.read()
      ) {
        if (frame.status === "error") {
          console.error(`[${conn.clientId}] Frame error:`, frame.error.message)
          ws.close()
          break
        }

        const result = decodePacket(frame.packetData, conn.protocolVersion)
        if (!result.ok) {
          console.error(`[${conn.clientId}] Decode error:`, result.error.message)
          continue
        }

        handlePacket(result.value.packet, conn, (d) => ws.send(d))
      }
    },

    close(ws) {
      const conn = ws.data
      console.log(`[${conn.clientId}] WebSocket disconnected`)
    }
  }
})

console.log(`MQTT WebSocket server listening on ws://localhost:${String(PORT)}`)
console.log("Connect with an MQTT client using WebSocket transport")
