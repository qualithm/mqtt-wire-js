/**
 * Test harness for server-side MqttWire testing.
 *
 * Provides utilities for simulating client connections, sending client packets,
 * and capturing server responses.
 *
 * @example
 * ```ts
 * import { TestHarness, connect, publish, subscribe } from "@qualithm/mqtt-wire/testing"
 *
 * const harness = new TestHarness()
 *
 * // Simulate client CONNECT
 * await harness.clientConnect({ clientId: "test-client" })
 *
 * // Verify server sent CONNACK
 * expect(harness.sentPackets).toHaveLength(1)
 * expect(harness.sentPackets[0].type).toBe(PacketType.CONNACK)
 *
 * // Simulate client PUBLISH
 * await harness.clientPublish("topic", "hello")
 * expect(harness.hookCalls.onPublish).toHaveLength(1)
 *
 * // Server publishes to client
 * await harness.wire.publish("response/topic", new Uint8Array([1, 2, 3]))
 * ```
 *
 * @packageDocumentation
 */

import { PacketType } from "../constants.js"
import { decodePacket, encodePacket } from "../packets/index.js"
import type {
  ConnackPacket,
  ConnectPacket,
  DisconnectPacket,
  MqttPacket,
  PacketOfType,
  PublishPacket,
  PubrelPacket,
  SubackPacket,
  SubscribePacket,
  Subscription,
  UnsubackPacket,
  UnsubscribePacket
} from "../packets/types.js"
import type { LifecycleHooks, MqttWireOptions } from "../state/types.js"
import type { ProtocolVersion, QoS, ReasonCode } from "../types.js"
import { MqttWire } from "../wire.js"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Recorded sent packet with metadata.
 */
export type SentPacketRecord = {
  /** The raw bytes sent */
  readonly bytes: Uint8Array
  /** The decoded packet (if decodable) */
  readonly packet: MqttPacket | null
  /** Timestamp when sent */
  readonly timestamp: number
}

/**
 * Recorded received packet with metadata.
 */
export type ReceivedPacketRecord = {
  /** The packet that was received */
  readonly packet: MqttPacket
  /** Timestamp when received */
  readonly timestamp: number
}

/**
 * Recorded disconnect event.
 */
export type DisconnectRecord = {
  /** The DISCONNECT packet if client sent one. */
  packet?: DisconnectPacket
  /** Error reason if disconnect was due to error. */
  reason?: Error
}

/**
 * Lifecycle hook call records.
 */
export type HookCallRecords = {
  /** CONNECT packets received. */
  onConnect: ConnectPacket[]
  /** PUBLISH packets received. */
  onPublish: PublishPacket[]
  /** SUBSCRIBE packets received. */
  onSubscribe: SubscribePacket[]
  /** UNSUBSCRIBE packets received. */
  onUnsubscribe: UnsubscribePacket[]
  /** Disconnect events. */
  onDisconnect: DisconnectRecord[]
  /** Errors passed to onError hook. */
  onError: Error[]
}

/**
 * Options for TestHarness.
 */
export type TestHarnessOptions = MqttWireOptions & {
  /** Default CONNACK to return (if onConnect not customised) */
  readonly defaultConnack?: ConnackPacket
}

// -----------------------------------------------------------------------------
// TestHarness
// -----------------------------------------------------------------------------

/**
 * Test harness for server-side MqttWire.
 *
 * Provides utilities for:
 * - Simulating client packets (CONNECT, PUBLISH, SUBSCRIBE, etc.)
 * - Capturing server-sent packets
 * - Testing lifecycle hooks
 * - Server-side publish to client
 */
export class TestHarness {
  /** The MqttWire instance being tested */
  readonly wire: MqttWire

  /** All packets sent by the server via onSend */
  readonly sentPackets: SentPacketRecord[] = []

  /** All packets received from the simulated client */
  readonly receivedPackets: ReceivedPacketRecord[] = []

  /** Lifecycle hook call records */
  readonly hookCalls: HookCallRecords = {
    onConnect: [],
    onPublish: [],
    onSubscribe: [],
    onUnsubscribe: [],
    onDisconnect: [],
    onError: []
  }

  /** Protocol version (set after CONNECT) */
  private _version: ProtocolVersion = "5.0"

  /** Default CONNACK to return */
  private readonly defaultConnack: ConnackPacket

  /** Custom onConnect handler */
  private customOnConnect?: (packet: ConnectPacket) => ConnackPacket | Promise<ConnackPacket>

  /** Custom onSubscribe handler */
  private customOnSubscribe?: (packet: SubscribePacket) => SubackPacket | Promise<SubackPacket>

  /** Custom onUnsubscribe handler */
  private customOnUnsubscribe?: (
    packet: UnsubscribePacket
  ) => UnsubackPacket | Promise<UnsubackPacket>

  /**
   * Create a new test harness.
   */
  constructor(options: TestHarnessOptions = {}) {
    this.defaultConnack = options.defaultConnack ?? {
      type: PacketType.CONNACK,
      sessionPresent: false,
      reasonCode: 0x00
    }

    const hooks: LifecycleHooks = {
      onSend: (data: Uint8Array) => {
        this.handleSend(data)
      },
      onConnect: async (packet) => {
        this.hookCalls.onConnect.push(packet)
        this._version = packet.protocolVersion
        if (this.customOnConnect) {
          return this.customOnConnect(packet)
        }
        return this.defaultConnack
      },
      onPublish: (packet) => {
        this.hookCalls.onPublish.push(packet)
      },
      onSubscribe: async (packet) => {
        this.hookCalls.onSubscribe.push(packet)
        if (this.customOnSubscribe) {
          return this.customOnSubscribe(packet)
        }
        // Default: grant requested QoS
        return {
          type: PacketType.SUBACK,
          packetId: packet.packetId,
          reasonCodes: packet.subscriptions.map((s) => s.options.qos)
        }
      },
      onUnsubscribe: async (packet) => {
        this.hookCalls.onUnsubscribe.push(packet)
        if (this.customOnUnsubscribe) {
          return this.customOnUnsubscribe(packet)
        }
        // Default: success for all
        return {
          type: PacketType.UNSUBACK,
          packetId: packet.packetId,
          reasonCodes: packet.topicFilters.map(() => 0x00 as const)
        }
      },
      onDisconnect: (packet, reason) => {
        this.hookCalls.onDisconnect.push({ packet, reason })
      },
      onError: (error) => {
        this.hookCalls.onError.push(error)
      }
    }

    this.wire = new MqttWire(hooks, options)
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Get the protocol version (set after CONNECT).
   */
  get version(): ProtocolVersion {
    return this._version
  }

  /**
   * Set custom onConnect handler.
   *
   * @example
   * ```ts
   * harness.setOnConnect((connect) => ({
   *   type: PacketType.CONNACK,
   *   sessionPresent: false,
   *   reasonCode: 0x87 // Reject
   * }))
   * ```
   */
  setOnConnect(handler: (packet: ConnectPacket) => ConnackPacket | Promise<ConnackPacket>): this {
    this.customOnConnect = handler
    return this
  }

  /**
   * Set custom onSubscribe handler.
   */
  setOnSubscribe(handler: (packet: SubscribePacket) => SubackPacket | Promise<SubackPacket>): this {
    this.customOnSubscribe = handler
    return this
  }

  /**
   * Set custom onUnsubscribe handler.
   */
  setOnUnsubscribe(
    handler: (packet: UnsubscribePacket) => UnsubackPacket | Promise<UnsubackPacket>
  ): this {
    this.customOnUnsubscribe = handler
    return this
  }

  // ---------------------------------------------------------------------------
  // Client Simulation
  // ---------------------------------------------------------------------------

  /**
   * Simulate client sending CONNECT.
   */
  async clientConnect(options: Partial<ConnectPacket> = {}): Promise<void> {
    const connect: ConnectPacket = {
      type: PacketType.CONNECT,
      protocolVersion: "5.0",
      clientId: "test-client",
      cleanStart: true,
      keepAlive: 60,
      ...options
    }
    this._version = connect.protocolVersion
    await this.sendPacket(connect)
  }

  /**
   * Simulate client sending PUBLISH.
   */
  async clientPublish(
    topic: string,
    payload: string | Uint8Array,
    options: {
      qos?: QoS
      retain?: boolean
      dup?: boolean
      packetId?: number
      properties?: PublishPacket["properties"]
    } = {}
  ): Promise<void> {
    const qos = options.qos ?? 0
    const packetId = qos > 0 ? (options.packetId ?? 1) : undefined

    const publish: PublishPacket = {
      type: PacketType.PUBLISH,
      topic,
      payload: typeof payload === "string" ? new TextEncoder().encode(payload) : payload,
      qos,
      retain: options.retain ?? false,
      dup: options.dup ?? false,
      packetId,
      properties: options.properties
    }
    await this.sendPacket(publish)
  }

  /**
   * Simulate client sending PUBREL (QoS 2 continuation).
   */
  async clientPubrel(packetId: number): Promise<void> {
    const pubrel: PubrelPacket = {
      type: PacketType.PUBREL,
      packetId
    }
    await this.sendPacket(pubrel)
  }

  /**
   * Simulate client sending SUBSCRIBE.
   */
  async clientSubscribe(
    subscriptions: { topicFilter: string; qos?: QoS }[] | string,
    packetId = 1
  ): Promise<void> {
    const subs: Subscription[] =
      typeof subscriptions === "string"
        ? [{ topicFilter: subscriptions, options: { qos: 0 } }]
        : subscriptions.map((s) => ({
            topicFilter: s.topicFilter,
            options: { qos: s.qos ?? 0 }
          }))

    const subscribe: SubscribePacket = {
      type: PacketType.SUBSCRIBE,
      packetId,
      subscriptions: subs
    }
    await this.sendPacket(subscribe)
  }

  /**
   * Simulate client sending UNSUBSCRIBE.
   */
  async clientUnsubscribe(topicFilters: string[] | string, packetId = 1): Promise<void> {
    const filters = typeof topicFilters === "string" ? [topicFilters] : topicFilters

    const unsubscribe: UnsubscribePacket = {
      type: PacketType.UNSUBSCRIBE,
      packetId,
      topicFilters: filters
    }
    await this.sendPacket(unsubscribe)
  }

  /**
   * Simulate client sending PINGREQ.
   */
  async clientPing(): Promise<void> {
    await this.sendPacket({ type: PacketType.PINGREQ })
  }

  /**
   * Simulate client sending DISCONNECT.
   */
  async clientDisconnect(reasonCode: ReasonCode = 0x00): Promise<void> {
    const disconnect: DisconnectPacket = {
      type: PacketType.DISCONNECT,
      reasonCode
    }
    await this.sendPacket(disconnect)
  }

  /**
   * Send a raw packet to the wire.
   */
  async sendPacket(packet: MqttPacket): Promise<void> {
    this.receivedPackets.push({ packet, timestamp: Date.now() })
    const data = encodePacket(packet, this._version)
    await this.wire.receive(data)
  }

  /**
   * Send raw bytes to the wire.
   */
  async sendBytes(data: Uint8Array): Promise<void> {
    await this.wire.receive(data)
  }

  // ---------------------------------------------------------------------------
  // Packet Capture
  // ---------------------------------------------------------------------------

  /**
   * Handle outgoing packet (from wire.onSend).
   */
  private handleSend(data: Uint8Array): void {
    const timestamp = Date.now()

    // Decode the packet
    const result = decodePacket(data, this._version, 0)
    const packet = result.ok ? result.value.packet : null

    this.sentPackets.push({ bytes: data, packet, timestamp })
  }

  // ---------------------------------------------------------------------------
  // Assertions & Queries
  // ---------------------------------------------------------------------------

  /**
   * Get all sent packets of a specific type.
   */
  getSentPacketsOfType<T extends PacketType>(type: T): PacketOfType<T>[] {
    return this.sentPackets
      .filter((r) => r.packet?.type === type)
      .map((r) => r.packet as PacketOfType<T>)
  }

  /**
   * Get the last sent packet.
   */
  get lastSentPacket(): SentPacketRecord | undefined {
    return this.sentPackets[this.sentPackets.length - 1]
  }

  /**
   * Get the last sent packet of a specific type.
   */
  lastSentPacketOfType<T extends PacketType>(type: T): PacketOfType<T> | undefined {
    for (let i = this.sentPackets.length - 1; i >= 0; i--) {
      const { packet } = this.sentPackets[i]
      if (packet?.type === type) {
        return packet as PacketOfType<T>
      }
    }
    return undefined
  }

  /**
   * Clear all recorded packets and hook calls.
   */
  clear(): void {
    this.sentPackets.length = 0
    this.receivedPackets.length = 0
    this.hookCalls.onConnect.length = 0
    this.hookCalls.onPublish.length = 0
    this.hookCalls.onSubscribe.length = 0
    this.hookCalls.onUnsubscribe.length = 0
    this.hookCalls.onDisconnect.length = 0
    this.hookCalls.onError.length = 0
  }

  /**
   * Wait for a specific condition.
   */
  async waitFor(
    condition: () => boolean,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<void> {
    const timeout = options.timeout ?? 1000
    const interval = options.interval ?? 10
    const start = Date.now()

    while (!condition()) {
      if (Date.now() - start > timeout) {
        throw new Error(`Timeout waiting for condition after ${String(timeout)}ms`)
      }
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
  }

  /**
   * Wait for a specific number of sent packets.
   */
  async waitForSentPackets(count: number, timeout = 1000): Promise<void> {
    await this.waitFor(() => this.sentPackets.length >= count, { timeout })
  }

  /**
   * Wait for a sent packet of a specific type.
   */
  async waitForSentPacketOfType(type: MqttPacket["type"], timeout = 1000): Promise<void> {
    await this.waitFor(() => this.sentPackets.some((r) => r.packet?.type === type), { timeout })
  }
}

// -----------------------------------------------------------------------------
// Convenience Functions
// -----------------------------------------------------------------------------

/**
 * Create a test harness with common defaults for quick testing.
 *
 * @example
 * ```ts
 * const harness = createTestHarness()
 * await harness.clientConnect({ clientId: "test" })
 * expect(harness.wire.isConnected).toBe(true)
 * ```
 */
export function createTestHarness(options?: TestHarnessOptions): TestHarness {
  return new TestHarness(options)
}
