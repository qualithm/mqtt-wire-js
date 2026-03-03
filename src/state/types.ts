/**
 * State machine types for MQTT connection management.
 *
 * @packageDocumentation
 */

import type {
  ConnackPacket,
  DisconnectPacket,
  PublishPacket,
  SubackPacket,
  SubscribePacket,
  Subscription,
  UnsubackPacket,
  UnsubscribePacket
} from "../packets/types.js"
import type { ReasonCode } from "../types.js"

// -----------------------------------------------------------------------------
// Connection States
// -----------------------------------------------------------------------------

/**
 * Connection state machine states.
 *
 * @see MQTT 5.0 §4.1
 */
export type ConnectionState =
  | "disconnected" // Not connected, no session
  | "connecting" // CONNECT sent, awaiting CONNACK
  | "connected" // CONNACK received, session active
  | "disconnecting" // DISCONNECT sent, awaiting close

/**
 * Connection state change event.
 */
export type ConnectionStateChange = {
  readonly previous: ConnectionState
  readonly current: ConnectionState
  readonly reason?: ReasonCode
  readonly timestamp: number
}

// -----------------------------------------------------------------------------
// QoS Flow States
// -----------------------------------------------------------------------------

/**
 * QoS 1 outbound flow state.
 *
 * Client sends PUBLISH → awaits PUBACK.
 */
export type QoS1OutboundFlow = {
  readonly type: "qos1-outbound"
  readonly packetId: number
  readonly packet: PublishPacket
  readonly sentAt: number
  readonly retryCount: number
}

/**
 * QoS 1 inbound flow state.
 *
 * Client receives PUBLISH → sends PUBACK.
 */
export type QoS1InboundFlow = {
  readonly type: "qos1-inbound"
  readonly packetId: number
  readonly packet: PublishPacket
  readonly receivedAt: number
}

/**
 * QoS 2 outbound flow states.
 *
 * Client sends PUBLISH → awaits PUBREC → sends PUBREL → awaits PUBCOMP.
 */
export type QoS2OutboundState =
  | "awaiting-pubrec" // PUBLISH sent, awaiting PUBREC
  | "awaiting-pubcomp" // PUBREL sent, awaiting PUBCOMP

export type QoS2OutboundFlow = {
  readonly type: "qos2-outbound"
  readonly packetId: number
  readonly packet: PublishPacket
  readonly state: QoS2OutboundState
  readonly sentAt: number
  readonly retryCount: number
}

/**
 * QoS 2 inbound flow states.
 *
 * Client receives PUBLISH → sends PUBREC → awaits PUBREL → sends PUBCOMP.
 */
export type QoS2InboundState = "awaiting-pubrel" // PUBREC sent, awaiting PUBREL

export type QoS2InboundFlow = {
  readonly type: "qos2-inbound"
  readonly packetId: number
  readonly packet: PublishPacket
  readonly state: QoS2InboundState
  readonly receivedAt: number
}

/**
 * Any QoS flow (outbound or inbound).
 */
export type QoSFlow = QoS1OutboundFlow | QoS1InboundFlow | QoS2OutboundFlow | QoS2InboundFlow

/**
 * Outbound flows (client → server).
 */
export type OutboundFlow = QoS1OutboundFlow | QoS2OutboundFlow

/**
 * Inbound flows (server → client).
 */
export type InboundFlow = QoS1InboundFlow | QoS2InboundFlow

// -----------------------------------------------------------------------------
// Pending Operations
// -----------------------------------------------------------------------------

/**
 * Pending SUBSCRIBE operation.
 */
export type PendingSubscribe = {
  readonly type: "subscribe"
  readonly packetId: number
  readonly subscriptions: readonly Subscription[]
  readonly sentAt: number
}

/**
 * Pending UNSUBSCRIBE operation.
 */
export type PendingUnsubscribe = {
  readonly type: "unsubscribe"
  readonly packetId: number
  readonly topicFilters: readonly string[]
  readonly sentAt: number
}

/**
 * Any pending operation awaiting acknowledgement.
 */
export type PendingOperation = PendingSubscribe | PendingUnsubscribe

// -----------------------------------------------------------------------------
// Session State
// -----------------------------------------------------------------------------

/**
 * Session state persisted across connections (MQTT 5.0 §4.1).
 *
 * When cleanStart=false, this state is preserved.
 */
export type SessionState = {
  /** Client identifier */
  readonly clientId: string
  /** Outbound QoS flows waiting for acknowledgement */
  readonly outboundFlows: Map<number, OutboundFlow>
  /** Inbound QoS 2 flows waiting for completion */
  readonly inboundFlows: Map<number, QoS2InboundFlow>
  /** Pending SUBSCRIBE/UNSUBSCRIBE operations */
  readonly pendingOperations: Map<number, PendingOperation>
  /** Active subscriptions (topic filter → granted QoS) */
  readonly subscriptions: Map<string, number>
  /** Session expiry timestamp (0 = never) */
  readonly expiresAt: number
}

// -----------------------------------------------------------------------------
// Lifecycle Hooks
// -----------------------------------------------------------------------------

/**
 * Hook called when connection is established.
 */
export type OnConnectHook = (packet: ConnackPacket) => void | Promise<void>

/**
 * Hook called when a PUBLISH is received.
 */
export type OnPublishHook = (packet: PublishPacket) => void | Promise<void>

/**
 * Hook called when SUBSCRIBE is acknowledged.
 */
export type OnSubscribeHook = (
  request: SubscribePacket,
  response: SubackPacket
) => void | Promise<void>

/**
 * Hook called when UNSUBSCRIBE is acknowledged.
 */
export type OnUnsubscribeHook = (
  request: UnsubscribePacket,
  response: UnsubackPacket
) => void | Promise<void>

/**
 * Hook called when connection is closed.
 */
export type OnDisconnectHook = (packet?: DisconnectPacket, reason?: Error) => void | Promise<void>

/**
 * Hook called when packet is ready to send.
 */
export type OnSendHook = (data: Uint8Array) => void | Promise<void>

/**
 * Hook called on protocol errors.
 */
export type OnErrorHook = (error: Error) => void

/**
 * All lifecycle hooks.
 */
export type LifecycleHooks = {
  /** Called when connection established (CONNACK received) */
  onConnect?: OnConnectHook
  /** Called when PUBLISH received */
  onPublish?: OnPublishHook
  /** Called when SUBACK received */
  onSubscribe?: OnSubscribeHook
  /** Called when UNSUBACK received */
  onUnsubscribe?: OnUnsubscribeHook
  /** Called when connection closed */
  onDisconnect?: OnDisconnectHook
  /** Called when packet ready to send (required) */
  onSend: OnSendHook
  /** Called on protocol errors */
  onError?: OnErrorHook
}

// -----------------------------------------------------------------------------
// Wire Options
// -----------------------------------------------------------------------------

/**
 * Options for MqttWire.
 */
export type MqttWireOptions = {
  /** MQTT protocol version */
  readonly protocolVersion?: "3.1.1" | "5.0"
  /** Receive maximum (max inflight QoS > 0 messages) */
  readonly receiveMaximum?: number
  /** Maximum packet size */
  readonly maximumPacketSize?: number
  /** Topic alias maximum (client → server) */
  readonly topicAliasMaximum?: number
  /** Session expiry interval (seconds, 0 = on disconnect) */
  readonly sessionExpiryInterval?: number
  /** Keepalive interval (seconds, 0 = disabled) */
  readonly keepAlive?: number
  /** Keepalive timeout multiplier (default 1.5 per spec) */
  readonly keepAliveMultiplier?: number
  /** Auto-reconnect on disconnect */
  readonly autoReconnect?: boolean
  /** Retry interval for unacknowledged QoS messages (ms) */
  readonly retryInterval?: number
  /** Maximum retry count before giving up */
  readonly maxRetries?: number
}

/**
 * Default options.
 */
export const DEFAULT_WIRE_OPTIONS: Required<Omit<MqttWireOptions, "protocolVersion">> & {
  protocolVersion: "5.0"
} = {
  protocolVersion: "5.0",
  receiveMaximum: 65535,
  maximumPacketSize: 268435455, // MAX_VARIABLE_BYTE_INTEGER
  topicAliasMaximum: 0,
  sessionExpiryInterval: 0,
  keepAlive: 60,
  keepAliveMultiplier: 1.5,
  autoReconnect: false,
  retryInterval: 5000,
  maxRetries: 3
}
