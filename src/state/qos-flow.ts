/**
 * QoS flow tracking for reliable message delivery.
 *
 * Tracks QoS 1 and QoS 2 message flows in both directions, managing
 * the protocol state machine for each inflight message.
 *
 * @see MQTT 5.0 §4.3 (QoS), §4.4 (Message delivery retry)
 * @packageDocumentation
 */

import type {
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket
} from "../packets/types.js"
import type { OutboundFlow, QoS1OutboundFlow, QoS2InboundFlow, QoS2OutboundFlow } from "./types.js"

// -----------------------------------------------------------------------------
// Flow Tracker
// -----------------------------------------------------------------------------

/**
 * Result of processing an acknowledgement.
 */
export type AckResult = {
  readonly success: boolean
  readonly flow?: OutboundFlow
  readonly reason?: string
}

/**
 * Tracks QoS message flows for reliable delivery.
 *
 * Maintains separate maps for outbound (client→server) and inbound
 * (server→client) flows. Enforces receive maximum for flow control.
 *
 * @example
 * ```ts
 * const tracker = new QoSFlowTracker(65535)
 *
 * // Start QoS 1 outbound flow
 * tracker.startOutbound(publishPacket, Date.now())
 *
 * // Process PUBACK
 * const result = tracker.handlePuback(pubackPacket)
 * if (result.success) {
 *   // Flow complete, ID can be released
 * }
 * ```
 */
export class QoSFlowTracker {
  /** Outbound flows awaiting acknowledgement */
  private readonly outbound = new Map<number, OutboundFlow>()
  /** Inbound QoS 2 flows awaiting PUBREL */
  private readonly inbound = new Map<number, QoS2InboundFlow>()
  /** Maximum concurrent outbound flows */
  private readonly receiveMaximum: number

  /**
   * Create a QoS flow tracker.
   *
   * @param receiveMaximum - Maximum concurrent outbound QoS > 0 messages
   */
  constructor(receiveMaximum = 65535) {
    this.receiveMaximum = Math.max(1, Math.min(65535, receiveMaximum))
  }

  // ---------------------------------------------------------------------------
  // Outbound Flows (Client → Server)
  // ---------------------------------------------------------------------------

  /**
   * Check if we can send another QoS > 0 message.
   *
   * @returns true if under receive maximum
   */
  canSendOutbound(): boolean {
    return this.outbound.size < this.receiveMaximum
  }

  /**
   * Get current outbound flow count.
   */
  get outboundCount(): number {
    return this.outbound.size
  }

  /**
   * Start tracking an outbound QoS 1 flow.
   *
   * @param packet - PUBLISH packet being sent
   * @param timestamp - Send timestamp
   */
  startQoS1Outbound(packet: PublishPacket, timestamp: number): void {
    if (packet.packetId === undefined) {
      throw new Error("QoS 1 packet must have packetId")
    }

    const flow: QoS1OutboundFlow = {
      type: "qos1-outbound",
      packetId: packet.packetId,
      packet,
      sentAt: timestamp,
      retryCount: 0
    }
    this.outbound.set(packet.packetId, flow)
  }

  /**
   * Start tracking an outbound QoS 2 flow.
   *
   * @param packet - PUBLISH packet being sent
   * @param timestamp - Send timestamp
   */
  startQoS2Outbound(packet: PublishPacket, timestamp: number): void {
    if (packet.packetId === undefined) {
      throw new Error("QoS 2 packet must have packetId")
    }

    const flow: QoS2OutboundFlow = {
      type: "qos2-outbound",
      packetId: packet.packetId,
      packet,
      state: "awaiting-pubrec",
      sentAt: timestamp,
      retryCount: 0
    }
    this.outbound.set(packet.packetId, flow)
  }

  /**
   * Handle PUBACK for outbound QoS 1.
   *
   * @param packet - PUBACK packet received
   * @returns Result with completed flow or error
   */
  handlePuback(packet: PubackPacket): AckResult {
    const flow = this.outbound.get(packet.packetId)
    if (!flow) {
      return { success: false, reason: "unknown packet ID" }
    }
    if (flow.type !== "qos1-outbound") {
      return { success: false, reason: `unexpected PUBACK for ${flow.type}` }
    }

    this.outbound.delete(packet.packetId)
    return { success: true, flow }
  }

  /**
   * Handle PUBREC for outbound QoS 2 (step 2).
   *
   * Transitions flow from awaiting-pubrec to awaiting-pubcomp.
   *
   * @param packet - PUBREC packet received
   * @param timestamp - Timestamp for retry tracking
   * @returns Result with updated flow or error
   */
  handlePubrec(packet: PubrecPacket, timestamp: number): AckResult {
    const flow = this.outbound.get(packet.packetId)
    if (!flow) {
      return { success: false, reason: "unknown packet ID" }
    }
    if (flow.type !== "qos2-outbound") {
      return { success: false, reason: `unexpected PUBREC for ${flow.type}` }
    }
    if (flow.state !== "awaiting-pubrec") {
      return { success: false, reason: `unexpected PUBREC in state ${flow.state}` }
    }

    // Check for error reason codes
    const reasonCode = packet.reasonCode ?? 0x00
    if (reasonCode >= 0x80) {
      // Error - flow terminates
      this.outbound.delete(packet.packetId)
      return { success: false, flow, reason: `PUBREC error: 0x${reasonCode.toString(16)}` }
    }

    // Transition to awaiting-pubcomp
    const updated: QoS2OutboundFlow = {
      ...flow,
      state: "awaiting-pubcomp",
      sentAt: timestamp,
      retryCount: 0
    }
    this.outbound.set(packet.packetId, updated)
    return { success: true, flow: updated }
  }

  /**
   * Handle PUBCOMP for outbound QoS 2 (step 4).
   *
   * Completes the QoS 2 flow.
   *
   * @param packet - PUBCOMP packet received
   * @returns Result with completed flow or error
   */
  handlePubcomp(packet: PubcompPacket): AckResult {
    const flow = this.outbound.get(packet.packetId)
    if (!flow) {
      return { success: false, reason: "unknown packet ID" }
    }
    if (flow.type !== "qos2-outbound") {
      return { success: false, reason: `unexpected PUBCOMP for ${flow.type}` }
    }
    if (flow.state !== "awaiting-pubcomp") {
      return { success: false, reason: `unexpected PUBCOMP in state ${flow.state}` }
    }

    this.outbound.delete(packet.packetId)
    return { success: true, flow }
  }

  /**
   * Get an outbound flow by packet ID.
   */
  getOutbound(packetId: number): OutboundFlow | undefined {
    return this.outbound.get(packetId)
  }

  /**
   * Get all outbound flows (for session persistence).
   */
  getAllOutbound(): ReadonlyMap<number, OutboundFlow> {
    return this.outbound
  }

  // ---------------------------------------------------------------------------
  // Inbound Flows (Server → Client)
  // ---------------------------------------------------------------------------

  /**
   * Get current inbound QoS 2 flow count.
   */
  get inboundCount(): number {
    return this.inbound.size
  }

  /**
   * Start tracking an inbound QoS 2 flow.
   *
   * Called when we receive a QoS 2 PUBLISH and send PUBREC.
   *
   * @param packet - PUBLISH packet received
   * @param timestamp - Receive timestamp
   */
  startQoS2Inbound(packet: PublishPacket, timestamp: number): void {
    if (packet.packetId === undefined) {
      throw new Error("QoS 2 packet must have packetId")
    }

    const flow: QoS2InboundFlow = {
      type: "qos2-inbound",
      packetId: packet.packetId,
      packet,
      state: "awaiting-pubrel",
      receivedAt: timestamp
    }
    this.inbound.set(packet.packetId, flow)
  }

  /**
   * Handle PUBREL for inbound QoS 2 (step 3).
   *
   * Completes the inbound QoS 2 flow.
   *
   * @param packet - PUBREL packet received
   * @returns The completed flow or undefined if not found
   */
  handlePubrel(packet: PubrelPacket): QoS2InboundFlow | undefined {
    const flow = this.inbound.get(packet.packetId)
    if (!flow) {
      return undefined
    }

    this.inbound.delete(packet.packetId)
    return flow
  }

  /**
   * Check if we have an inbound QoS 2 flow for a packet ID.
   *
   * Used to detect duplicate QoS 2 PUBLISH.
   */
  hasInbound(packetId: number): boolean {
    return this.inbound.has(packetId)
  }

  /**
   * Get an inbound flow by packet ID.
   */
  getInbound(packetId: number): QoS2InboundFlow | undefined {
    return this.inbound.get(packetId)
  }

  /**
   * Get all inbound flows (for session persistence).
   */
  getAllInbound(): ReadonlyMap<number, QoS2InboundFlow> {
    return this.inbound
  }

  // ---------------------------------------------------------------------------
  // Retry Support
  // ---------------------------------------------------------------------------

  /**
   * Increment retry count for an outbound flow.
   *
   * @param packetId - Packet ID to update
   * @param timestamp - New send timestamp
   * @returns Updated flow or undefined if not found
   */
  incrementRetry(packetId: number, timestamp: number): OutboundFlow | undefined {
    const flow = this.outbound.get(packetId)
    if (!flow) {
      return undefined
    }

    const updated: OutboundFlow = {
      ...flow,
      sentAt: timestamp,
      retryCount: flow.retryCount + 1
    }
    this.outbound.set(packetId, updated)
    return updated
  }

  /**
   * Get flows that need retry (exceeded timeout).
   *
   * @param timeout - Retry timeout in milliseconds
   * @param now - Current timestamp
   * @returns Array of flows needing retry
   */
  getFlowsNeedingRetry(timeout: number, now: number): OutboundFlow[] {
    const result: OutboundFlow[] = []
    for (const flow of this.outbound.values()) {
      if (now - flow.sentAt >= timeout) {
        result.push(flow)
      }
    }
    return result
  }

  // ---------------------------------------------------------------------------
  // Session Management
  // ---------------------------------------------------------------------------

  /**
   * Restore flows from session state.
   */
  restore(outbound: Iterable<OutboundFlow>, inbound: Iterable<QoS2InboundFlow>): void {
    for (const flow of outbound) {
      this.outbound.set(flow.packetId, flow)
    }
    for (const flow of inbound) {
      this.inbound.set(flow.packetId, flow)
    }
  }

  /**
   * Clear all flows.
   */
  clear(): void {
    this.outbound.clear()
    this.inbound.clear()
  }
}
