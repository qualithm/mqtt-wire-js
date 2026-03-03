/**
 * MQTT packet type definitions.
 *
 * All 15 MQTT control packet types as a discriminated union.
 * Supports both MQTT 3.1.1 and 5.0.
 *
 * @packageDocumentation
 */

import type { PacketType } from "../constants.js"
import type { ProtocolVersion, QoS, ReasonCode } from "../types.js"

// -----------------------------------------------------------------------------
// Common Types
// -----------------------------------------------------------------------------

/**
 * User property key-value pair (MQTT 5.0).
 */
export type UserProperty = readonly [key: string, value: string]

/**
 * Subscription options for SUBSCRIBE packet.
 */
export type SubscriptionOptions = {
  /** Maximum QoS level */
  readonly qos: QoS
  /** No local: don't receive own publishes (5.0) */
  readonly noLocal?: boolean
  /** Retain as published (5.0) */
  readonly retainAsPublished?: boolean
  /** Retain handling (5.0): 0=send, 1=send if new, 2=don't send */
  readonly retainHandling?: 0 | 1 | 2
}

/**
 * Topic subscription with filter and options.
 */
export type Subscription = {
  /** Topic filter (may contain wildcards) */
  readonly topicFilter: string
  /** Subscription options */
  readonly options: SubscriptionOptions
}

// -----------------------------------------------------------------------------
// Will Message
// -----------------------------------------------------------------------------

/**
 * Will message sent on unexpected disconnect.
 */
export type WillMessage = {
  /** Will topic */
  readonly topic: string
  /** Will payload */
  readonly payload: Uint8Array
  /** Will QoS */
  readonly qos: QoS
  /** Retain flag */
  readonly retain: boolean
  /** Will properties (5.0) */
  readonly properties?: WillProperties
}

/**
 * Will message properties (MQTT 5.0).
 */
export type WillProperties = {
  /** Delay before publishing will (seconds) */
  readonly willDelayInterval?: number
  /** Payload format: 0=bytes, 1=UTF-8 */
  readonly payloadFormatIndicator?: 0 | 1
  /** Message expiry (seconds) */
  readonly messageExpiryInterval?: number
  /** Content type (MIME) */
  readonly contentType?: string
  /** Response topic */
  readonly responseTopic?: string
  /** Correlation data */
  readonly correlationData?: Uint8Array
  /** User properties */
  readonly userProperties?: readonly UserProperty[]
}

// -----------------------------------------------------------------------------
// CONNECT (§3.1)
// -----------------------------------------------------------------------------

/**
 * CONNECT properties (MQTT 5.0).
 */
export type ConnectProperties = {
  /** Session expiry interval (seconds) */
  readonly sessionExpiryInterval?: number
  /** Receive maximum (inflight QoS > 0 messages) */
  readonly receiveMaximum?: number
  /** Maximum packet size client will accept */
  readonly maximumPacketSize?: number
  /** Topic alias maximum */
  readonly topicAliasMaximum?: number
  /** Request response information */
  readonly requestResponseInformation?: boolean
  /** Request problem information */
  readonly requestProblemInformation?: boolean
  /** Authentication method */
  readonly authenticationMethod?: string
  /** Authentication data */
  readonly authenticationData?: Uint8Array
  /** User properties */
  readonly userProperties?: readonly UserProperty[]
}

/**
 * CONNECT packet - Client requests connection to server.
 *
 * @see MQTT 5.0 §3.1
 */
export type ConnectPacket = {
  readonly type: typeof PacketType.CONNECT
  /** Protocol version */
  readonly protocolVersion: ProtocolVersion
  /** Client identifier */
  readonly clientId: string
  /** Clean start / clean session */
  readonly cleanStart: boolean
  /** Keep alive interval (seconds) */
  readonly keepAlive: number
  /** Username (optional) */
  readonly username?: string
  /** Password (optional) */
  readonly password?: Uint8Array
  /** Will message (optional) */
  readonly will?: WillMessage
  /** CONNECT properties (5.0) */
  readonly properties?: ConnectProperties
}

// -----------------------------------------------------------------------------
// CONNACK (§3.2)
// -----------------------------------------------------------------------------

/**
 * CONNACK properties (MQTT 5.0).
 */
export type ConnackProperties = {
  /** Session expiry interval */
  readonly sessionExpiryInterval?: number
  /** Receive maximum */
  readonly receiveMaximum?: number
  /** Maximum QoS supported */
  readonly maximumQoS?: QoS
  /** Retain available */
  readonly retainAvailable?: boolean
  /** Maximum packet size */
  readonly maximumPacketSize?: number
  /** Assigned client identifier */
  readonly assignedClientIdentifier?: string
  /** Topic alias maximum */
  readonly topicAliasMaximum?: number
  /** Reason string */
  readonly reasonString?: string
  /** Wildcard subscription available */
  readonly wildcardSubscriptionAvailable?: boolean
  /** Subscription identifiers available */
  readonly subscriptionIdentifiersAvailable?: boolean
  /** Shared subscription available */
  readonly sharedSubscriptionAvailable?: boolean
  /** Server keep alive */
  readonly serverKeepAlive?: number
  /** Response information */
  readonly responseInformation?: string
  /** Server reference */
  readonly serverReference?: string
  /** Authentication method */
  readonly authenticationMethod?: string
  /** Authentication data */
  readonly authenticationData?: Uint8Array
  /** User properties */
  readonly userProperties?: readonly UserProperty[]
}

/**
 * CONNACK packet - Server acknowledges connection.
 *
 * @see MQTT 5.0 §3.2
 */
export type ConnackPacket = {
  readonly type: typeof PacketType.CONNACK
  /** Session present flag */
  readonly sessionPresent: boolean
  /** Reason code (5.0) or return code (3.1.1) */
  readonly reasonCode: ReasonCode
  /** CONNACK properties (5.0) */
  readonly properties?: ConnackProperties
}

// -----------------------------------------------------------------------------
// PUBLISH (§3.3)
// -----------------------------------------------------------------------------

/**
 * PUBLISH properties (MQTT 5.0).
 */
export type PublishProperties = {
  /** Payload format indicator: 0=bytes, 1=UTF-8 */
  readonly payloadFormatIndicator?: 0 | 1
  /** Message expiry interval (seconds) */
  readonly messageExpiryInterval?: number
  /** Topic alias */
  readonly topicAlias?: number
  /** Response topic */
  readonly responseTopic?: string
  /** Correlation data */
  readonly correlationData?: Uint8Array
  /** Subscription identifiers */
  readonly subscriptionIdentifiers?: readonly number[]
  /** Content type (MIME) */
  readonly contentType?: string
  /** User properties */
  readonly userProperties?: readonly UserProperty[]
}

/**
 * PUBLISH packet - Publish message.
 *
 * @see MQTT 5.0 §3.3
 */
export type PublishPacket = {
  readonly type: typeof PacketType.PUBLISH
  /** Topic name */
  readonly topic: string
  /** Packet identifier (QoS > 0 only) */
  readonly packetId?: number
  /** QoS level */
  readonly qos: QoS
  /** Retain flag */
  readonly retain: boolean
  /** Duplicate delivery flag */
  readonly dup: boolean
  /** Message payload */
  readonly payload: Uint8Array
  /** PUBLISH properties (5.0) */
  readonly properties?: PublishProperties
}

// -----------------------------------------------------------------------------
// PUBACK (§3.4)
// -----------------------------------------------------------------------------

/**
 * PUBACK/PUBREC/PUBREL/PUBCOMP properties (MQTT 5.0).
 */
export type PubAckProperties = {
  /** Reason string */
  readonly reasonString?: string
  /** User properties */
  readonly userProperties?: readonly UserProperty[]
}

/**
 * PUBACK packet - Publish acknowledgement (QoS 1).
 *
 * @see MQTT 5.0 §3.4
 */
export type PubackPacket = {
  readonly type: typeof PacketType.PUBACK
  /** Packet identifier */
  readonly packetId: number
  /** Reason code (5.0, defaults to 0x00) */
  readonly reasonCode?: ReasonCode
  /** PUBACK properties (5.0) */
  readonly properties?: PubAckProperties
}

// -----------------------------------------------------------------------------
// PUBREC (§3.5)
// -----------------------------------------------------------------------------

/**
 * PUBREC packet - Publish received (QoS 2, part 1).
 *
 * @see MQTT 5.0 §3.5
 */
export type PubrecPacket = {
  readonly type: typeof PacketType.PUBREC
  /** Packet identifier */
  readonly packetId: number
  /** Reason code (5.0, defaults to 0x00) */
  readonly reasonCode?: ReasonCode
  /** PUBREC properties (5.0) */
  readonly properties?: PubAckProperties
}

// -----------------------------------------------------------------------------
// PUBREL (§3.6)
// -----------------------------------------------------------------------------

/**
 * PUBREL packet - Publish release (QoS 2, part 2).
 *
 * @see MQTT 5.0 §3.6
 */
export type PubrelPacket = {
  readonly type: typeof PacketType.PUBREL
  /** Packet identifier */
  readonly packetId: number
  /** Reason code (5.0, defaults to 0x00) */
  readonly reasonCode?: ReasonCode
  /** PUBREL properties (5.0) */
  readonly properties?: PubAckProperties
}

// -----------------------------------------------------------------------------
// PUBCOMP (§3.7)
// -----------------------------------------------------------------------------

/**
 * PUBCOMP packet - Publish complete (QoS 2, part 3).
 *
 * @see MQTT 5.0 §3.7
 */
export type PubcompPacket = {
  readonly type: typeof PacketType.PUBCOMP
  /** Packet identifier */
  readonly packetId: number
  /** Reason code (5.0, defaults to 0x00) */
  readonly reasonCode?: ReasonCode
  /** PUBCOMP properties (5.0) */
  readonly properties?: PubAckProperties
}

// -----------------------------------------------------------------------------
// SUBSCRIBE (§3.8)
// -----------------------------------------------------------------------------

/**
 * SUBSCRIBE properties (MQTT 5.0).
 */
export type SubscribeProperties = {
  /** Subscription identifier */
  readonly subscriptionIdentifier?: number
  /** User properties */
  readonly userProperties?: readonly UserProperty[]
}

/**
 * SUBSCRIBE packet - Subscribe to topics.
 *
 * @see MQTT 5.0 §3.8
 */
export type SubscribePacket = {
  readonly type: typeof PacketType.SUBSCRIBE
  /** Packet identifier */
  readonly packetId: number
  /** Topic subscriptions (at least one) */
  readonly subscriptions: readonly Subscription[]
  /** SUBSCRIBE properties (5.0) */
  readonly properties?: SubscribeProperties
}

// -----------------------------------------------------------------------------
// SUBACK (§3.9)
// -----------------------------------------------------------------------------

/**
 * SUBACK properties (MQTT 5.0).
 */
export type SubackProperties = {
  /** Reason string */
  readonly reasonString?: string
  /** User properties */
  readonly userProperties?: readonly UserProperty[]
}

/**
 * SUBACK packet - Subscribe acknowledgement.
 *
 * @see MQTT 5.0 §3.9
 */
export type SubackPacket = {
  readonly type: typeof PacketType.SUBACK
  /** Packet identifier */
  readonly packetId: number
  /** Reason codes for each subscription */
  readonly reasonCodes: readonly ReasonCode[]
  /** SUBACK properties (5.0) */
  readonly properties?: SubackProperties
}

// -----------------------------------------------------------------------------
// UNSUBSCRIBE (§3.10)
// -----------------------------------------------------------------------------

/**
 * UNSUBSCRIBE properties (MQTT 5.0).
 */
export type UnsubscribeProperties = {
  /** User properties */
  readonly userProperties?: readonly UserProperty[]
}

/**
 * UNSUBSCRIBE packet - Unsubscribe from topics.
 *
 * @see MQTT 5.0 §3.10
 */
export type UnsubscribePacket = {
  readonly type: typeof PacketType.UNSUBSCRIBE
  /** Packet identifier */
  readonly packetId: number
  /** Topic filters to unsubscribe */
  readonly topicFilters: readonly string[]
  /** UNSUBSCRIBE properties (5.0) */
  readonly properties?: UnsubscribeProperties
}

// -----------------------------------------------------------------------------
// UNSUBACK (§3.11)
// -----------------------------------------------------------------------------

/**
 * UNSUBACK properties (MQTT 5.0).
 */
export type UnsubackProperties = {
  /** Reason string */
  readonly reasonString?: string
  /** User properties */
  readonly userProperties?: readonly UserProperty[]
}

/**
 * UNSUBACK packet - Unsubscribe acknowledgement.
 *
 * @see MQTT 5.0 §3.11
 */
export type UnsubackPacket = {
  readonly type: typeof PacketType.UNSUBACK
  /** Packet identifier */
  readonly packetId: number
  /** Reason codes (5.0, one per topic filter) */
  readonly reasonCodes?: readonly ReasonCode[]
  /** UNSUBACK properties (5.0) */
  readonly properties?: UnsubackProperties
}

// -----------------------------------------------------------------------------
// PINGREQ (§3.12)
// -----------------------------------------------------------------------------

/**
 * PINGREQ packet - Ping request.
 *
 * @see MQTT 5.0 §3.12
 */
export type PingreqPacket = {
  readonly type: typeof PacketType.PINGREQ
}

// -----------------------------------------------------------------------------
// PINGRESP (§3.13)
// -----------------------------------------------------------------------------

/**
 * PINGRESP packet - Ping response.
 *
 * @see MQTT 5.0 §3.13
 */
export type PingrespPacket = {
  readonly type: typeof PacketType.PINGRESP
}

// -----------------------------------------------------------------------------
// DISCONNECT (§3.14)
// -----------------------------------------------------------------------------

/**
 * DISCONNECT properties (MQTT 5.0).
 */
export type DisconnectProperties = {
  /** Session expiry interval */
  readonly sessionExpiryInterval?: number
  /** Reason string */
  readonly reasonString?: string
  /** Server reference */
  readonly serverReference?: string
  /** User properties */
  readonly userProperties?: readonly UserProperty[]
}

/**
 * DISCONNECT packet - Disconnect notification.
 *
 * @see MQTT 5.0 §3.14
 */
export type DisconnectPacket = {
  readonly type: typeof PacketType.DISCONNECT
  /** Reason code (5.0, defaults to 0x00) */
  readonly reasonCode?: ReasonCode
  /** DISCONNECT properties (5.0) */
  readonly properties?: DisconnectProperties
}

// -----------------------------------------------------------------------------
// AUTH (§3.15) - MQTT 5.0 only
// -----------------------------------------------------------------------------

/**
 * AUTH properties (MQTT 5.0).
 */
export type AuthProperties = {
  /** Authentication method */
  readonly authenticationMethod?: string
  /** Authentication data */
  readonly authenticationData?: Uint8Array
  /** Reason string */
  readonly reasonString?: string
  /** User properties */
  readonly userProperties?: readonly UserProperty[]
}

/**
 * AUTH packet - Authentication exchange (MQTT 5.0 only).
 *
 * @see MQTT 5.0 §3.15
 */
export type AuthPacket = {
  readonly type: typeof PacketType.AUTH
  /** Reason code (0x00=success, 0x18=continue, 0x19=re-auth) */
  readonly reasonCode: ReasonCode
  /** AUTH properties */
  readonly properties?: AuthProperties
}

// -----------------------------------------------------------------------------
// Discriminated Union
// -----------------------------------------------------------------------------

/**
 * Any MQTT control packet.
 *
 * Use the `type` property to discriminate between packet types.
 *
 * @example
 * ```ts
 * function handlePacket(packet: MqttPacket) {
 *   switch (packet.type) {
 *     case PacketType.CONNECT:
 *       console.log(packet.clientId)
 *       break
 *     case PacketType.PUBLISH:
 *       console.log(packet.topic, packet.payload)
 *       break
 *   }
 * }
 * ```
 */
export type MqttPacket =
  | ConnectPacket
  | ConnackPacket
  | PublishPacket
  | PubackPacket
  | PubrecPacket
  | PubrelPacket
  | PubcompPacket
  | SubscribePacket
  | SubackPacket
  | UnsubscribePacket
  | UnsubackPacket
  | PingreqPacket
  | PingrespPacket
  | DisconnectPacket
  | AuthPacket

/**
 * Extract packet type for a given packet type constant.
 */
export type PacketOfType<T extends PacketType> = Extract<MqttPacket, { type: T }>
