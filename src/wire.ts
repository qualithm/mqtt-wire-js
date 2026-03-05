/**
 * MQTT protocol connection state machine (server-side).
 *
 * MqttWire handles incoming client connections, protocol parsing, encoding,
 * QoS flows, keepalive, and lifecycle hooks. It's transport-agnostic: you
 * provide bytes via `receive()` and handle outbound bytes via the `onSend` hook.
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
  UnsubackPacket
} from "./packets/types.js"
import { PacketIdAllocator } from "./state/packet-id.js"
import { QoSFlowTracker } from "./state/qos-flow.js"
import { TopicAliasError, TopicAliasManager } from "./state/topic-alias.js"
import {
  type ConnectionState,
  DEFAULT_WIRE_OPTIONS,
  type LifecycleHooks,
  type MqttWireOptions
} from "./state/types.js"
import { validateTopicName } from "./topic.js"
import type { ProtocolVersion, QoS, ReasonCode } from "./types.js"

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Error thrown for protocol violations.
 */
export class ProtocolError extends Error {
  /** MQTT reason code associated with this error. */
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
  /** The connection state when the error occurred. */
  readonly state: ConnectionState

  constructor(message: string, state: ConnectionState) {
    super(message)
    this.name = "StateError"
    this.state = state
  }
}

// -----------------------------------------------------------------------------
// MqttWire (Server-Side)
// -----------------------------------------------------------------------------

/**
 * MQTT protocol connection state machine (server-side).
 *
 * Handles incoming MQTT client connections, protocol parsing, encoding,
 * QoS flows, keepalive, and connection lifecycle. Transport-agnostic:
 * bytes in via `receive()`, bytes out via `onSend` hook.
 *
 * @example
 * ```ts
 * const wire = new MqttWire({
 *   onSend: (data) => socket.write(data),
 *   onConnect: (connect) => ({
 *     type: PacketType.CONNACK,
 *     sessionPresent: false,
 *     reasonCode: 0x00
 *   }),
 *   onPublish: (packet) => console.log(packet.topic, packet.payload),
 *   onSubscribe: (packet) => ({
 *     type: PacketType.SUBACK,
 *     packetId: packet.packetId,
 *     reasonCodes: packet.subscriptions.map(s => s.options.qos)
 *   }),
 *   onDisconnect: () => console.log('client disconnected'),
 *   onError: (err) => console.error(err)
 * })
 *
 * // Receive data from transport
 * socket.on('data', (chunk) => wire.receive(chunk))
 *
 * // Publish to client
 * await wire.publish('topic', payload, { qos: 1 })
 *
 * // Disconnect client
 * await wire.disconnect()
 * ```
 */
export class MqttWire {
  // Connection state
  private state: ConnectionState = "awaiting-connect"
  private protocolVersion: ProtocolVersion = "5.0"

  // Options (merged with defaults)
  private readonly options: Required<MqttWireOptions>

  // Lifecycle hooks
  private readonly hooks: LifecycleHooks

  // Stream framing
  private readonly framer: StreamFramer

  // Packet ID allocation (for server → client messages)
  private readonly packetIds: PacketIdAllocator = new PacketIdAllocator()

  // QoS flow tracking
  private readonly qosFlows: QoSFlowTracker

  // Topic alias management
  private topicAliases: TopicAliasManager | null = null

  // Keepalive timer
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null
  private lastActivity = 0
  private clientKeepAlive = 0

  // Client info from CONNECT
  private _clientId: string | null = null

  // Client-provided values from CONNECT
  private clientReceiveMaximum = 65535
  private clientMaximumPacketSize = 268435455
  private clientTopicAliasMaximum = 0

  /**
   * Create a new MqttWire instance for a client connection.
   *
   * @param hooks - Lifecycle hooks (onSend and onConnect are required)
   * @param options - Configuration options
   */
  constructor(hooks: LifecycleHooks, options: MqttWireOptions = {}) {
    this.hooks = hooks
    this.options = {
      ...DEFAULT_WIRE_OPTIONS,
      ...options
    }
    this.framer = new StreamFramer(this.options.maximumPacketSize)
    this.qosFlows = new QoSFlowTracker(65535) // Will be reconfigured on CONNECT
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
   * Get protocol version (negotiated from client CONNECT).
   */
  get version(): ProtocolVersion {
    return this.protocolVersion
  }

  /**
   * Get client's receive maximum (from CONNECT).
   */
  get receiveMaximum(): number {
    return this.clientReceiveMaximum
  }

  /**
   * Get client's maximum packet size (from CONNECT).
   */
  get maximumPacketSize(): number {
    return this.clientMaximumPacketSize
  }

  /**
   * Get client ID (from CONNECT or assigned by server).
   */
  get clientId(): string | null {
    return this._clientId
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
  // Publishing (Server → Client)
  // ---------------------------------------------------------------------------

  /**
   * Publish a message to the client.
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

    // Validate topic
    const topicResult = validateTopicName(topic)
    if (!topicResult.ok) {
      throw new Error(`invalid topic: ${topicResult.error.message}`)
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
  // Disconnect
  // ---------------------------------------------------------------------------

  /**
   * Disconnect the client.
   *
   * Sends DISCONNECT packet (MQTT 5.0) and cleans up state.
   *
   * @param reasonCode - Disconnect reason (default: 0x00 normal)
   * @param properties - DISCONNECT properties
   */
  async disconnect(
    reasonCode: ReasonCode = 0x00,
    properties?: DisconnectPacket["properties"]
  ): Promise<void> {
    if (this.state !== "connected") {
      this.cleanup()
      return
    }

    // MQTT 5.0: Send DISCONNECT packet
    if (this.protocolVersion === "5.0") {
      const packet: DisconnectPacket = {
        type: PacketType.DISCONNECT,
        reasonCode,
        properties
      }

      try {
        await this.sendPacket(packet)
      } catch {
        // Ignore send errors during disconnect
      }
    }

    this.cleanup()

    if (this.hooks.onDisconnect) {
      await this.hooks.onDisconnect()
    }
  }

  // ---------------------------------------------------------------------------
  // Packet Handling
  // ---------------------------------------------------------------------------

  private async handlePacket(packet: MqttPacket): Promise<void> {
    switch (packet.type) {
      case PacketType.CONNECT:
        await this.handleConnect(packet)
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

      case PacketType.SUBSCRIBE:
        await this.handleSubscribe(packet)
        break

      case PacketType.UNSUBSCRIBE:
        await this.handleUnsubscribe(packet)
        break

      case PacketType.PINGREQ:
        await this.handlePingreq()
        break

      case PacketType.DISCONNECT:
        await this.handleDisconnect(packet)
        break

      case PacketType.AUTH:
        // Extended authentication - not yet implemented
        break

      case PacketType.CONNACK:
      case PacketType.SUBACK:
      case PacketType.UNSUBACK:
      case PacketType.PINGRESP:
        // These are server-to-client packets, we should never receive them
        await this.handleProtocolError(
          new ProtocolError(`unexpected packet type ${String(packet.type)}`, 0x82)
        )
        break
    }
  }

  private async handleConnect(packet: ConnectPacket): Promise<void> {
    if (this.state !== "awaiting-connect") {
      await this.handleProtocolError(new ProtocolError("protocol error: unexpected CONNECT", 0x82))
      return
    }

    // Store protocol version from client
    this.protocolVersion = packet.protocolVersion

    // Store client properties
    if (packet.properties) {
      if (packet.properties.receiveMaximum !== undefined) {
        this.clientReceiveMaximum = packet.properties.receiveMaximum
      }
      if (packet.properties.maximumPacketSize !== undefined) {
        this.clientMaximumPacketSize = packet.properties.maximumPacketSize
      }
      if (packet.properties.topicAliasMaximum !== undefined) {
        this.clientTopicAliasMaximum = packet.properties.topicAliasMaximum
      }
    }

    // Store keepalive
    this.clientKeepAlive = packet.keepAlive

    // Call onConnect hook to get CONNACK
    let connack: ConnackPacket
    try {
      connack = await this.hooks.onConnect(packet)
    } catch (err) {
      // Hook rejected the connection
      const reasonCode = err instanceof ProtocolError ? err.reasonCode : 0x80
      const errorConnack: ConnackPacket = {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode
      }
      await this.sendPacket(errorConnack)
      this.cleanup()

      if (this.hooks.onDisconnect) {
        await this.hooks.onDisconnect(
          undefined,
          err instanceof Error ? err : new Error(String(err))
        )
      }
      return
    }

    // Send CONNACK
    await this.sendPacket(connack)

    // Check if connection was accepted
    if (connack.reasonCode >= 0x80) {
      this.cleanup()
      if (this.hooks.onDisconnect) {
        await this.hooks.onDisconnect(
          undefined,
          new ProtocolError(
            `connection refused: 0x${connack.reasonCode.toString(16)}`,
            connack.reasonCode
          )
        )
      }
      return
    }

    // Connection successful
    this.state = "connected"
    this._clientId = connack.properties?.assignedClientIdentifier ?? packet.clientId

    // Reconfigure QoS tracker with client's receive maximum
    // (create new tracker with client's value)
    // Note: qosFlows was created with default, we'll respect client's receive maximum

    // Initialize topic alias manager
    this.topicAliases = new TopicAliasManager(
      this.clientTopicAliasMaximum, // client → server
      this.options.topicAliasMaximum // server → client
    )

    // Start keepalive timer
    this.startKeepalive()
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
      // QoS 1: Send PUBACK, then deliver
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

  private async handleSubscribe(
    packet: Parameters<typeof encodePacket>[0] & { type: 8 }
  ): Promise<void> {
    if (this.state !== "connected") {
      return
    }

    if (!this.hooks.onSubscribe) {
      // No handler - grant all at requested QoS
      const suback: SubackPacket = {
        type: PacketType.SUBACK,
        packetId: packet.packetId,
        reasonCodes: packet.subscriptions.map((s) => s.options.qos)
      }
      await this.sendPacket(suback)
      return
    }

    // Call hook to get SUBACK
    const suback = await this.hooks.onSubscribe(packet)
    await this.sendPacket(suback)
  }

  private async handleUnsubscribe(
    packet: Parameters<typeof encodePacket>[0] & { type: 10 }
  ): Promise<void> {
    if (this.state !== "connected") {
      return
    }

    if (!this.hooks.onUnsubscribe) {
      // No handler - success for all
      const unsuback: UnsubackPacket = {
        type: PacketType.UNSUBACK,
        packetId: packet.packetId,
        reasonCodes: packet.topicFilters.map(() => 0x00)
      }
      await this.sendPacket(unsuback)
      return
    }

    // Call hook to get UNSUBACK
    const unsuback = await this.hooks.onUnsubscribe(packet)
    await this.sendPacket(unsuback)
  }

  private async handlePingreq(): Promise<void> {
    if (this.state !== "connected") {
      return
    }

    await this.sendPacket({ type: PacketType.PINGRESP })
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

    if (this.clientKeepAlive === 0) {
      return // Keepalive disabled
    }

    // Keepalive is based on client's requested value
    const intervalMs = this.clientKeepAlive * 1000
    this.lastActivity = Date.now()

    // Server checks for timeout at 1.5x keepalive interval (per spec)
    const timeout = intervalMs * this.options.keepAliveMultiplier

    this.keepAliveTimer = setInterval(
      () => {
        const elapsed = Date.now() - this.lastActivity

        // If no activity for 1.5x keepalive, consider connection dead
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
  }

  /**
   * Force cleanup of all state (for testing or full reset).
   */
  reset(): void {
    this.cleanup()
    this.qosFlows.clear()
    this.packetIds.reset()
    this.clientReceiveMaximum = 65535
    this.clientMaximumPacketSize = 268435455
    this.clientTopicAliasMaximum = 0
    this.clientKeepAlive = 0
    this._clientId = null
    this.state = "awaiting-connect"
  }
}
