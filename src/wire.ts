/**
 * MQTT protocol connection state machine.
 *
 * MqttWire manages the connection lifecycle, QoS flows, keepalive, and
 * lifecycle hooks. It's transport-agnostic: you provide bytes via
 * `receive()` and handle outbound bytes via the `onSend` hook.
 *
 * @packageDocumentation
 */

import { StreamFramer } from "./codec/framing.js"
import { PacketType } from "./constants.js"
import { decodePacket, encodePacket } from "./packets/index.js"
import type {
  ConnackPacket,
  ConnectPacket,
  DisconnectPacket,
  MqttPacket,
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket,
  SubackPacket,
  SubscribePacket,
  Subscription,
  UnsubackPacket,
  UnsubscribePacket
} from "./packets/types.js"
import { PacketIdAllocator } from "./state/packet-id.js"
import { QoSFlowTracker } from "./state/qos-flow.js"
import { TopicAliasError, TopicAliasManager } from "./state/topic-alias.js"
import {
  type ConnectionState,
  DEFAULT_WIRE_OPTIONS,
  type LifecycleHooks,
  type MqttWireOptions,
  type PendingOperation,
  type PendingSubscribe,
  type PendingUnsubscribe
} from "./state/types.js"
import type { ProtocolVersion, QoS, ReasonCode } from "./types.js"

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Error thrown for protocol violations.
 */
export class ProtocolError extends Error {
  readonly reasonCode: ReasonCode

  constructor(message: string, reasonCode: ReasonCode = 0x82) {
    super(message)
    this.name = "ProtocolError"
    this.reasonCode = reasonCode
  }
}

/**
 * Error thrown for invalid state transitions.
 */
export class StateError extends Error {
  readonly state: ConnectionState

  constructor(message: string, state: ConnectionState) {
    super(message)
    this.name = "StateError"
    this.state = state
  }
}

// -----------------------------------------------------------------------------
// MqttWire
// -----------------------------------------------------------------------------

/**
 * MQTT protocol connection state machine.
 *
 * Handles MQTT protocol parsing, encoding, QoS flows, keepalive, and
 * connection lifecycle. Transport-agnostic: bytes in via `receive()`,
 * bytes out via `onSend` hook.
 *
 * @example
 * ```ts
 * const wire = new MqttWire({
 *   onSend: (data) => socket.write(data),
 *   onPublish: (packet) => console.log(packet.topic, packet.payload),
 *   onConnect: (connack) => console.log('connected'),
 *   onDisconnect: () => console.log('disconnected'),
 *   onError: (err) => console.error(err)
 * })
 *
 * // Connect
 * await wire.connect({ clientId: 'my-client' })
 *
 * // Receive data from transport
 * socket.on('data', (chunk) => wire.receive(chunk))
 *
 * // Publish
 * await wire.publish('topic', payload, { qos: 1 })
 *
 * // Subscribe
 * await wire.subscribe([{ topicFilter: 'topic/#', options: { qos: 1 } }])
 *
 * // Disconnect
 * await wire.disconnect()
 * ```
 */
export class MqttWire {
  // Connection state
  private state: ConnectionState = "disconnected"
  private readonly protocolVersion: ProtocolVersion

  // Options (merged with defaults)
  private readonly options: Required<Omit<MqttWireOptions, "protocolVersion">> & {
    protocolVersion: ProtocolVersion
  }

  // Lifecycle hooks
  private readonly hooks: LifecycleHooks

  // Stream framing
  private readonly framer: StreamFramer

  // Packet ID allocation
  private readonly packetIds: PacketIdAllocator = new PacketIdAllocator()

  // QoS flow tracking
  private readonly qosFlows: QoSFlowTracker

  // Topic alias management
  private topicAliases: TopicAliasManager | null = null

  // Pending operations (SUBSCRIBE/UNSUBSCRIBE)
  private readonly pendingOps = new Map<number, PendingOperation>()

  // Keepalive timer
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null
  private lastActivity = 0

  // Server-provided values from CONNACK
  private serverReceiveMaximum = 65535
  private serverMaximumPacketSize = 268435455
  private serverTopicAliasMaximum = 0
  private serverKeepAlive: number | null = null
  private assignedClientId: string | null = null

  // Active subscriptions
  private readonly subscriptions = new Map<string, number>()

  /**
   * Create a new MqttWire instance.
   *
   * @param hooks - Lifecycle hooks (onSend is required)
   * @param options - Configuration options
   */
  constructor(hooks: LifecycleHooks, options: MqttWireOptions = {}) {
    this.hooks = hooks
    this.options = {
      ...DEFAULT_WIRE_OPTIONS,
      ...options
    }
    this.protocolVersion = this.options.protocolVersion
    this.framer = new StreamFramer(this.options.maximumPacketSize)
    this.qosFlows = new QoSFlowTracker(this.options.receiveMaximum)
  }

  // ---------------------------------------------------------------------------
  // Public Properties
  // ---------------------------------------------------------------------------

  /**
   * Get current connection state.
   */
  get connectionState(): ConnectionState {
    return this.state
  }

  /**
   * Check if connected.
   */
  get isConnected(): boolean {
    return this.state === "connected"
  }

  /**
   * Get protocol version (negotiated after CONNACK).
   */
  get version(): ProtocolVersion {
    return this.protocolVersion
  }

  /**
   * Get server's receive maximum (from CONNACK).
   */
  get receiveMaximum(): number {
    return this.serverReceiveMaximum
  }

  /**
   * Get server's maximum packet size (from CONNACK).
   */
  get maximumPacketSize(): number {
    return this.serverMaximumPacketSize
  }

  /**
   * Get assigned client ID (if server assigned one).
   */
  get clientId(): string | null {
    return this.assignedClientId
  }

  // ---------------------------------------------------------------------------
  // Connection Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initiate connection.
   *
   * Sends CONNECT packet and waits for CONNACK.
   *
   * @param connectOptions - CONNECT packet options
   */
  async connect(connectOptions: {
    clientId: string
    cleanStart?: boolean
    keepAlive?: number
    username?: string
    password?: Uint8Array
    will?: ConnectPacket["will"]
    properties?: ConnectPacket["properties"]
  }): Promise<void> {
    if (this.state !== "disconnected") {
      throw new StateError(`cannot connect in state ${this.state}`, this.state)
    }

    this.state = "connecting"

    const packet: ConnectPacket = {
      type: PacketType.CONNECT,
      protocolVersion: this.protocolVersion,
      clientId: connectOptions.clientId,
      cleanStart: connectOptions.cleanStart ?? true,
      keepAlive: connectOptions.keepAlive ?? this.options.keepAlive,
      username: connectOptions.username,
      password: connectOptions.password,
      will: connectOptions.will,
      properties: connectOptions.properties ?? {
        receiveMaximum: this.options.receiveMaximum,
        maximumPacketSize: this.options.maximumPacketSize,
        topicAliasMaximum: this.options.topicAliasMaximum,
        sessionExpiryInterval: this.options.sessionExpiryInterval
      }
    }

    await this.sendPacket(packet)
  }

  /**
   * Disconnect from server.
   *
   * Sends DISCONNECT packet and cleans up state.
   *
   * @param reasonCode - Disconnect reason (default: 0x00 normal)
   * @param properties - DISCONNECT properties
   */
  async disconnect(
    reasonCode: ReasonCode = 0x00,
    properties?: DisconnectPacket["properties"]
  ): Promise<void> {
    if (this.state !== "connected") {
      // Silent no-op if not connected
      this.cleanup()
      return
    }

    this.state = "disconnecting"

    const packet: DisconnectPacket = {
      type: PacketType.DISCONNECT,
      reasonCode,
      properties
    }

    try {
      await this.sendPacket(packet)
    } finally {
      this.cleanup()
    }
  }

  // ---------------------------------------------------------------------------
  // Receive Data
  // ---------------------------------------------------------------------------

  /**
   * Process incoming data from transport.
   *
   * Call this method with chunks of data received from the transport
   * (TCP socket, WebSocket, etc.). Complete packets will be parsed
   * and appropriate hooks called.
   *
   * @param data - Incoming data chunk
   */
  async receive(data: Uint8Array): Promise<void> {
    this.framer.push(data)
    this.lastActivity = Date.now()

    for (
      let frame = this.framer.read();
      frame.status !== "incomplete";
      frame = this.framer.read()
    ) {
      if (frame.status === "error") {
        await this.handleProtocolError(new ProtocolError(frame.error.message, 0x81))
        break
      }

      // Decode the packet
      const decodeResult = decodePacket(frame.packetData, this.protocolVersion)
      if (!decodeResult.ok) {
        await this.handleProtocolError(new ProtocolError(decodeResult.error.message, 0x81))
        continue
      }

      await this.handlePacket(decodeResult.value.packet)
    }
  }

  // ---------------------------------------------------------------------------
  // Publishing
  // ---------------------------------------------------------------------------

  /**
   * Publish a message.
   *
   * @param topic - Topic name
   * @param payload - Message payload
   * @param options - Publish options
   * @returns Packet ID for QoS > 0, undefined for QoS 0
   */
  async publish(
    topic: string,
    payload: Uint8Array,
    options: {
      qos?: QoS
      retain?: boolean
      dup?: boolean
      properties?: PublishPacket["properties"]
    } = {}
  ): Promise<number | undefined> {
    if (this.state !== "connected") {
      throw new StateError(`cannot publish in state ${this.state}`, this.state)
    }

    const qos = options.qos ?? 0
    let packetId: number | undefined

    // Allocate packet ID for QoS > 0
    if (qos > 0) {
      if (!this.qosFlows.canSendOutbound()) {
        throw new Error("receive maximum exceeded, cannot send more QoS > 0 messages")
      }
      packetId = this.packetIds.allocate()
    }

    // Build and apply topic alias if available
    let resolvedTopic = topic
    let topicAlias: number | undefined
    if (this.topicAliases && this.protocolVersion === "5.0") {
      const alias = this.topicAliases.getOrAssignOutbound(topic)
      if (alias) {
        topicAlias = alias.alias
        if (!alias.sendTopic) {
          resolvedTopic = "" // Use alias, don't send topic
        }
      }
    }

    const packet: PublishPacket = {
      type: PacketType.PUBLISH,
      topic: resolvedTopic,
      packetId,
      qos,
      retain: options.retain ?? false,
      dup: options.dup ?? false,
      payload,
      properties:
        topicAlias !== undefined ? { ...options.properties, topicAlias } : options.properties
    }

    // Track QoS flow before sending
    const now = Date.now()
    if (qos === 1) {
      this.qosFlows.startQoS1Outbound(packet, now)
    } else if (qos === 2) {
      this.qosFlows.startQoS2Outbound(packet, now)
    }

    await this.sendPacket(packet)
    return packetId
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to topics.
   *
   * @param subscriptions - Topic subscriptions
   * @param properties - SUBSCRIBE properties
   * @returns Packet ID
   */
  async subscribe(
    subscriptions: readonly Subscription[],
    properties?: SubscribePacket["properties"]
  ): Promise<number> {
    if (this.state !== "connected") {
      throw new StateError(`cannot subscribe in state ${this.state}`, this.state)
    }

    if (subscriptions.length === 0) {
      throw new Error("subscriptions array cannot be empty")
    }

    const packetId = this.packetIds.allocate()

    const packet: SubscribePacket = {
      type: PacketType.SUBSCRIBE,
      packetId,
      subscriptions,
      properties
    }

    // Track pending operation
    const pending: PendingSubscribe = {
      type: "subscribe",
      packetId,
      subscriptions,
      sentAt: Date.now()
    }
    this.pendingOps.set(packetId, pending)

    await this.sendPacket(packet)
    return packetId
  }

  /**
   * Unsubscribe from topics.
   *
   * @param topicFilters - Topic filters to unsubscribe
   * @param properties - UNSUBSCRIBE properties
   * @returns Packet ID
   */
  async unsubscribe(
    topicFilters: readonly string[],
    properties?: UnsubscribePacket["properties"]
  ): Promise<number> {
    if (this.state !== "connected") {
      throw new StateError(`cannot unsubscribe in state ${this.state}`, this.state)
    }

    if (topicFilters.length === 0) {
      throw new Error("topicFilters array cannot be empty")
    }

    const packetId = this.packetIds.allocate()

    const packet: UnsubscribePacket = {
      type: PacketType.UNSUBSCRIBE,
      packetId,
      topicFilters,
      properties
    }

    // Track pending operation
    const pending: PendingUnsubscribe = {
      type: "unsubscribe",
      packetId,
      topicFilters,
      sentAt: Date.now()
    }
    this.pendingOps.set(packetId, pending)

    await this.sendPacket(packet)
    return packetId
  }

  // ---------------------------------------------------------------------------
  // Ping
  // ---------------------------------------------------------------------------

  /**
   * Send PINGREQ packet.
   */
  async ping(): Promise<void> {
    if (this.state !== "connected") {
      throw new StateError(`cannot ping in state ${this.state}`, this.state)
    }

    await this.sendPacket({ type: PacketType.PINGREQ })
  }

  // ---------------------------------------------------------------------------
  // Packet Handling
  // ---------------------------------------------------------------------------

  private async handlePacket(packet: MqttPacket): Promise<void> {
    switch (packet.type) {
      case PacketType.CONNACK:
        await this.handleConnack(packet)
        break

      case PacketType.PUBLISH:
        await this.handlePublish(packet)
        break

      case PacketType.PUBACK:
        this.handlePuback(packet)
        break

      case PacketType.PUBREC:
        await this.handlePubrec(packet)
        break

      case PacketType.PUBREL:
        await this.handlePubrel(packet)
        break

      case PacketType.PUBCOMP:
        this.handlePubcomp(packet)
        break

      case PacketType.SUBACK:
        await this.handleSuback(packet)
        break

      case PacketType.UNSUBACK:
        await this.handleUnsuback(packet)
        break

      case PacketType.PINGRESP:
        // Keepalive acknowledged, nothing to do
        break

      case PacketType.DISCONNECT:
        await this.handleDisconnect(packet)
        break

      case PacketType.AUTH:
        // Extended authentication - not yet implemented
        break

      case PacketType.CONNECT:
      case PacketType.SUBSCRIBE:
      case PacketType.UNSUBSCRIBE:
      case PacketType.PINGREQ:
        // These are client-to-server packets, we should never receive them
        await this.handleProtocolError(
          new ProtocolError(`unexpected packet type ${String(packet.type)}`, 0x82)
        )
        break
    }
  }

  private async handleConnack(packet: ConnackPacket): Promise<void> {
    if (this.state !== "connecting") {
      await this.handleProtocolError(
        new ProtocolError(`unexpected CONNACK in state ${this.state}`, 0x82)
      )
      return
    }

    // Check reason code
    if (packet.reasonCode >= 0x80) {
      this.state = "disconnected"
      const error = new ProtocolError(
        `connection refused: 0x${packet.reasonCode.toString(16)}`,
        packet.reasonCode
      )
      if (this.hooks.onDisconnect) {
        await this.hooks.onDisconnect(undefined, error)
      }
      return
    }

    // Connection successful
    this.state = "connected"

    // Process CONNACK properties
    if (packet.properties) {
      if (packet.properties.receiveMaximum !== undefined) {
        this.serverReceiveMaximum = packet.properties.receiveMaximum
      }
      if (packet.properties.maximumPacketSize !== undefined) {
        this.serverMaximumPacketSize = packet.properties.maximumPacketSize
      }
      if (packet.properties.topicAliasMaximum !== undefined) {
        this.serverTopicAliasMaximum = packet.properties.topicAliasMaximum
      }
      if (packet.properties.serverKeepAlive !== undefined) {
        this.serverKeepAlive = packet.properties.serverKeepAlive
      }
      if (packet.properties.assignedClientIdentifier !== undefined) {
        this.assignedClientId = packet.properties.assignedClientIdentifier
      }
    }

    // Initialize topic alias manager
    this.topicAliases = new TopicAliasManager(
      this.serverTopicAliasMaximum,
      this.options.topicAliasMaximum
    )

    // Re-initialize QoS tracker with server's receive maximum
    // (already done in constructor, but receiveMaximum may differ)

    // Start keepalive timer
    this.startKeepalive()

    // Call hook
    if (this.hooks.onConnect) {
      await this.hooks.onConnect(packet)
    }
  }

  private async handlePublish(packet: PublishPacket): Promise<void> {
    if (this.state !== "connected") {
      return // Ignore if not connected
    }

    // Resolve topic alias
    let resolvedTopic = packet.topic
    if (this.protocolVersion === "5.0" && this.topicAliases) {
      try {
        const alias = packet.properties?.topicAlias
        resolvedTopic = this.topicAliases.resolveInbound(packet.topic, alias)
      } catch (e) {
        if (e instanceof TopicAliasError) {
          await this.handleProtocolError(new ProtocolError(e.message, 0x94))
          return
        }
        throw e
      }
    }

    // Create packet with resolved topic for the hook
    const resolvedPacket: PublishPacket =
      resolvedTopic !== packet.topic ? { ...packet, topic: resolvedTopic } : packet

    // Handle QoS acknowledgements
    if (packet.qos === 1 && packet.packetId !== undefined) {
      // QoS 1: Send PUBACK
      const puback: PubackPacket = {
        type: PacketType.PUBACK,
        packetId: packet.packetId
      }
      await this.sendPacket(puback)

      // Deliver to application
      if (this.hooks.onPublish) {
        await this.hooks.onPublish(resolvedPacket)
      }
    } else if (packet.qos === 2 && packet.packetId !== undefined) {
      // QoS 2: Check for duplicate
      const isDuplicate = this.qosFlows.hasInbound(packet.packetId)

      if (!isDuplicate) {
        // Start tracking inbound flow
        this.qosFlows.startQoS2Inbound(packet, Date.now())
      }

      // Send PUBREC (even for duplicates)
      const pubrec: PubrecPacket = {
        type: PacketType.PUBREC,
        packetId: packet.packetId
      }
      await this.sendPacket(pubrec)

      // For new messages, delivery happens after PUBREL
    } else {
      // QoS 0: Deliver immediately
      if (this.hooks.onPublish) {
        await this.hooks.onPublish(resolvedPacket)
      }
    }
  }

  private handlePuback(packet: PubackPacket): void {
    const result = this.qosFlows.handlePuback(packet)
    if (result.success && result.flow) {
      this.packetIds.release(packet.packetId)
    }
  }

  private async handlePubrec(packet: PubrecPacket): Promise<void> {
    const result = this.qosFlows.handlePubrec(packet, Date.now())
    if (result.success) {
      // Send PUBREL
      const pubrel: PubrelPacket = {
        type: PacketType.PUBREL,
        packetId: packet.packetId
      }
      await this.sendPacket(pubrel)
    }
  }

  private async handlePubrel(packet: PubrelPacket): Promise<void> {
    const flow = this.qosFlows.handlePubrel(packet)

    // Send PUBCOMP
    const pubcomp: PubcompPacket = {
      type: PacketType.PUBCOMP,
      packetId: packet.packetId
    }
    await this.sendPacket(pubcomp)

    // Deliver message if flow was found
    if (flow && this.hooks.onPublish) {
      // Resolve topic alias for delivery
      let resolvedPacket = flow.packet
      if (this.protocolVersion === "5.0" && this.topicAliases) {
        const alias = flow.packet.properties?.topicAlias
        const topic = this.topicAliases.resolveInbound(flow.packet.topic, alias)
        if (topic !== flow.packet.topic) {
          resolvedPacket = { ...flow.packet, topic }
        }
      }
      await this.hooks.onPublish(resolvedPacket)
    }
  }

  private handlePubcomp(packet: PubcompPacket): void {
    const result = this.qosFlows.handlePubcomp(packet)
    if (result.success && result.flow) {
      this.packetIds.release(packet.packetId)
    }
  }

  private async handleSuback(packet: SubackPacket): Promise<void> {
    const pending = this.pendingOps.get(packet.packetId)
    if (pending?.type !== "subscribe") {
      return // Unknown or wrong type
    }

    this.pendingOps.delete(packet.packetId)
    this.packetIds.release(packet.packetId)

    // Update subscription tracking
    for (let i = 0; i < pending.subscriptions.length; i++) {
      const sub = pending.subscriptions[i]
      const reasonCode = packet.reasonCodes[i]
      // reasonCode < 0x80 indicates success (granted QoS 0, 1, or 2)
      if (reasonCode < 0x80) {
        // Successful subscription
        this.subscriptions.set(sub.topicFilter, reasonCode)
      }
    }

    // Call hook
    if (this.hooks.onSubscribe) {
      const request: SubscribePacket = {
        type: PacketType.SUBSCRIBE,
        packetId: packet.packetId,
        subscriptions: pending.subscriptions
      }
      await this.hooks.onSubscribe(request, packet)
    }
  }

  private async handleUnsuback(packet: UnsubackPacket): Promise<void> {
    const pending = this.pendingOps.get(packet.packetId)
    if (pending?.type !== "unsubscribe") {
      return // Unknown or wrong type
    }

    this.pendingOps.delete(packet.packetId)
    this.packetIds.release(packet.packetId)

    // Update subscription tracking
    for (const filter of pending.topicFilters) {
      this.subscriptions.delete(filter)
    }

    // Call hook
    if (this.hooks.onUnsubscribe) {
      const request: UnsubscribePacket = {
        type: PacketType.UNSUBSCRIBE,
        packetId: packet.packetId,
        topicFilters: pending.topicFilters
      }
      await this.hooks.onUnsubscribe(request, packet)
    }
  }

  private async handleDisconnect(packet: DisconnectPacket): Promise<void> {
    this.cleanup()

    if (this.hooks.onDisconnect) {
      await this.hooks.onDisconnect(packet)
    }
  }

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  private async handleProtocolError(error: ProtocolError): Promise<void> {
    if (this.hooks.onError) {
      this.hooks.onError(error)
    }

    // Send DISCONNECT with reason code if connected (5.0 only)
    if (this.state === "connected" && this.protocolVersion === "5.0") {
      try {
        await this.disconnect(error.reasonCode)
      } catch {
        // Ignore errors during error handling disconnect
      }
    }

    this.cleanup()
  }

  // ---------------------------------------------------------------------------
  // Keepalive
  // ---------------------------------------------------------------------------

  private startKeepalive(): void {
    this.stopKeepalive()

    const keepAlive = this.serverKeepAlive ?? this.options.keepAlive
    if (keepAlive === 0) {
      return // Keepalive disabled
    }

    // Check at keepalive interval
    const intervalMs = keepAlive * 1000
    this.lastActivity = Date.now()

    this.keepAliveTimer = setInterval(
      () => {
        const elapsed = Date.now() - this.lastActivity

        // If no activity for keepalive period, send PINGREQ
        if (elapsed >= intervalMs) {
          this.ping().catch(() => {
            // Ignore ping errors
          })
        }

        // If no activity for 1.5x keepalive, consider connection dead
        const timeout = intervalMs * this.options.keepAliveMultiplier
        if (elapsed >= timeout) {
          void this.handleProtocolError(new ProtocolError("keepalive timeout", 0x8d))
        }
      },
      Math.floor(intervalMs / 2)
    )
  }

  private stopKeepalive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  // ---------------------------------------------------------------------------
  // Packet Sending
  // ---------------------------------------------------------------------------

  private async sendPacket(packet: MqttPacket): Promise<void> {
    const data = encodePacket(packet, this.protocolVersion)
    this.lastActivity = Date.now()
    await this.hooks.onSend(data)
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  private cleanup(): void {
    this.state = "disconnected"
    this.stopKeepalive()
    this.framer.clear()
    this.topicAliases?.clear()
    // Note: We don't clear qosFlows or pendingOps for session resumption
  }

  /**
   * Force cleanup of all state (for testing or full reset).
   */
  reset(): void {
    this.cleanup()
    this.qosFlows.clear()
    this.pendingOps.clear()
    this.packetIds.reset()
    this.subscriptions.clear()
    this.serverReceiveMaximum = 65535
    this.serverMaximumPacketSize = 268435455
    this.serverTopicAliasMaximum = 0
    this.serverKeepAlive = null
    this.assignedClientId = null
  }
}
