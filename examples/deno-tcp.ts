/**
 * Deno TCP server example.
 *
 * Demonstrates accepting MQTT client connections over TCP using Deno's native
 * network API with MqttWire handling the protocol state machine.
 *
 * Set `MQTT_PORT` to configure the listening port.
 *
 * @example
 * ```bash
 * deno run --allow-net --allow-env examples/deno-tcp.ts
 * # Then: mosquitto_pub -t test/hello -m "Hello"
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
  MqttWire,
  PacketType,
  type SubackPacket,
  type SubscribePacket,
  type UnsubackPacket,
  type UnsubscribePacket
} from "@qualithm/mqtt-wire"

const PORT = Number(Deno.env.get("MQTT_PORT") ?? 1883)

// Handle a single client connection.
async function handleConnection(conn: {
  read: (buffer: Uint8Array) => Promise<number | null>
  write: (data: Uint8Array) => Promise<number>
  close: () => void
}): Promise<void> {
  const wire = new MqttWire({
    onSend: async (data) => {
      await conn.write(data)
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

  console.log("Client connected")

  try {
    const buffer = new Uint8Array(4096)
    let bytesRead = await conn.read(buffer)

    while (bytesRead !== null) {
      // MqttWire handles all protocol processing
      await wire.receive(buffer.subarray(0, bytesRead))
      bytesRead = await conn.read(buffer)
    }
  } catch (err) {
    if (err instanceof Deno.errors.BadResource) {
      // Connection closed
    } else {
      console.error(`[${String(wire.clientId)}] Error:`, err)
    }
  }

  console.log(`[${String(wire.clientId)}] Disconnected`)
}

// Start server.
async function main(): Promise<void> {
  console.log("=== Deno TCP Server ===\n")

  console.log(`Starting MQTT server on port ${String(PORT)}...`)

  const listener = Deno.listen({ hostname: "0.0.0.0", port: PORT })

  console.log(`MQTT server listening on port ${String(PORT)}`)
  console.log("Test with: mosquitto_pub -t test/hello -m 'Hello World'")

  for await (const conn of listener) {
    void handleConnection(conn)
  }
}

main().catch(console.error)
