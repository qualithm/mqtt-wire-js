/**
 * Node.js TCP server example.
 *
 * Demonstrates accepting MQTT client connections over TCP using Node's net
 * module with MqttWire handling the protocol state machine.
 *
 * Set `MQTT_PORT` to configure the listening port.
 *
 * @example
 * ```bash
 * npx tsx examples/node-tcp.ts
 * # Then: mosquitto_pub -t test/hello -m "Hello"
 * ```
 */

/* eslint-disable no-console */

import * as net from "node:net"

import {
  type ConnackPacket,
  type ConnectPacket,
  MqttWire,
  PacketType,
  type SubackPacket,
  type SubscribePacket,
  type UnsubackPacket,
  type UnsubscribePacket
} from "@qualithm/mqtt-wire"

const PORT = Number(process.env.MQTT_PORT ?? 1883)

// Per-connection MqttWire instance.
const connections = new Map<net.Socket, MqttWire>()

// Start TCP server.
function main(): void {
  console.log("=== Node TCP Server ===\n")

  const server = net.createServer((socket) => {
    // Create MqttWire for this connection
    const wire = new MqttWire({
      onSend: (data) => {
        socket.write(data)
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

    connections.set(socket, wire)
    console.log("Client connected")

    socket.on("data", (data: Buffer) => {
      // MqttWire handles all protocol processing
      void wire.receive(data)
    })

    socket.on("close", () => {
      console.log(`[${String(wire.clientId)}] Disconnected`)
      connections.delete(socket)
    })

    socket.on("error", (err) => {
      console.error(`[${String(wire.clientId)}] Socket error:`, err)
    })
  })

  server.listen(PORT, () => {
    console.log(`MQTT server listening on port ${String(PORT)}`)
    console.log("Test with: mosquitto_pub -t test/hello -m 'Hello World'")
  })
}

main()
