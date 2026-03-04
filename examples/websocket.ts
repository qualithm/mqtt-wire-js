/**
 * WebSocket server example using MqttWire.
 *
 * Demonstrates accepting MQTT client connections over WebSocket using Bun's
 * native WebSocket API with MqttWire handling the protocol state machine.
 *
 * Note: MQTT over WebSocket requires the client to use binary frames.
 * Most MQTT.js clients support this out of the box.
 *
 * @example
 * ```bash
 * # Run this server
 * bun run examples/websocket.ts
 *
 * # Then connect with any MQTT over WebSocket client
 * # Example with mqtt.js:
 * # import mqtt from "mqtt"
 * # const client = mqtt.connect("ws://localhost:8083")
 * ```
 */

/* eslint-disable no-console */

import {
  type ConnackPacket,
  type ConnectPacket,
  MqttWire,
  PacketType,
  type SubackPacket,
  type SubscribePacket,
  type UnsubackPacket,
  type UnsubscribePacket
} from "../src/index.js"

const PORT = Number(process.env.MQTT_WS_PORT ?? 8083)

console.log(`Starting MQTT WebSocket server on port ${String(PORT)}...`)

Bun.serve({
  port: PORT,
  fetch(req, server) {
    // Handle WebSocket upgrade
    if (server.upgrade(req)) {
      return // Response handled by upgrade
    }

    // Return 426 for non-WebSocket requests
    return new Response("WebSocket only", { status: 426 })
  },
  websocket: {
    open(ws) {
      // Create MqttWire for this connection
      const wire = new MqttWire({
        onSend: (data) => {
          ws.send(data)
        },

        onConnect: (connect: ConnectPacket): ConnackPacket => {
          const clientId = connect.clientId || `server-${String(Date.now())}`

          console.log(`[${clientId}] CONNECT received`, {
            protocolVersion: connect.protocolVersion,
            cleanStart: connect.cleanStart,
            keepAlive: connect.keepAlive
          })

          return {
            type: PacketType.CONNACK,
            sessionPresent: false,
            reasonCode: 0x00,
            properties:
              connect.protocolVersion === "5.0"
                ? {
                    assignedClientIdentifier: connect.clientId ? undefined : clientId
                  }
                : undefined
          }
        },

        onPublish: (packet) => {
          const payload = new TextDecoder().decode(packet.payload)
          console.log(`[${String(wire.clientId)}] PUBLISH: [${packet.topic}] ${payload}`)
          // TODO: Route message to subscribers
        },

        onSubscribe: (packet: SubscribePacket): SubackPacket => {
          const filters = packet.subscriptions.map((s) => s.topicFilter)
          console.log(`[${String(wire.clientId)}] SUBSCRIBE:`, filters)

          return {
            type: PacketType.SUBACK,
            packetId: packet.packetId,
            reasonCodes: packet.subscriptions.map((s) => s.options.qos)
          }
        },

        onUnsubscribe: (packet: UnsubscribePacket): UnsubackPacket => {
          console.log(`[${String(wire.clientId)}] UNSUBSCRIBE:`, packet.topicFilters)

          return {
            type: PacketType.UNSUBACK,
            packetId: packet.packetId,
            reasonCodes: packet.topicFilters.map(() => 0x00 as const)
          }
        },

        onDisconnect: (packet) => {
          console.log(`[${String(wire.clientId)}] DISCONNECT`, {
            reasonCode: packet?.reasonCode
          })
        },

        onError: (error) => {
          console.error(`[${String(wire.clientId)}] Error:`, error.message)
        }
      })

      // Store wire instance on the WebSocket for later access
      ;(ws as unknown as { wire: MqttWire }).wire = wire
      console.log("Client connected via WebSocket")
    },

    message(ws, message) {
      const wsWithWire = ws as unknown as { wire?: MqttWire }
      if (wsWithWire.wire === undefined) {
        return
      }
      const { wire } = wsWithWire

      // WebSocket messages are ArrayBuffer, Buffer, or string
      let data: Uint8Array
      if (message instanceof ArrayBuffer) {
        data = new Uint8Array(message)
      } else if (message instanceof Uint8Array) {
        data = message
      } else {
        // At this point message is a string
        data = new TextEncoder().encode(message)
      }

      // MqttWire handles all protocol processing
      void wire.receive(data)
    },

    close(ws) {
      const wsWithWire = ws as unknown as { wire?: MqttWire }
      if (wsWithWire.wire !== undefined) {
        console.log(`[${String(wsWithWire.wire.clientId)}] WebSocket closed`)
      }
    }
  }
})

console.log(`MQTT WebSocket server listening on port ${String(PORT)}`)
console.log("Connect with: mqtt.connect('ws://localhost:8083')")
