/**
 * State machine types for MQTT connection management (server-side).
 *
 * @packageDocumentation
 */

import type {
  ConnackPacket,
  ConnectPacket,
  DisconnectPacket,
  PublishPacket,
  SubackPacket,
  SubscribePacket,
  UnsubackPacket,
  UnsubscribePacket
} from "../packets/types.js"
import type { ReasonCode } from "../types.js"

// -----------------------------------------------------------------------------
// Connection States
// -----------------------------------------------------------------------------

/**
 * Connection state machine states (server-side).
 *
 * @see MQTT 5.0 §4.1
 */
export type ConnectionState =
  | "awaiting-connect" // Waiting for client CONNECT
  | "connected" // CONNACK sent, session active
  | "disconnected" // Connection closed

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
 * QoS 1 outbound flow state (server → client).
 *
 * Server sends PUBLISH → awaits PUBACK from client.
 */
export type QoS1OutboundFlow = {
  readonly type: "qos1-outbound"
  readonly packetId: number
  readonly packet: PublishPacket
  readonly sentAt: number
  readonly retryCount: number
}

/**
 * QoS 1 inbound flow state (client → server).
 *
 * Server receives PUBLISH → sends PUBACK to client.
 */
export type QoS1InboundFlow = {
  readonly type: "qos1-inbound"
  readonly packetId: number
  readonly packet: PublishPacket
  readonly receivedAt: number
}

/**
 * QoS 2 outbound flow states (server → client).
 *
 * Server sends PUBLISH → awaits PUBREC → sends PUBREL → awaits PUBCOMP.
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
 * QoS 2 inbound flow states (client → server).
 *
 * Server receives PUBLISH → sends PUBREC → awaits PUBREL → sends PUBCOMP.
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
 * Outbound flows (server → client).
 */
export type OutboundFlow = QoS1OutboundFlow | QoS2OutboundFlow

/**
 * Inbound flows (client → server).
 */
export type InboundFlow = QoS1InboundFlow | QoS2InboundFlow

// -----------------------------------------------------------------------------
// Lifecycle Hooks (Server-Side)
// -----------------------------------------------------------------------------

/**
 * Hook called when client sends CONNECT.
 *
 * Validates the connection request and returns CONNACK.
 * Throw an error to reject the connection.
 */
export type OnConnectHook = (packet: ConnectPacket) => ConnackPacket | Promise<ConnackPacket>

/**
 * Hook called when client sends PUBLISH.
 *
 * QoS acknowledgements (PUBACK, PUBREC) are handled automatically.
 * The packet's topic is already resolved from topic alias if applicable.
 */
export type OnPublishHook = (packet: PublishPacket) => void | Promise<void>

/**
 * Hook called when client sends SUBSCRIBE.
 *
 * Returns SUBACK with granted QoS or failure codes.
 */
export type OnSubscribeHook = (packet: SubscribePacket) => SubackPacket | Promise<SubackPacket>

/**
 * Hook called when client sends UNSUBSCRIBE.
 *
 * Returns UNSUBACK with success/failure codes.
 */
export type OnUnsubscribeHook = (
  packet: UnsubscribePacket
) => UnsubackPacket | Promise<UnsubackPacket>

/**
 * Hook called when client disconnects or connection is lost.
 */
export type OnDisconnectHook = (packet?: DisconnectPacket, reason?: Error) => void | Promise<void>

/**
 * Hook called when packet is ready to send to client.
 */
export type OnSendHook = (data: Uint8Array) => void | Promise<void>

/**
 * Hook called on protocol errors.
 */
export type OnErrorHook = (error: Error) => void

/**
 * All lifecycle hooks (server-side).
 */
export type LifecycleHooks = {
  /** Called when client sends CONNECT; return CONNACK */
  onConnect: OnConnectHook
  /** Called when client sends PUBLISH */
  onPublish?: OnPublishHook
  /** Called when client sends SUBSCRIBE; return SUBACK */
  onSubscribe?: OnSubscribeHook
  /** Called when client sends UNSUBSCRIBE; return UNSUBACK */
  onUnsubscribe?: OnUnsubscribeHook
  /** Called when connection closed */
  onDisconnect?: OnDisconnectHook
  /** Called when packet ready to send to client (required) */
  onSend: OnSendHook
  /** Called on protocol errors */
  onError?: OnErrorHook
}

// -----------------------------------------------------------------------------
// Wire Options
// -----------------------------------------------------------------------------

/**
 * Options for MqttWire (server-side).
 */
export type MqttWireOptions = {
  /** Maximum packet size to accept */
  readonly maximumPacketSize?: number
  /** Topic alias maximum (client → server) */
  readonly topicAliasMaximum?: number
  /** Keepalive timeout multiplier (default 1.5 per spec) */
  readonly keepAliveMultiplier?: number
  /** Retry interval for unacknowledged QoS messages (ms) */
  readonly retryInterval?: number
  /** Maximum retry count before giving up */
  readonly maxRetries?: number
}

/**
 * Default options.
 */
export const DEFAULT_WIRE_OPTIONS: Required<MqttWireOptions> = {
  maximumPacketSize: 268435455, // MAX_VARIABLE_BYTE_INTEGER
  topicAliasMaximum: 0,
  keepAliveMultiplier: 1.5,
  retryInterval: 5000,
  maxRetries: 3
}
