/**
 * MQTT protocol constants.
 *
 * @packageDocumentation
 */

import type { ReasonCode } from "./types.js"

// -----------------------------------------------------------------------------
// Packet Types (§2.1.2)
// -----------------------------------------------------------------------------

/**
 * MQTT control packet types.
 *
 * The packet type is encoded in the upper 4 bits of the fixed header's
 * first byte.
 *
 * @see MQTT 5.0 §2.1.2
 */
export const PacketType = {
  /** Client request to connect to server */
  CONNECT: 1,
  /** Connect acknowledgement */
  CONNACK: 2,
  /** Publish message */
  PUBLISH: 3,
  /** Publish acknowledgement (QoS 1) */
  PUBACK: 4,
  /** Publish received (QoS 2 delivery part 1) */
  PUBREC: 5,
  /** Publish release (QoS 2 delivery part 2) */
  PUBREL: 6,
  /** Publish complete (QoS 2 delivery part 3) */
  PUBCOMP: 7,
  /** Subscribe request */
  SUBSCRIBE: 8,
  /** Subscribe acknowledgement */
  SUBACK: 9,
  /** Unsubscribe request */
  UNSUBSCRIBE: 10,
  /** Unsubscribe acknowledgement */
  UNSUBACK: 11,
  /** PING request */
  PINGREQ: 12,
  /** PING response */
  PINGRESP: 13,
  /** Disconnect notification */
  DISCONNECT: 14,
  /** Authentication exchange (5.0 only) */
  AUTH: 15
} as const

export type PacketType = (typeof PacketType)[keyof typeof PacketType]

/**
 * Packet type names for debugging/logging.
 */
export const PACKET_TYPE_NAME: Record<PacketType, string> = {
  [PacketType.CONNECT]: "CONNECT",
  [PacketType.CONNACK]: "CONNACK",
  [PacketType.PUBLISH]: "PUBLISH",
  [PacketType.PUBACK]: "PUBACK",
  [PacketType.PUBREC]: "PUBREC",
  [PacketType.PUBREL]: "PUBREL",
  [PacketType.PUBCOMP]: "PUBCOMP",
  [PacketType.SUBSCRIBE]: "SUBSCRIBE",
  [PacketType.SUBACK]: "SUBACK",
  [PacketType.UNSUBSCRIBE]: "UNSUBSCRIBE",
  [PacketType.UNSUBACK]: "UNSUBACK",
  [PacketType.PINGREQ]: "PINGREQ",
  [PacketType.PINGRESP]: "PINGRESP",
  [PacketType.DISCONNECT]: "DISCONNECT",
  [PacketType.AUTH]: "AUTH"
}

// -----------------------------------------------------------------------------
// Property Identifiers (§2.2.2.2)
// -----------------------------------------------------------------------------

/**
 * MQTT 5.0 property identifiers.
 *
 * Properties are encoded as a variable byte integer identifier followed
 * by the property value.
 *
 * @see MQTT 5.0 §2.2.2.2
 */
export const PropertyId = {
  /** Payload format: 0 = bytes, 1 = UTF-8 */
  PAYLOAD_FORMAT_INDICATOR: 0x01,
  /** Message expiry interval in seconds */
  MESSAGE_EXPIRY_INTERVAL: 0x02,
  /** Content type (MIME type) */
  CONTENT_TYPE: 0x03,
  /** Response topic for request/response */
  RESPONSE_TOPIC: 0x08,
  /** Correlation data for request/response */
  CORRELATION_DATA: 0x09,
  /** Subscription identifier */
  SUBSCRIPTION_IDENTIFIER: 0x0b,
  /** Session expiry interval in seconds */
  SESSION_EXPIRY_INTERVAL: 0x11,
  /** Assigned client identifier (server-assigned) */
  ASSIGNED_CLIENT_IDENTIFIER: 0x12,
  /** Server keep alive override */
  SERVER_KEEP_ALIVE: 0x13,
  /** Authentication method */
  AUTHENTICATION_METHOD: 0x15,
  /** Authentication data */
  AUTHENTICATION_DATA: 0x16,
  /** Request problem information */
  REQUEST_PROBLEM_INFORMATION: 0x17,
  /** Will delay interval in seconds */
  WILL_DELAY_INTERVAL: 0x18,
  /** Request response information */
  REQUEST_RESPONSE_INFORMATION: 0x19,
  /** Response information */
  RESPONSE_INFORMATION: 0x1a,
  /** Server reference for redirect */
  SERVER_REFERENCE: 0x1c,
  /** Reason string (human-readable) */
  REASON_STRING: 0x1f,
  /** Receive maximum */
  RECEIVE_MAXIMUM: 0x21,
  /** Topic alias maximum */
  TOPIC_ALIAS_MAXIMUM: 0x22,
  /** Topic alias */
  TOPIC_ALIAS: 0x23,
  /** Maximum QoS supported */
  MAXIMUM_QOS: 0x24,
  /** Retain available */
  RETAIN_AVAILABLE: 0x25,
  /** User property (key-value pair) */
  USER_PROPERTY: 0x26,
  /** Maximum packet size */
  MAXIMUM_PACKET_SIZE: 0x27,
  /** Wildcard subscription available */
  WILDCARD_SUBSCRIPTION_AVAILABLE: 0x28,
  /** Subscription identifier available */
  SUBSCRIPTION_IDENTIFIER_AVAILABLE: 0x29,
  /** Shared subscription available */
  SHARED_SUBSCRIPTION_AVAILABLE: 0x2a
} as const

export type PropertyId = (typeof PropertyId)[keyof typeof PropertyId]

/**
 * Property identifier names for debugging/logging.
 */
export const PROPERTY_ID_NAME: Record<PropertyId, string> = {
  [PropertyId.PAYLOAD_FORMAT_INDICATOR]: "Payload Format Indicator",
  [PropertyId.MESSAGE_EXPIRY_INTERVAL]: "Message Expiry Interval",
  [PropertyId.CONTENT_TYPE]: "Content Type",
  [PropertyId.RESPONSE_TOPIC]: "Response Topic",
  [PropertyId.CORRELATION_DATA]: "Correlation Data",
  [PropertyId.SUBSCRIPTION_IDENTIFIER]: "Subscription Identifier",
  [PropertyId.SESSION_EXPIRY_INTERVAL]: "Session Expiry Interval",
  [PropertyId.ASSIGNED_CLIENT_IDENTIFIER]: "Assigned Client Identifier",
  [PropertyId.SERVER_KEEP_ALIVE]: "Server Keep Alive",
  [PropertyId.AUTHENTICATION_METHOD]: "Authentication Method",
  [PropertyId.AUTHENTICATION_DATA]: "Authentication Data",
  [PropertyId.REQUEST_PROBLEM_INFORMATION]: "Request Problem Information",
  [PropertyId.WILL_DELAY_INTERVAL]: "Will Delay Interval",
  [PropertyId.REQUEST_RESPONSE_INFORMATION]: "Request Response Information",
  [PropertyId.RESPONSE_INFORMATION]: "Response Information",
  [PropertyId.SERVER_REFERENCE]: "Server Reference",
  [PropertyId.REASON_STRING]: "Reason String",
  [PropertyId.RECEIVE_MAXIMUM]: "Receive Maximum",
  [PropertyId.TOPIC_ALIAS_MAXIMUM]: "Topic Alias Maximum",
  [PropertyId.TOPIC_ALIAS]: "Topic Alias",
  [PropertyId.MAXIMUM_QOS]: "Maximum QoS",
  [PropertyId.RETAIN_AVAILABLE]: "Retain Available",
  [PropertyId.USER_PROPERTY]: "User Property",
  [PropertyId.MAXIMUM_PACKET_SIZE]: "Maximum Packet Size",
  [PropertyId.WILDCARD_SUBSCRIPTION_AVAILABLE]: "Wildcard Subscription Available",
  [PropertyId.SUBSCRIPTION_IDENTIFIER_AVAILABLE]: "Subscription Identifier Available",
  [PropertyId.SHARED_SUBSCRIPTION_AVAILABLE]: "Shared Subscription Available"
}

// -----------------------------------------------------------------------------
// Reason Code Names (§2.4)
// -----------------------------------------------------------------------------

/**
 * Human-readable reason code names.
 *
 * @see MQTT 5.0 §2.4
 */
export const REASON_CODE_NAME: Record<ReasonCode, string> = {
  // Success codes
  0x00: "Success",
  0x01: "Granted QoS 1",
  0x02: "Granted QoS 2",
  0x04: "Disconnect with will message",
  0x10: "No matching subscribers",
  0x11: "No subscription existed",
  0x18: "Continue authentication",
  0x19: "Re-authenticate",
  // Error codes
  0x80: "Unspecified error",
  0x81: "Malformed packet",
  0x82: "Protocol error",
  0x83: "Implementation specific error",
  0x84: "Unsupported protocol version",
  0x85: "Client identifier not valid",
  0x86: "Bad user name or password",
  0x87: "Not authorised",
  0x88: "Server unavailable",
  0x89: "Server busy",
  0x8a: "Banned",
  0x8b: "Server shutting down",
  0x8c: "Bad authentication method",
  0x8d: "Keep alive timeout",
  0x8e: "Session taken over",
  0x8f: "Topic filter invalid",
  0x90: "Topic name invalid",
  0x91: "Packet identifier in use",
  0x92: "Packet identifier not found",
  0x93: "Receive maximum exceeded",
  0x94: "Topic alias invalid",
  0x95: "Packet too large",
  0x96: "Message rate too high",
  0x97: "Quota exceeded",
  0x98: "Administrative action",
  0x99: "Payload format invalid",
  0x9a: "Retain not supported",
  0x9b: "QoS not supported",
  0x9c: "Use another server",
  0x9d: "Server moved",
  0x9e: "Shared subscriptions not supported",
  0x9f: "Connection rate exceeded",
  0xa0: "Maximum connect time",
  0xa1: "Subscription identifiers not supported",
  0xa2: "Wildcard subscriptions not supported"
}

// -----------------------------------------------------------------------------
// Protocol Limits
// -----------------------------------------------------------------------------

/**
 * Maximum value for a variable byte integer (268,435,455).
 *
 * @see MQTT 5.0 §2.2.3
 */
export const MAX_VARIABLE_BYTE_INTEGER = 268_435_455

/**
 * Maximum number of bytes to encode a variable byte integer.
 *
 * @see MQTT 5.0 §2.2.3
 */
export const MAX_VARIABLE_BYTE_INTEGER_LENGTH = 4

/**
 * Maximum packet size (256 MB).
 *
 * This is the theoretical maximum based on the variable byte integer
 * encoding. Actual limits are often much smaller (e.g., 128 KB).
 */
export const MAX_PACKET_SIZE = MAX_VARIABLE_BYTE_INTEGER + 1

/**
 * Default maximum packet size if not specified by server.
 *
 * @see MQTT 5.0 §3.1.2.11.4
 */
export const DEFAULT_MAXIMUM_PACKET_SIZE = MAX_PACKET_SIZE

/**
 * Default receive maximum if not specified.
 *
 * @see MQTT 5.0 §3.1.2.11.3
 */
export const DEFAULT_RECEIVE_MAXIMUM = 65_535

/**
 * Maximum value for a packet identifier (16-bit unsigned).
 */
export const MAX_PACKET_ID = 65_535

/**
 * Minimum value for a packet identifier.
 */
export const MIN_PACKET_ID = 1

/**
 * Maximum value for a topic alias (16-bit unsigned, non-zero).
 */
export const MAX_TOPIC_ALIAS = 65_535
