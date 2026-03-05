/**
 * Fast-check arbitraries for MQTT packet fuzzing and property-based testing.
 *
 * Provides generators for:
 * - Protocol primitives (QoS, reason codes, packet IDs)
 * - MQTT strings and binary data
 * - All packet types with valid and edge-case values
 * - Chunk splitting for stream framing tests
 *
 * @example
 * ```ts
 * import * as fc from "fast-check"
 * import { arbPublishPacket, arbChunkSplit } from "@qualithm/mqtt-wire/testing"
 *
 * fc.assert(
 *   fc.property(arbPublishPacket, (packet) => {
 *     const encoded = encodePacket(packet)
 *     const decoded = decodePacket(encoded)
 *     return decoded.ok && deepEqual(decoded.value, packet)
 *   })
 * )
 * ```
 *
 * @packageDocumentation
 */

import * as fc from "fast-check"

import { PacketType } from "../constants.js"
import type {
  AuthPacket,
  AuthProperties,
  ConnackPacket,
  ConnackProperties,
  ConnectPacket,
  ConnectProperties,
  DisconnectPacket,
  DisconnectProperties,
  MqttPacket,
  PingreqPacket,
  PingrespPacket,
  PubackPacket,
  PubAckProperties,
  PubcompPacket,
  PublishPacket,
  PublishProperties,
  PubrecPacket,
  PubrelPacket,
  SubackPacket,
  SubackProperties,
  SubscribePacket,
  SubscribeProperties,
  Subscription,
  SubscriptionOptions,
  UnsubackPacket,
  UnsubackProperties,
  UnsubscribePacket,
  UnsubscribeProperties,
  UserProperty,
  WillMessage,
  WillProperties
} from "../packets/types.js"
import type { ProtocolVersion, QoS, ReasonCode } from "../types.js"

// -----------------------------------------------------------------------------
// Protocol Primitives
// -----------------------------------------------------------------------------

/**
 * Arbitrary for QoS levels (0, 1, 2).
 */
export const arbQoS: fc.Arbitrary<QoS> = fc.constantFrom(0, 1, 2)

/**
 * Arbitrary for protocol versions.
 */
export const arbProtocolVersion: fc.Arbitrary<ProtocolVersion> = fc.constantFrom("3.1.1", "5.0")

/**
 * Arbitrary for packet IDs (1-65535).
 */
export const arbPacketId: fc.Arbitrary<number> = fc.integer({ min: 1, max: 65535 })

/**
 * Arbitrary for success reason codes.
 */
export const arbSuccessReasonCode: fc.Arbitrary<ReasonCode> = fc.constantFrom(
  0x00, // Success
  0x01, // Granted QoS 1
  0x02 // Granted QoS 2
) as fc.Arbitrary<ReasonCode>

/**
 * Arbitrary for common reason codes.
 */
export const arbReasonCode: fc.Arbitrary<ReasonCode> = fc.constantFrom(
  0x00, // Success
  0x04, // Disconnect with will
  0x10, // No matching subscribers
  0x11, // No subscription existed
  0x80, // Unspecified error
  0x81, // Malformed packet
  0x82, // Protocol error
  0x83, // Implementation specific error
  0x87, // Not authorized
  0x8a, // Topic name invalid
  0x8b, // Packet identifier in use
  0x90, // Topic filter invalid
  0x91, // Topic alias invalid
  0x97, // Quota exceeded
  0x99, // Payload format invalid
  0x9a, // Retain not supported
  0x9b, // QoS not supported
  0x9d, // Shared subscription not supported
  0x9e // Subscription identifier not supported
) as fc.Arbitrary<ReasonCode>

// -----------------------------------------------------------------------------
// MQTT Strings
// -----------------------------------------------------------------------------

/**
 * Arbitrary for valid MQTT UTF-8 strings (1-65535 bytes when encoded).
 *
 * Excludes null characters, isolated surrogates, and control characters
 * prohibited by the MQTT 5.0 spec (§1.5.4).
 */
export const arbMqttString: fc.Arbitrary<string> = fc
  .string({
    minLength: 0,
    maxLength: 256, // Keep reasonable for tests
    unit: fc.integer({ min: 0x20, max: 0x7e }).map(String.fromCharCode) // Printable ASCII
  })
  .filter((s) => s.length <= 65535)

/**
 * Arbitrary for MQTT topic names (no wildcards).
 */
export const arbTopicName: fc.Arbitrary<string> = fc
  .array(
    fc.string({
      unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
      minLength: 1,
      maxLength: 10
    }),
    { minLength: 1, maxLength: 5 }
  )
  .map((parts) => parts.join("/"))
  .filter((s) => s.length > 0 && s.length <= 65535)

/**
 * Arbitrary for MQTT topic filters (may contain wildcards).
 */
export const arbTopicFilter: fc.Arbitrary<string> = fc.oneof(
  arbTopicName,
  fc.constant("#"),
  arbTopicName.map((t) => `${t}/#`),
  fc
    .array(
      fc.oneof(
        fc.string({
          unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
          minLength: 1,
          maxLength: 10
        }),
        fc.constant("+")
      ),
      { minLength: 1, maxLength: 5 }
    )
    .map((parts) => parts.join("/"))
)

/**
 * Arbitrary for MQTT client identifiers (0-23 characters recommended).
 */
export const arbClientId: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("")
  ),
  minLength: 0,
  maxLength: 23
})

// -----------------------------------------------------------------------------
// Binary Data
// -----------------------------------------------------------------------------

/**
 * Arbitrary for binary payloads.
 */
export const arbBinary: fc.Arbitrary<Uint8Array> = fc.uint8Array({ minLength: 0, maxLength: 256 })

/**
 * Arbitrary for small binary payloads (for properties).
 */
export const arbSmallBinary: fc.Arbitrary<Uint8Array> = fc.uint8Array({
  minLength: 0,
  maxLength: 64
})

// -----------------------------------------------------------------------------
// User Properties
// -----------------------------------------------------------------------------

/**
 * Arbitrary for user properties.
 */
export const arbUserProperty: fc.Arbitrary<UserProperty> = fc.tuple(
  fc.string({
    unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
    minLength: 1,
    maxLength: 16
  }),
  arbMqttString
)

/**
 * Arbitrary for optional user properties array.
 */
export const arbUserProperties: fc.Arbitrary<readonly UserProperty[] | undefined> = fc.option(
  fc.array(arbUserProperty, { minLength: 0, maxLength: 3 }),
  { nil: undefined }
)

// -----------------------------------------------------------------------------
// Properties Arbitraries
// -----------------------------------------------------------------------------

/**
 * Arbitrary for CONNECT properties.
 */
export const arbConnectProperties: fc.Arbitrary<ConnectProperties | undefined> = fc.option(
  fc.record(
    {
      sessionExpiryInterval: fc.option(fc.integer({ min: 0, max: 0xffffffff }), { nil: undefined }),
      receiveMaximum: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
      maximumPacketSize: fc.option(fc.integer({ min: 1, max: 268435455 }), { nil: undefined }),
      topicAliasMaximum: fc.option(fc.integer({ min: 0, max: 65535 }), { nil: undefined }),
      requestResponseInformation: fc.option(fc.boolean(), { nil: undefined }),
      requestProblemInformation: fc.option(fc.boolean(), { nil: undefined }),
      userProperties: arbUserProperties
    },
    { requiredKeys: [] }
  ),
  { nil: undefined }
)

/**
 * Arbitrary for CONNACK properties.
 */
export const arbConnackProperties: fc.Arbitrary<ConnackProperties | undefined> = fc.option(
  fc.record(
    {
      sessionExpiryInterval: fc.option(fc.integer({ min: 0, max: 0xffffffff }), { nil: undefined }),
      receiveMaximum: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
      maximumQoS: fc.option(arbQoS, { nil: undefined }),
      retainAvailable: fc.option(fc.boolean(), { nil: undefined }),
      maximumPacketSize: fc.option(fc.integer({ min: 1, max: 268435455 }), { nil: undefined }),
      assignedClientIdentifier: fc.option(arbClientId, { nil: undefined }),
      topicAliasMaximum: fc.option(fc.integer({ min: 0, max: 65535 }), { nil: undefined }),
      serverKeepAlive: fc.option(fc.integer({ min: 0, max: 65535 }), { nil: undefined }),
      userProperties: arbUserProperties
    },
    { requiredKeys: [] }
  ),
  { nil: undefined }
)

/**
 * Arbitrary for PUBLISH properties.
 */
export const arbPublishProperties: fc.Arbitrary<PublishProperties | undefined> = fc.option(
  fc.record(
    {
      payloadFormatIndicator: fc.option(fc.constantFrom(0, 1), {
        nil: undefined
      }),
      messageExpiryInterval: fc.option(fc.integer({ min: 0, max: 0xffffffff }), { nil: undefined }),
      topicAlias: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
      responseTopic: fc.option(arbTopicName, { nil: undefined }),
      correlationData: fc.option(arbSmallBinary, { nil: undefined }),
      contentType: fc.option(arbMqttString, { nil: undefined }),
      userProperties: arbUserProperties
    },
    { requiredKeys: [] }
  ),
  { nil: undefined }
)

/**
 * Arbitrary for PUBACK/PUBREC/PUBREL/PUBCOMP properties.
 */
export const arbPubAckProperties: fc.Arbitrary<PubAckProperties | undefined> = fc.option(
  fc.record(
    {
      reasonString: fc.option(arbMqttString, { nil: undefined }),
      userProperties: arbUserProperties
    },
    { requiredKeys: [] }
  ),
  { nil: undefined }
)

/**
 * Arbitrary for SUBSCRIBE properties.
 */
export const arbSubscribeProperties: fc.Arbitrary<SubscribeProperties | undefined> = fc.option(
  fc.record(
    {
      subscriptionIdentifier: fc.option(fc.integer({ min: 1, max: 268435455 }), { nil: undefined }),
      userProperties: arbUserProperties
    },
    { requiredKeys: [] }
  ),
  { nil: undefined }
)

/**
 * Arbitrary for SUBACK properties.
 */
export const arbSubackProperties: fc.Arbitrary<SubackProperties | undefined> = fc.option(
  fc.record(
    {
      reasonString: fc.option(arbMqttString, { nil: undefined }),
      userProperties: arbUserProperties
    },
    { requiredKeys: [] }
  ),
  { nil: undefined }
)

/**
 * Arbitrary for UNSUBSCRIBE properties.
 */
export const arbUnsubscribeProperties: fc.Arbitrary<UnsubscribeProperties | undefined> = fc.option(
  fc.record(
    {
      userProperties: arbUserProperties
    },
    { requiredKeys: [] }
  ),
  { nil: undefined }
)

/**
 * Arbitrary for UNSUBACK properties.
 */
export const arbUnsubackProperties: fc.Arbitrary<UnsubackProperties | undefined> = fc.option(
  fc.record(
    {
      reasonString: fc.option(arbMqttString, { nil: undefined }),
      userProperties: arbUserProperties
    },
    { requiredKeys: [] }
  ),
  { nil: undefined }
)

/**
 * Arbitrary for DISCONNECT properties.
 */
export const arbDisconnectProperties: fc.Arbitrary<DisconnectProperties | undefined> = fc.option(
  fc.record(
    {
      sessionExpiryInterval: fc.option(fc.integer({ min: 0, max: 0xffffffff }), { nil: undefined }),
      reasonString: fc.option(arbMqttString, { nil: undefined }),
      serverReference: fc.option(arbMqttString, { nil: undefined }),
      userProperties: arbUserProperties
    },
    { requiredKeys: [] }
  ),
  { nil: undefined }
)

/**
 * Arbitrary for AUTH properties.
 */
export const arbAuthProperties: fc.Arbitrary<AuthProperties | undefined> = fc.option(
  fc.record(
    {
      authenticationMethod: fc.option(arbMqttString, { nil: undefined }),
      authenticationData: fc.option(arbSmallBinary, { nil: undefined }),
      reasonString: fc.option(arbMqttString, { nil: undefined }),
      userProperties: arbUserProperties
    },
    { requiredKeys: [] }
  ),
  { nil: undefined }
)

/**
 * Arbitrary for will properties.
 */
export const arbWillProperties: fc.Arbitrary<WillProperties | undefined> = fc.option(
  fc.record(
    {
      willDelayInterval: fc.option(fc.integer({ min: 0, max: 0xffffffff }), { nil: undefined }),
      payloadFormatIndicator: fc.option(fc.constantFrom(0, 1), {
        nil: undefined
      }),
      messageExpiryInterval: fc.option(fc.integer({ min: 0, max: 0xffffffff }), { nil: undefined }),
      contentType: fc.option(arbMqttString, { nil: undefined }),
      responseTopic: fc.option(arbTopicName, { nil: undefined }),
      correlationData: fc.option(arbSmallBinary, { nil: undefined }),
      userProperties: arbUserProperties
    },
    { requiredKeys: [] }
  ),
  { nil: undefined }
)

// -----------------------------------------------------------------------------
// Subscription Options
// -----------------------------------------------------------------------------

/**
 * Arbitrary for subscription options.
 */
export const arbSubscriptionOptions: fc.Arbitrary<SubscriptionOptions> = fc.record(
  {
    qos: arbQoS,
    noLocal: fc.option(fc.boolean(), { nil: undefined }),
    retainAsPublished: fc.option(fc.boolean(), { nil: undefined }),
    retainHandling: fc.option(fc.constantFrom(0, 1, 2), {
      nil: undefined
    })
  },
  { requiredKeys: ["qos"] }
)

/**
 * Arbitrary for subscription (topic filter + options).
 */
export const arbSubscription: fc.Arbitrary<Subscription> = fc.record({
  topicFilter: arbTopicFilter,
  options: arbSubscriptionOptions
})

// -----------------------------------------------------------------------------
// Will Message
// -----------------------------------------------------------------------------

/**
 * Arbitrary for will message.
 */
export const arbWillMessage: fc.Arbitrary<WillMessage> = fc.record(
  {
    topic: arbTopicName,
    payload: arbBinary,
    qos: arbQoS,
    retain: fc.boolean(),
    properties: arbWillProperties
  },
  { requiredKeys: ["topic", "payload", "qos", "retain"] }
)

// -----------------------------------------------------------------------------
// Packet Arbitraries
// -----------------------------------------------------------------------------

/**
 * Arbitrary for CONNECT packets.
 */
export const arbConnectPacket: fc.Arbitrary<ConnectPacket> = fc.record(
  {
    type: fc.constant(PacketType.CONNECT as typeof PacketType.CONNECT),
    protocolVersion: arbProtocolVersion,
    clientId: arbClientId,
    cleanStart: fc.boolean(),
    keepAlive: fc.integer({ min: 0, max: 65535 }),
    username: fc.option(arbMqttString, { nil: undefined }),
    password: fc.option(arbSmallBinary, { nil: undefined }),
    will: fc.option(arbWillMessage, { nil: undefined }),
    properties: arbConnectProperties
  },
  { requiredKeys: ["type", "protocolVersion", "clientId", "cleanStart", "keepAlive"] }
)

/**
 * Arbitrary for CONNACK packets.
 */
export const arbConnackPacket: fc.Arbitrary<ConnackPacket> = fc.record(
  {
    type: fc.constant(PacketType.CONNACK as typeof PacketType.CONNACK),
    sessionPresent: fc.boolean(),
    reasonCode: arbReasonCode,
    properties: arbConnackProperties
  },
  { requiredKeys: ["type", "sessionPresent", "reasonCode"] }
)

/**
 * Arbitrary for PUBLISH packets (QoS 0).
 */
export const arbPublishQoS0Packet: fc.Arbitrary<PublishPacket> = fc.record(
  {
    type: fc.constant(PacketType.PUBLISH as typeof PacketType.PUBLISH),
    topic: arbTopicName,
    qos: fc.constant(0 as const),
    retain: fc.boolean(),
    dup: fc.constant(false), // DUP must be 0 for QoS 0
    payload: arbBinary,
    properties: arbPublishProperties
  },
  { requiredKeys: ["type", "topic", "qos", "retain", "dup", "payload"] }
)

/**
 * Arbitrary for PUBLISH packets (QoS 1 or 2).
 */
export const arbPublishQoS12Packet: fc.Arbitrary<PublishPacket> = fc.record(
  {
    type: fc.constant(PacketType.PUBLISH as typeof PacketType.PUBLISH),
    topic: arbTopicName,
    packetId: arbPacketId,
    qos: fc.constantFrom(1, 2),
    retain: fc.boolean(),
    dup: fc.boolean(),
    payload: arbBinary,
    properties: arbPublishProperties
  },
  { requiredKeys: ["type", "topic", "packetId", "qos", "retain", "dup", "payload"] }
)

/**
 * Arbitrary for any valid PUBLISH packet.
 */
export const arbPublishPacket: fc.Arbitrary<PublishPacket> = fc.oneof(
  arbPublishQoS0Packet,
  arbPublishQoS12Packet
)

/**
 * Arbitrary for PUBACK packets.
 */
export const arbPubackPacket: fc.Arbitrary<PubackPacket> = fc.record(
  {
    type: fc.constant(PacketType.PUBACK as typeof PacketType.PUBACK),
    packetId: arbPacketId,
    reasonCode: fc.option(arbReasonCode, { nil: undefined }),
    properties: arbPubAckProperties
  },
  { requiredKeys: ["type", "packetId"] }
)

/**
 * Arbitrary for PUBREC packets.
 */
export const arbPubrecPacket: fc.Arbitrary<PubrecPacket> = fc.record(
  {
    type: fc.constant(PacketType.PUBREC as typeof PacketType.PUBREC),
    packetId: arbPacketId,
    reasonCode: fc.option(arbReasonCode, { nil: undefined }),
    properties: arbPubAckProperties
  },
  { requiredKeys: ["type", "packetId"] }
)

/**
 * Arbitrary for PUBREL packets.
 */
export const arbPubrelPacket: fc.Arbitrary<PubrelPacket> = fc.record(
  {
    type: fc.constant(PacketType.PUBREL as typeof PacketType.PUBREL),
    packetId: arbPacketId,
    reasonCode: fc.option(arbReasonCode, { nil: undefined }),
    properties: arbPubAckProperties
  },
  { requiredKeys: ["type", "packetId"] }
)

/**
 * Arbitrary for PUBCOMP packets.
 */
export const arbPubcompPacket: fc.Arbitrary<PubcompPacket> = fc.record(
  {
    type: fc.constant(PacketType.PUBCOMP as typeof PacketType.PUBCOMP),
    packetId: arbPacketId,
    reasonCode: fc.option(arbReasonCode, { nil: undefined }),
    properties: arbPubAckProperties
  },
  { requiredKeys: ["type", "packetId"] }
)

/**
 * Arbitrary for SUBSCRIBE packets.
 */
export const arbSubscribePacket: fc.Arbitrary<SubscribePacket> = fc.record(
  {
    type: fc.constant(PacketType.SUBSCRIBE as typeof PacketType.SUBSCRIBE),
    packetId: arbPacketId,
    subscriptions: fc.array(arbSubscription, { minLength: 1, maxLength: 5 }),
    properties: arbSubscribeProperties
  },
  { requiredKeys: ["type", "packetId", "subscriptions"] }
)

/**
 * Arbitrary for SUBACK packets.
 */
export const arbSubackPacket: fc.Arbitrary<SubackPacket> = fc.record(
  {
    type: fc.constant(PacketType.SUBACK as typeof PacketType.SUBACK),
    packetId: arbPacketId,
    reasonCodes: fc.array(arbReasonCode, { minLength: 1, maxLength: 5 }),
    properties: arbSubackProperties
  },
  { requiredKeys: ["type", "packetId", "reasonCodes"] }
)

/**
 * Arbitrary for UNSUBSCRIBE packets.
 */
export const arbUnsubscribePacket: fc.Arbitrary<UnsubscribePacket> = fc.record(
  {
    type: fc.constant(PacketType.UNSUBSCRIBE as typeof PacketType.UNSUBSCRIBE),
    packetId: arbPacketId,
    topicFilters: fc.array(arbTopicFilter, { minLength: 1, maxLength: 5 }),
    properties: arbUnsubscribeProperties
  },
  { requiredKeys: ["type", "packetId", "topicFilters"] }
)

/**
 * Arbitrary for UNSUBACK packets.
 */
export const arbUnsubackPacket: fc.Arbitrary<UnsubackPacket> = fc.record(
  {
    type: fc.constant(PacketType.UNSUBACK as typeof PacketType.UNSUBACK),
    packetId: arbPacketId,
    reasonCodes: fc.option(fc.array(arbReasonCode, { minLength: 1, maxLength: 5 }), {
      nil: undefined
    }),
    properties: arbUnsubackProperties
  },
  { requiredKeys: ["type", "packetId"] }
)

/**
 * Arbitrary for PINGREQ packets.
 */
export const arbPingreqPacket: fc.Arbitrary<PingreqPacket> = fc.constant({
  type: PacketType.PINGREQ as typeof PacketType.PINGREQ
})

/**
 * Arbitrary for PINGRESP packets.
 */
export const arbPingrespPacket: fc.Arbitrary<PingrespPacket> = fc.constant({
  type: PacketType.PINGRESP as typeof PacketType.PINGRESP
})

/**
 * Arbitrary for DISCONNECT packets.
 */
export const arbDisconnectPacket: fc.Arbitrary<DisconnectPacket> = fc.record(
  {
    type: fc.constant(PacketType.DISCONNECT as typeof PacketType.DISCONNECT),
    reasonCode: fc.option(arbReasonCode, { nil: undefined }),
    properties: arbDisconnectProperties
  },
  { requiredKeys: ["type"] }
)

/**
 * Arbitrary for AUTH packets (MQTT 5.0 only).
 */
export const arbAuthPacket: fc.Arbitrary<AuthPacket> = fc.record(
  {
    type: fc.constant(PacketType.AUTH as typeof PacketType.AUTH),
    reasonCode: fc.constantFrom(0x00, 0x18, 0x19) as fc.Arbitrary<ReasonCode>,
    properties: arbAuthProperties
  },
  { requiredKeys: ["type", "reasonCode"] }
)

/**
 * Arbitrary for any MQTT packet.
 */
export const arbMqttPacket: fc.Arbitrary<MqttPacket> = fc.oneof(
  arbConnectPacket,
  arbConnackPacket,
  arbPublishPacket,
  arbPubackPacket,
  arbPubrecPacket,
  arbPubrelPacket,
  arbPubcompPacket,
  arbSubscribePacket,
  arbSubackPacket,
  arbUnsubscribePacket,
  arbUnsubackPacket,
  arbPingreqPacket,
  arbPingrespPacket,
  arbDisconnectPacket,
  arbAuthPacket
)

// -----------------------------------------------------------------------------
// Chunk Splitting (for stream framing tests)
// -----------------------------------------------------------------------------

/**
 * Split a buffer into chunks at arbitrary positions.
 *
 * @example
 * ```ts
 * fc.assert(
 *   fc.property(
 *     arbPublishPacket,
 *     arbChunkSplits(100),
 *     (packet, splits) => {
 *       const encoded = encodePacket(packet)
 *       const chunks = splitAtPositions(encoded, splits)
 *       // Test reassembly...
 *     }
 *   )
 * )
 * ```
 */
export function arbChunkSplits(maxLength: number): fc.Arbitrary<number[]> {
  // For lengths <= 1, no valid split points exist
  if (maxLength <= 1) {
    return fc.constant([])
  }
  return fc
    .array(fc.integer({ min: 1, max: maxLength - 1 }), { minLength: 0, maxLength: 10 })
    .map((positions) => [...new Set(positions)].sort((a, b) => a - b))
}

/**
 * Split a buffer at the given positions.
 */
export function splitAtPositions(data: Uint8Array, positions: number[]): Uint8Array[] {
  const chunks: Uint8Array[] = []
  let start = 0

  for (const pos of positions) {
    if (pos > start && pos < data.length) {
      chunks.push(data.slice(start, pos))
      start = pos
    }
  }

  if (start < data.length) {
    chunks.push(data.slice(start))
  }

  return chunks.length > 0 ? chunks : [data]
}

/**
 * Result of arbWithChunkSplits generator.
 */
export type ChunkSplitResult<T> = {
  /** The generated value. */
  value: T
  /** The encoded buffer. */
  buffer: Uint8Array
  /** The buffer split into chunks. */
  chunks: Uint8Array[]
}

/**
 * Arbitrary that produces a buffer and its arbitrary chunk splits.
 */
export function arbWithChunkSplits<T>(
  arbValue: fc.Arbitrary<T>,
  toBuffer: (value: T) => Uint8Array
): fc.Arbitrary<ChunkSplitResult<T>> {
  return arbValue.chain((value) => {
    const buffer = toBuffer(value)
    return arbChunkSplits(buffer.length).map((positions) => ({
      value,
      buffer,
      chunks: splitAtPositions(buffer, positions)
    }))
  })
}

// -----------------------------------------------------------------------------
// Mutation Helpers (for fuzzing)
// -----------------------------------------------------------------------------

/**
 * Mutate a single byte in the buffer.
 */
export const arbMutateByte: fc.Arbitrary<(data: Uint8Array) => Uint8Array> = fc
  .record({
    position: fc.nat(),
    value: fc.integer({ min: 0, max: 255 })
  })
  .map(({ position, value }) => (data: Uint8Array) => {
    if (data.length === 0) {
      return data
    }
    const copy = new Uint8Array(data)
    copy[position % data.length] = value
    return copy
  })

/**
 * Insert random bytes into the buffer.
 */
export const arbInsertBytes: fc.Arbitrary<(data: Uint8Array) => Uint8Array> = fc
  .record({
    position: fc.nat(),
    bytes: fc.uint8Array({ minLength: 1, maxLength: 16 })
  })
  .map(({ position, bytes }) => (data: Uint8Array) => {
    const pos = data.length === 0 ? 0 : position % data.length
    const result = new Uint8Array(data.length + bytes.length)
    result.set(data.slice(0, pos))
    result.set(bytes, pos)
    result.set(data.slice(pos), pos + bytes.length)
    return result
  })

/**
 * Delete bytes from the buffer.
 */
export const arbDeleteBytes: fc.Arbitrary<(data: Uint8Array) => Uint8Array> = fc
  .record({
    position: fc.nat(),
    count: fc.integer({ min: 1, max: 16 })
  })
  .map(({ position, count }) => (data: Uint8Array) => {
    if (data.length === 0) {
      return data
    }
    const pos = position % data.length
    const deleteCount = Math.min(count, data.length - pos)
    const result = new Uint8Array(data.length - deleteCount)
    result.set(data.slice(0, pos))
    result.set(data.slice(pos + deleteCount), pos)
    return result
  })

/**
 * Truncate the buffer.
 */
export const arbTruncate: fc.Arbitrary<(data: Uint8Array) => Uint8Array> = fc
  .nat()
  .map((position) => (data: Uint8Array) => {
    if (data.length === 0) {
      return data
    }
    const pos = position % data.length
    return data.slice(0, pos)
  })

/**
 * Apply a random mutation to the buffer.
 */
export const arbMutation: fc.Arbitrary<(data: Uint8Array) => Uint8Array> = fc.oneof(
  arbMutateByte,
  arbInsertBytes,
  arbDeleteBytes,
  arbTruncate
)

/**
 * Apply multiple mutations to the buffer.
 */
export function arbMutations(count: number): fc.Arbitrary<(data: Uint8Array) => Uint8Array> {
  return fc
    .array(arbMutation, { minLength: 1, maxLength: count })
    .map((mutations) => (data: Uint8Array) => mutations.reduce((acc, mutate) => mutate(acc), data))
}
