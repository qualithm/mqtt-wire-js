/**
 * Test harness for MqttWire testing.
 *
 * Provides utilities for simulating server responses, capturing sent packets,
 * and testing client code that uses MqttWire.
 *
 * @example
 * ```ts
 * import { TestHarness, connack, publish } from "@qualithm/mqtt-wire/testing"
 *
 * const harness = new TestHarness()
 *
 * // Auto-respond to CONNECT with CONNACK
 * harness.onConnect(() => connack().build())
 *
 * await harness.wire.connect({ clientId: "test" })
 *
 * // Verify sent packets
 * expect(harness.sentPackets).toHaveLength(1)
 * expect(harness.sentPackets[0].type).toBe(PacketType.CONNECT)
 *
 * // Simulate incoming PUBLISH
 * await harness.receive(publish("topic").payload("hello").build())
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
  PingrespPacket,
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket,
  SubackPacket,
  SubscribePacket,
  UnsubackPacket,
  UnsubscribePacket
} from "../packets/types.js"
import type { LifecycleHooks, MqttWireOptions } from "../state/types.js"
import type { ProtocolVersion } from "../types.js"
import { MqttWire } from "../wire.js"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Callback for auto-responding to packets.
 */
export type PacketResponder<TPacket, TResponse> = (
  packet: TPacket
) => TResponse | TResponse[] | null | undefined

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
 * Options for TestHarness.
 */
export type TestHarnessOptions = MqttWireOptions & {
  /** Automatically respond to PINGREQ with PINGRESP */
  readonly autoPingresp?: boolean
}

// -----------------------------------------------------------------------------
// TestHarness
// -----------------------------------------------------------------------------

/**
 * Test harness for MqttWire.
 *
 * Provides utilities for:
 * - Capturing sent packets
 * - Simulating received packets
 * - Auto-responding to specific packet types
 * - Testing lifecycle hooks
 */
export class TestHarness {
  /** The MqttWire instance being tested */
  readonly wire: MqttWire

  /** All packets sent via onSend */
  readonly sentPackets: SentPacketRecord[] = []

  /** All packets received via receive() */
  readonly receivedPackets: ReceivedPacketRecord[] = []

  /** Lifecycle hook call records */
  readonly hookCalls = {
    onConnect: [] as ConnackPacket[],
    onPublish: [] as PublishPacket[],
    onSubscribe: [] as { request: SubscribePacket; response: SubackPacket }[],
    onUnsubscribe: [] as { request: UnsubscribePacket; response: UnsubackPacket }[],
    onDisconnect: [] as { packet?: DisconnectPacket; reason?: Error }[],
    onError: [] as Error[]
  }

  /** Protocol version used */
  readonly version: ProtocolVersion

  // Responders
  private connectResponder?: PacketResponder<ConnectPacket, ConnackPacket>
  private publishResponder?: PacketResponder<PublishPacket, PubackPacket | PubrecPacket>
  private pubrelResponder?: PacketResponder<PubrelPacket, PubcompPacket>
  private subscribeResponder?: PacketResponder<SubscribePacket, SubackPacket>
  private unsubscribeResponder?: PacketResponder<UnsubscribePacket, UnsubackPacket>
  private disconnectResponder?: PacketResponder<DisconnectPacket, void>

  private readonly autoPingresp: boolean

  /**
   * Create a new test harness.
   */
  constructor(options: TestHarnessOptions = {}) {
    this.version = options.protocolVersion ?? "5.0"
    this.autoPingresp = options.autoPingresp ?? true

    const hooks: LifecycleHooks = {
      onSend: async (data: Uint8Array) => {
        await this.handleSend(data)
      },
      onConnect: (packet) => {
        this.hookCalls.onConnect.push(packet)
      },
      onPublish: (packet) => {
        this.hookCalls.onPublish.push(packet)
      },
      onSubscribe: (request, response) => {
        this.hookCalls.onSubscribe.push({ request, response })
      },
      onUnsubscribe: (request, response) => {
        this.hookCalls.onUnsubscribe.push({ request, response })
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
  // Responder Registration
  // ---------------------------------------------------------------------------

  /**
   * Register auto-responder for CONNECT packets.
   *
   * @example
   * ```ts
   * harness.onConnect(() => connack().build())
   * harness.onConnect((connect) =>
   *   connack()
   *     .assignedClientId(connect.clientId || "generated")
   *     .build()
   * )
   * ```
   */
  onConnect(responder: PacketResponder<ConnectPacket, ConnackPacket>): this {
    this.connectResponder = responder
    return this
  }

  /**
   * Register auto-responder for PUBLISH packets (QoS 1/2).
   *
   * For QoS 1, return PUBACK. For QoS 2, return PUBREC.
   *
   * @example
   * ```ts
   * harness.onPublish((pub) =>
   *   pub.qos === 1
   *     ? puback(pub.packetId!).build()
   *     : pubrec(pub.packetId!).build()
   * )
   * ```
   */
  onPublish(responder: PacketResponder<PublishPacket, PubackPacket | PubrecPacket>): this {
    this.publishResponder = responder
    return this
  }

  /**
   * Register auto-responder for PUBREL packets (QoS 2).
   *
   * @example
   * ```ts
   * harness.onPubrel((pubrel) => pubcomp(pubrel.packetId).build())
   * ```
   */
  onPubrel(responder: PacketResponder<PubrelPacket, PubcompPacket>): this {
    this.pubrelResponder = responder
    return this
  }

  /**
   * Register auto-responder for SUBSCRIBE packets.
   *
   * @example
   * ```ts
   * harness.onSubscribe((sub) =>
   *   suback(sub.packetId).granted(...sub.subscriptions.map(s => s.options.qos)).build()
   * )
   * ```
   */
  onSubscribe(responder: PacketResponder<SubscribePacket, SubackPacket>): this {
    this.subscribeResponder = responder
    return this
  }

  /**
   * Register auto-responder for UNSUBSCRIBE packets.
   *
   * @example
   * ```ts
   * harness.onUnsubscribe((unsub) =>
   *   unsuback(unsub.packetId).success(unsub.topicFilters.length).build()
   * )
   * ```
   */
  onUnsubscribe(responder: PacketResponder<UnsubscribePacket, UnsubackPacket>): this {
    this.unsubscribeResponder = responder
    return this
  }

  /**
   * Register callback for DISCONNECT packets (no response needed).
   *
   * @example
   * ```ts
   * harness.onDisconnect((disconnect) => {
   *   console.log("Client disconnected:", disconnect?.reasonCode)
   * })
   * ```
   */
  onDisconnect(responder: PacketResponder<DisconnectPacket, void>): this {
    this.disconnectResponder = responder
    return this
  }

  // ---------------------------------------------------------------------------
  // Packet Handling
  // ---------------------------------------------------------------------------

  /**
   * Handle outgoing packet (from wire.onSend).
   */
  private async handleSend(data: Uint8Array): Promise<void> {
    const timestamp = Date.now()

    // Decode the packet
    const result = decodePacket(data, this.version, 0)
    const packet = result.ok ? result.value.packet : null

    this.sentPackets.push({ bytes: data, packet, timestamp })

    // Auto-respond based on packet type
    if (packet) {
      await this.autoRespond(packet)
    }
  }

  /**
   * Normalize a responder result to an array of packets.
   */
  private normalizeResponse<T extends MqttPacket>(
    response: T | T[] | null | undefined
  ): MqttPacket[] {
    if (response === null || response === undefined) {
      return []
    }
    return Array.isArray(response) ? response : [response]
  }

  /**
   * Auto-respond to a packet based on registered responders.
   */
  private async autoRespond(packet: MqttPacket): Promise<void> {
    const responses = this.getAutoResponses(packet)

    // Send responses
    for (const response of responses) {
      await this.receive(response)
    }
  }

  /**
   * Get auto-responses for a packet based on type and registered responders.
   * Complexity is inherent - handling 15 MQTT packet types.
   */
  // eslint-disable-next-line complexity
  private getAutoResponses(packet: MqttPacket): MqttPacket[] {
    switch (packet.type) {
      case PacketType.CONNECT:
        return this.normalizeResponse(this.connectResponder?.(packet))

      case PacketType.PUBLISH:
        if (packet.qos > 0 && this.publishResponder) {
          return this.normalizeResponse(this.publishResponder(packet))
        }
        return []

      case PacketType.PUBREL:
        return this.normalizeResponse(this.pubrelResponder?.(packet))

      case PacketType.SUBSCRIBE:
        return this.normalizeResponse(this.subscribeResponder?.(packet))

      case PacketType.UNSUBSCRIBE:
        return this.normalizeResponse(this.unsubscribeResponder?.(packet))

      case PacketType.PINGREQ:
        return this.autoPingresp ? [{ type: PacketType.PINGRESP } as PingrespPacket] : []

      case PacketType.DISCONNECT:
        this.disconnectResponder?.(packet)
        return []

      // Server->client packet types don't need auto-responses
      case PacketType.CONNACK:
      case PacketType.PUBACK:
      case PacketType.PUBREC:
      case PacketType.PUBCOMP:
      case PacketType.SUBACK:
      case PacketType.UNSUBACK:
      case PacketType.PINGRESP:
      case PacketType.AUTH:
        return []
    }
  }

  /**
   * Simulate receiving a packet from the server.
   *
   * @example
   * ```ts
   * // Receive a PUBLISH
   * await harness.receive(publish("topic").payload("hello").build())
   *
   * // Receive raw bytes
   * await harness.receiveBytes(new Uint8Array([...]))
   * ```
   */
  async receive(packet: MqttPacket): Promise<void> {
    this.receivedPackets.push({ packet, timestamp: Date.now() })
    const data = encodePacket(packet, this.version)
    await this.wire.receive(data)
  }

  /**
   * Simulate receiving raw bytes from the server.
   */
  async receiveBytes(data: Uint8Array): Promise<void> {
    await this.wire.receive(data)
  }

  // ---------------------------------------------------------------------------
  // Assertions & Queries
  // ---------------------------------------------------------------------------

  /**
   * Get all sent packets of a specific type.
   */
  getSentPacketsOfType<T extends MqttPacket["type"]>(type: T): Extract<MqttPacket, { type: T }>[] {
    return this.sentPackets
      .filter((r) => r.packet?.type === type)
      .map((r) => r.packet as Extract<MqttPacket, { type: T }>)
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
  lastSentPacketOfType<T extends MqttPacket["type"]>(
    type: T
  ): Extract<MqttPacket, { type: T }> | undefined {
    for (let i = this.sentPackets.length - 1; i >= 0; i--) {
      const { packet } = this.sentPackets[i]
      if (packet?.type === type) {
        return packet as Extract<MqttPacket, { type: T }>
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
 * await harness.wire.connect({ clientId: "test" })
 * expect(harness.wire.isConnected).toBe(true)
 * ```
 */
export function createTestHarness(options?: TestHarnessOptions): TestHarness {
  const harness = new TestHarness(options)

  // Default responders for common scenarios
  harness.onConnect(() => ({
    type: PacketType.CONNACK,
    sessionPresent: false,
    reasonCode: 0x00
  }))

  return harness
}

/**
 * Create a test harness with auto-responders for all packet types.
 *
 * Useful for integration-style tests where you want realistic responses.
 */
export function createFullTestHarness(options?: TestHarnessOptions): TestHarness {
  const harness = new TestHarness(options)

  harness.onConnect(() => ({
    type: PacketType.CONNACK,
    sessionPresent: false,
    reasonCode: 0x00
  }))

  harness.onPublish((pub) => {
    if (pub.qos === 1 && pub.packetId !== undefined) {
      return { type: PacketType.PUBACK, packetId: pub.packetId }
    }
    if (pub.qos === 2 && pub.packetId !== undefined) {
      return { type: PacketType.PUBREC, packetId: pub.packetId }
    }
    return undefined
  })

  harness.onPubrel((pubrel) => ({
    type: PacketType.PUBCOMP,
    packetId: pubrel.packetId
  }))

  harness.onSubscribe((sub) => ({
    type: PacketType.SUBACK,
    packetId: sub.packetId,
    reasonCodes: sub.subscriptions.map((s) => s.options.qos)
  }))

  harness.onUnsubscribe((unsub) => ({
    type: PacketType.UNSUBACK,
    packetId: unsub.packetId,
    reasonCodes: unsub.topicFilters.map(() => 0x00 as const)
  }))

  return harness
}
