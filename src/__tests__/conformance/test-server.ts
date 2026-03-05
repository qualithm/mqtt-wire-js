/**
 * TCP test server for conformance testing.
 *
 * Wraps MqttWire with a real TCP server for testing against external MQTT clients.
 *
 * @packageDocumentation
 */

import * as net from "node:net"

import { PacketType } from "../../constants.js"
import type {
  ConnackPacket,
  ConnectPacket,
  PublishPacket,
  SubackPacket,
  SubscribePacket,
  UnsubackPacket,
  UnsubscribePacket
} from "../../packets/types.js"
import { MqttWire } from "../../wire.js"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Recorded event from the test server.
 */
export type ServerEvent =
  | { type: "connect"; clientId: string; packet: ConnectPacket }
  | { type: "publish"; clientId: string; packet: PublishPacket }
  | { type: "subscribe"; clientId: string; packet: SubscribePacket }
  | { type: "unsubscribe"; clientId: string; packet: UnsubscribePacket }
  | { type: "disconnect"; clientId: string }
  | { type: "error"; clientId: string; error: Error }

/**
 * Options for the test server.
 */
export type TestServerOptions = {
  /** Port to listen on (0 = random available port) */
  readonly port?: number
  /** Host to bind to (default: 127.0.0.1) */
  readonly host?: string
}

// -----------------------------------------------------------------------------
// TestServer
// -----------------------------------------------------------------------------

/**
 * TCP test server for conformance testing.
 *
 * Creates a real TCP server that handles MQTT clients using MqttWire.
 * Records all events for test assertions.
 *
 * @example
 * ```ts
 * const server = new TestServer()
 * await server.start()
 *
 * // Connect with mqtt.js client
 * const client = mqtt.connect(`mqtt://localhost:${server.port}`)
 *
 * // Wait for events
 * await server.waitForEvent("connect")
 *
 * // Check recorded events
 * expect(server.events).toContainEqual(expect.objectContaining({ type: "connect" }))
 *
 * await server.stop()
 * ```
 */
export class TestServer {
  private readonly options: Required<TestServerOptions>
  private server: net.Server | null = null
  private readonly connections = new Map<net.Socket, MqttWire>()
  private readonly eventListeners = new Map<string, (() => void)[]>()

  /** All recorded events */
  readonly events: ServerEvent[] = []

  /** All received publish messages (convenience accessor) */
  readonly publishedMessages: { topic: string; payload: string }[] = []

  constructor(options: TestServerOptions = {}) {
    this.options = {
      port: options.port ?? 0,
      host: options.host ?? "127.0.0.1"
    }
  }

  /**
   * Get the port the server is listening on.
   * Only valid after start() resolves.
   */
  get port(): number {
    const addr = this.server?.address()
    if (addr !== null && addr !== undefined && typeof addr === "object") {
      return addr.port
    }
    throw new Error("server not started")
  }

  /**
   * Get the connection URL for clients.
   */
  get url(): string {
    return `mqtt://${this.options.host}:${String(this.port)}`
  }

  /**
   * Start the server.
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket)
      })

      this.server.on("error", reject)

      this.server.listen(this.options.port, this.options.host, () => {
        resolve()
      })
    })
  }

  /**
   * Stop the server and close all connections.
   */
  async stop(): Promise<void> {
    // Close all client connections
    for (const [socket, wire] of this.connections) {
      wire.reset()
      socket.destroy()
    }
    this.connections.clear()

    // Close server
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve()
        return
      }

      this.server.close((err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
        this.server = null
      })
    })
  }

  /**
   * Wait for a specific event type and optionally matching a predicate.
   */
  async waitForEvent(
    type: ServerEvent["type"],
    predicate?: (event: ServerEvent) => boolean,
    timeoutMs = 5000
  ): Promise<ServerEvent> {
    // Check if event already exists
    const existing = this.events.find((e) => e.type === type && (!predicate || predicate(e)))
    if (existing) {
      return existing
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        removeListener()
        reject(new Error(`timeout waiting for ${type} event`))
      }, timeoutMs)

      const checkEvent = (): void => {
        const event = this.events.find((e) => e.type === type && (!predicate || predicate(e)))
        if (event) {
          clearTimeout(timeout)
          removeListener()
          resolve(event)
        }
      }

      const removeListener = (): void => {
        const listeners = this.eventListeners.get(type)
        if (listeners) {
          const idx = listeners.indexOf(checkEvent)
          if (idx >= 0) {
            listeners.splice(idx, 1)
          }
        }
      }

      const listeners = this.eventListeners.get(type) ?? []
      listeners.push(checkEvent)
      this.eventListeners.set(type, listeners)
    })
  }

  /**
   * Wait for N publish messages.
   */
  async waitForPublishes(count: number, timeoutMs = 5000): Promise<void> {
    const startTime = Date.now()
    while (this.publishedMessages.length < count) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `timeout waiting for ${String(count)} publishes, got ${String(this.publishedMessages.length)}`
        )
      }
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  /**
   * Clear all recorded events.
   */
  clearEvents(): void {
    this.events.length = 0
    this.publishedMessages.length = 0
  }

  /**
   * Get a connected MqttWire instance by client ID.
   */
  getWire(clientId: string): MqttWire | undefined {
    for (const wire of this.connections.values()) {
      if (wire.clientId === clientId) {
        return wire
      }
    }
    return undefined
  }

  /**
   * Get any connected MqttWire instance (for tests that don't care about specific client ID).
   */
  getAnyConnectedWire(): MqttWire | undefined {
    for (const wire of this.connections.values()) {
      return wire
    }
    return undefined
  }

  /**
   * Publish a message to a connected client.
   */
  async serverPublish(
    clientId: string,
    topic: string,
    payload: Uint8Array | string
  ): Promise<void> {
    const wire = this.getWire(clientId)
    if (!wire) {
      throw new Error(`no client with id: ${clientId}`)
    }

    const payloadBytes = typeof payload === "string" ? new TextEncoder().encode(payload) : payload

    await wire.publish(topic, payloadBytes)
  }

  private handleConnection(socket: net.Socket): void {
    let clientId = "unknown"

    const wire = new MqttWire({
      onSend: (data) => {
        socket.write(data)
      },

      onConnect: (connect: ConnectPacket): ConnackPacket => {
        clientId = connect.clientId || `auto-${String(Date.now())}`
        this.recordEvent({
          type: "connect",
          clientId,
          packet: connect
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

      onPublish: (packet: PublishPacket) => {
        const payload = new TextDecoder().decode(packet.payload)
        this.publishedMessages.push({ topic: packet.topic, payload })
        this.recordEvent({
          type: "publish",
          clientId,
          packet
        })
      },

      onSubscribe: (packet: SubscribePacket): SubackPacket => {
        this.recordEvent({
          type: "subscribe",
          clientId,
          packet
        })

        return {
          type: PacketType.SUBACK,
          packetId: packet.packetId,
          reasonCodes: packet.subscriptions.map((s) => s.options.qos)
        }
      },

      onUnsubscribe: (packet: UnsubscribePacket): UnsubackPacket => {
        this.recordEvent({
          type: "unsubscribe",
          clientId,
          packet
        })

        return {
          type: PacketType.UNSUBACK,
          packetId: packet.packetId,
          reasonCodes: packet.topicFilters.map(() => 0x00 as const)
        }
      },

      onDisconnect: () => {
        this.recordEvent({
          type: "disconnect",
          clientId
        })
      },

      onError: (error) => {
        this.recordEvent({
          type: "error",
          clientId,
          error
        })
      }
    })

    this.connections.set(socket, wire)

    socket.on("data", (data: Buffer) => {
      void wire.receive(data)
    })

    socket.on("close", () => {
      wire.reset()
      this.connections.delete(socket)
    })

    socket.on("error", (err) => {
      this.recordEvent({
        type: "error",
        clientId,
        error: err
      })
    })
  }

  private recordEvent(event: ServerEvent): void {
    this.events.push(event)

    // Notify listeners
    const listeners = this.eventListeners.get(event.type)
    if (listeners) {
      listeners.forEach((fn) => {
        fn()
      })
    }
  }
}
