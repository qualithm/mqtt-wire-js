/**
 * MQTT packet decoder.
 *
 * Decodes binary data into typed packet objects.
 *
 * @packageDocumentation
 */

import { BinaryReader } from "../codec/reader.js"
import { PacketType } from "../constants.js"
import {
  decodeError,
  type DecodeResult,
  err,
  ok,
  type ProtocolVersion,
  type QoS,
  type ReasonCode
} from "../types.js"
import {
  decodeProperties,
  parseAuthProperties,
  parseConnackProperties,
  parseConnectProperties,
  parseDisconnectProperties,
  parsePubAckProperties,
  parsePublishProperties,
  parseSubackProperties,
  parseSubscribeProperties,
  parseUnsubackProperties,
  parseUnsubscribeProperties,
  parseWillProperties
} from "./properties.js"
import type {
  AuthPacket,
  ConnackPacket,
  ConnectPacket,
  DisconnectPacket,
  MqttPacket,
  PingreqPacket,
  PingrespPacket,
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket,
  SubackPacket,
  SubscribePacket,
  Subscription,
  SubscriptionOptions,
  UnsubackPacket,
  UnsubscribePacket,
  WillMessage
} from "./types.js"

// -----------------------------------------------------------------------------
// Fixed Header Parsing
// -----------------------------------------------------------------------------

/**
 * Parsed fixed header.
 */
type FixedHeader = {
  packetType: number
  flags: number
  remainingLength: number
}

/**
 * Parse the fixed header from a reader.
 */
function parseFixedHeader(reader: BinaryReader): DecodeResult<FixedHeader> {
  const byte1 = reader.readUint8()
  if (!byte1.ok) {
    return byte1
  }

  const packetType = (byte1.value >> 4) & 0x0f
  const flags = byte1.value & 0x0f

  const remainingLength = reader.readVariableByteInteger()
  if (!remainingLength.ok) {
    return remainingLength
  }

  return ok({
    packetType,
    flags,
    remainingLength: remainingLength.value
  })
}

// -----------------------------------------------------------------------------
// CONNECT Decoding (§3.1)
// -----------------------------------------------------------------------------

/**
 * Decode will message from connect payload.
 */
function decodeWillMessage(
  reader: BinaryReader,
  protocolVersion: ProtocolVersion,
  qos: QoS,
  retain: boolean
): DecodeResult<WillMessage> {
  // Will properties (5.0 only)
  let willProperties: WillMessage["properties"]
  if (protocolVersion === "5.0") {
    const willPropsResult = decodeProperties(reader)
    if (!willPropsResult.ok) {
      return willPropsResult
    }
    if (willPropsResult.value.size > 0) {
      willProperties = parseWillProperties(willPropsResult.value)
    }
  }

  const willTopic = reader.readMqttString()
  if (!willTopic.ok) {
    return willTopic
  }

  const willPayload = reader.readMqttBinary()
  if (!willPayload.ok) {
    return willPayload
  }

  return ok({
    topic: willTopic.value,
    payload: willPayload.value,
    qos,
    retain,
    properties: willProperties
  })
}

function decodeConnect(
  reader: BinaryReader,
  _remainingLength: number
): DecodeResult<ConnectPacket> {
  // Protocol name
  const protocolName = reader.readMqttString()
  if (!protocolName.ok) {
    return protocolName
  }

  if (protocolName.value !== "MQTT" && protocolName.value !== "MQIsdp") {
    return err(
      decodeError("PROTOCOL_ERROR", `invalid protocol name: ${protocolName.value}`, "§3.1.2.1")
    )
  }

  // Protocol level
  const protocolLevel = reader.readUint8()
  if (!protocolLevel.ok) {
    return protocolLevel
  }

  let protocolVersion: ProtocolVersion
  if (protocolLevel.value === 4) {
    protocolVersion = "3.1.1"
  } else if (protocolLevel.value === 5) {
    protocolVersion = "5.0"
  } else {
    return err(
      decodeError(
        "PROTOCOL_ERROR",
        `unsupported protocol level: ${String(protocolLevel.value)}`,
        "§3.1.2.2"
      )
    )
  }

  // Connect flags
  const connectFlags = reader.readUint8()
  if (!connectFlags.ok) {
    return connectFlags
  }

  const flags = connectFlags.value
  // Reserved bit must be 0
  if (flags & 0x01) {
    return err(decodeError("MALFORMED_PACKET", "connect flags reserved bit must be 0", "§3.1.2.3"))
  }

  const cleanStart = (flags & 0x02) !== 0
  const willFlag = (flags & 0x04) !== 0
  const willQoS = ((flags >> 3) & 0x03) as QoS
  const willRetain = (flags & 0x20) !== 0
  const passwordFlag = (flags & 0x40) !== 0
  const usernameFlag = (flags & 0x80) !== 0

  // Keep alive
  const keepAlive = reader.readUint16()
  if (!keepAlive.ok) {
    return keepAlive
  }

  // Properties (5.0 only)
  let properties: ConnectPacket["properties"]
  if (protocolVersion === "5.0") {
    const propsResult = decodeProperties(reader)
    if (!propsResult.ok) {
      return propsResult
    }
    if (propsResult.value.size > 0) {
      properties = parseConnectProperties(propsResult.value)
    }
  }

  // Payload - Client ID
  const clientId = reader.readMqttString()
  if (!clientId.ok) {
    return clientId
  }

  // Will message
  let will: WillMessage | undefined
  if (willFlag) {
    const willResult = decodeWillMessage(reader, protocolVersion, willQoS, willRetain)
    if (!willResult.ok) {
      return willResult
    }
    will = willResult.value
  }

  // Username
  let username: string | undefined
  if (usernameFlag) {
    const usernameResult = reader.readMqttString()
    if (!usernameResult.ok) {
      return usernameResult
    }
    username = usernameResult.value
  }

  // Password
  let password: Uint8Array | undefined
  if (passwordFlag) {
    const passwordResult = reader.readMqttBinary()
    if (!passwordResult.ok) {
      return passwordResult
    }
    password = passwordResult.value
  }

  const packet: ConnectPacket = {
    type: PacketType.CONNECT,
    protocolVersion,
    clientId: clientId.value,
    cleanStart,
    keepAlive: keepAlive.value,
    username,
    password,
    will,
    properties
  }

  return ok(packet)
}

// -----------------------------------------------------------------------------
// CONNACK Decoding (§3.2)
// -----------------------------------------------------------------------------

function decodeConnack(
  reader: BinaryReader,
  _remainingLength: number,
  version: ProtocolVersion
): DecodeResult<ConnackPacket> {
  // Connect acknowledge flags
  const ackFlags = reader.readUint8()
  if (!ackFlags.ok) {
    return ackFlags
  }

  const sessionPresent = (ackFlags.value & 0x01) !== 0
  // Reserved bits must be 0
  if (ackFlags.value & 0xfe) {
    return err(decodeError("MALFORMED_PACKET", "connack flags reserved bits must be 0", "§3.2.2.1"))
  }

  // Reason code
  const reasonCodeResult = reader.readUint8()
  if (!reasonCodeResult.ok) {
    return reasonCodeResult
  }
  const reasonCode = reasonCodeResult.value as ReasonCode

  // Properties (5.0 only)
  let properties: ConnackPacket["properties"]
  if (version === "5.0" && reader.remaining > 0) {
    const propsResult = decodeProperties(reader)
    if (!propsResult.ok) {
      return propsResult
    }
    if (propsResult.value.size > 0) {
      properties = parseConnackProperties(propsResult.value)
    }
  }

  const packet: ConnackPacket = {
    type: PacketType.CONNACK,
    sessionPresent,
    reasonCode,
    properties
  }

  return ok(packet)
}

// -----------------------------------------------------------------------------
// PUBLISH Decoding (§3.3)
// -----------------------------------------------------------------------------

function decodePublish(
  reader: BinaryReader,
  flags: number,
  remainingLength: number,
  version: ProtocolVersion
): DecodeResult<PublishPacket> {
  const startOffset = reader.offset

  const dup = (flags & 0x08) !== 0
  const rawQoS = (flags >> 1) & 0x03
  const retain = (flags & 0x01) !== 0

  // Validate QoS
  if (rawQoS === 3) {
    return err(decodeError("MALFORMED_PACKET", "invalid qos value 3", "§3.3.1.2"))
  }
  const qos = rawQoS as QoS

  // Topic name
  const topic = reader.readMqttString()
  if (!topic.ok) {
    return topic
  }

  // Packet identifier (QoS > 0 only)
  let packetId: number | undefined
  if (qos > 0) {
    const packetIdResult = reader.readUint16()
    if (!packetIdResult.ok) {
      return packetIdResult
    }
    packetId = packetIdResult.value
  }

  // Properties (5.0 only)
  let properties: PublishPacket["properties"]
  if (version === "5.0") {
    const propsResult = decodeProperties(reader)
    if (!propsResult.ok) {
      return propsResult
    }
    if (propsResult.value.size > 0) {
      properties = parsePublishProperties(propsResult.value)
    }
  }

  // Payload - remaining bytes
  const bytesRead = reader.offset - startOffset
  const payloadLength = remainingLength - bytesRead
  let payload: Uint8Array
  if (payloadLength > 0) {
    const payloadResult = reader.readBytes(payloadLength)
    if (!payloadResult.ok) {
      return payloadResult
    }
    payload = payloadResult.value
  } else {
    payload = new Uint8Array(0)
  }

  const packet: PublishPacket = {
    type: PacketType.PUBLISH,
    topic: topic.value,
    packetId,
    qos,
    retain,
    dup,
    payload,
    properties
  }

  return ok(packet)
}

// -----------------------------------------------------------------------------
// PUBACK/PUBREC/PUBREL/PUBCOMP Decoding (§3.4-§3.7)
// -----------------------------------------------------------------------------

function decodePuback(
  reader: BinaryReader,
  remainingLength: number,
  version: ProtocolVersion
): DecodeResult<PubackPacket> {
  const packetIdResult = reader.readUint16()
  if (!packetIdResult.ok) {
    return packetIdResult
  }

  let reasonCode: ReasonCode | undefined
  let properties: PubackPacket["properties"]

  // 5.0: reason code and properties are optional
  if (version === "5.0" && remainingLength > 2) {
    const reasonCodeResult = reader.readUint8()
    if (!reasonCodeResult.ok) {
      return reasonCodeResult
    }
    reasonCode = reasonCodeResult.value as ReasonCode

    if (remainingLength > 3) {
      const propsResult = decodeProperties(reader)
      if (!propsResult.ok) {
        return propsResult
      }
      if (propsResult.value.size > 0) {
        properties = parsePubAckProperties(propsResult.value)
      }
    }
  }

  return ok({
    type: PacketType.PUBACK,
    packetId: packetIdResult.value,
    reasonCode,
    properties
  })
}

function decodePubrec(
  reader: BinaryReader,
  remainingLength: number,
  version: ProtocolVersion
): DecodeResult<PubrecPacket> {
  const packetIdResult = reader.readUint16()
  if (!packetIdResult.ok) {
    return packetIdResult
  }

  let reasonCode: ReasonCode | undefined
  let properties: PubrecPacket["properties"]

  if (version === "5.0" && remainingLength > 2) {
    const reasonCodeResult = reader.readUint8()
    if (!reasonCodeResult.ok) {
      return reasonCodeResult
    }
    reasonCode = reasonCodeResult.value as ReasonCode

    if (remainingLength > 3) {
      const propsResult = decodeProperties(reader)
      if (!propsResult.ok) {
        return propsResult
      }
      if (propsResult.value.size > 0) {
        properties = parsePubAckProperties(propsResult.value)
      }
    }
  }

  return ok({
    type: PacketType.PUBREC,
    packetId: packetIdResult.value,
    reasonCode,
    properties
  })
}

function decodePubrel(
  reader: BinaryReader,
  remainingLength: number,
  version: ProtocolVersion
): DecodeResult<PubrelPacket> {
  const packetIdResult = reader.readUint16()
  if (!packetIdResult.ok) {
    return packetIdResult
  }

  let reasonCode: ReasonCode | undefined
  let properties: PubrelPacket["properties"]

  if (version === "5.0" && remainingLength > 2) {
    const reasonCodeResult = reader.readUint8()
    if (!reasonCodeResult.ok) {
      return reasonCodeResult
    }
    reasonCode = reasonCodeResult.value as ReasonCode

    if (remainingLength > 3) {
      const propsResult = decodeProperties(reader)
      if (!propsResult.ok) {
        return propsResult
      }
      if (propsResult.value.size > 0) {
        properties = parsePubAckProperties(propsResult.value)
      }
    }
  }

  return ok({
    type: PacketType.PUBREL,
    packetId: packetIdResult.value,
    reasonCode,
    properties
  })
}

function decodePubcomp(
  reader: BinaryReader,
  remainingLength: number,
  version: ProtocolVersion
): DecodeResult<PubcompPacket> {
  const packetIdResult = reader.readUint16()
  if (!packetIdResult.ok) {
    return packetIdResult
  }

  let reasonCode: ReasonCode | undefined
  let properties: PubcompPacket["properties"]

  if (version === "5.0" && remainingLength > 2) {
    const reasonCodeResult = reader.readUint8()
    if (!reasonCodeResult.ok) {
      return reasonCodeResult
    }
    reasonCode = reasonCodeResult.value as ReasonCode

    if (remainingLength > 3) {
      const propsResult = decodeProperties(reader)
      if (!propsResult.ok) {
        return propsResult
      }
      if (propsResult.value.size > 0) {
        properties = parsePubAckProperties(propsResult.value)
      }
    }
  }

  return ok({
    type: PacketType.PUBCOMP,
    packetId: packetIdResult.value,
    reasonCode,
    properties
  })
}

// -----------------------------------------------------------------------------
// SUBSCRIBE Decoding (§3.8)
// -----------------------------------------------------------------------------

function decodeSubscribe(
  reader: BinaryReader,
  remainingLength: number,
  version: ProtocolVersion
): DecodeResult<SubscribePacket> {
  const startOffset = reader.offset

  const packetIdResult = reader.readUint16()
  if (!packetIdResult.ok) {
    return packetIdResult
  }

  // Properties (5.0 only)
  let properties: SubscribePacket["properties"]
  if (version === "5.0") {
    const propsResult = decodeProperties(reader)
    if (!propsResult.ok) {
      return propsResult
    }
    if (propsResult.value.size > 0) {
      properties = parseSubscribeProperties(propsResult.value)
    }
  }

  // Payload - subscriptions
  const subscriptions: Subscription[] = []
  const endOffset = startOffset + remainingLength

  while (reader.offset < endOffset) {
    const topicFilter = reader.readMqttString()
    if (!topicFilter.ok) {
      return topicFilter
    }

    const optionsByte = reader.readUint8()
    if (!optionsByte.ok) {
      return optionsByte
    }

    const byte = optionsByte.value
    const qos = (byte & 0x03) as QoS

    let options: SubscriptionOptions
    if (version === "5.0") {
      options = {
        qos,
        noLocal: (byte & 0x04) !== 0,
        retainAsPublished: (byte & 0x08) !== 0,
        retainHandling: ((byte >> 4) & 0x03) as 0 | 1 | 2
      }
    } else {
      options = { qos }
    }

    subscriptions.push({
      topicFilter: topicFilter.value,
      options
    })
  }

  if (subscriptions.length === 0) {
    return err(
      decodeError("MALFORMED_PACKET", "subscribe must have at least one subscription", "§3.8.3")
    )
  }

  return ok({
    type: PacketType.SUBSCRIBE,
    packetId: packetIdResult.value,
    subscriptions,
    properties
  })
}

// -----------------------------------------------------------------------------
// SUBACK Decoding (§3.9)
// -----------------------------------------------------------------------------

function decodeSuback(
  reader: BinaryReader,
  remainingLength: number,
  version: ProtocolVersion
): DecodeResult<SubackPacket> {
  const startOffset = reader.offset

  const packetIdResult = reader.readUint16()
  if (!packetIdResult.ok) {
    return packetIdResult
  }

  // Properties (5.0 only)
  let properties: SubackPacket["properties"]
  if (version === "5.0") {
    const propsResult = decodeProperties(reader)
    if (!propsResult.ok) {
      return propsResult
    }
    if (propsResult.value.size > 0) {
      properties = parseSubackProperties(propsResult.value)
    }
  }

  // Payload - reason codes
  const reasonCodes: ReasonCode[] = []
  const endOffset = startOffset + remainingLength

  while (reader.offset < endOffset) {
    const code = reader.readUint8()
    if (!code.ok) {
      return code
    }
    reasonCodes.push(code.value as ReasonCode)
  }

  return ok({
    type: PacketType.SUBACK,
    packetId: packetIdResult.value,
    reasonCodes,
    properties
  })
}

// -----------------------------------------------------------------------------
// UNSUBSCRIBE Decoding (§3.10)
// -----------------------------------------------------------------------------

function decodeUnsubscribe(
  reader: BinaryReader,
  remainingLength: number,
  version: ProtocolVersion
): DecodeResult<UnsubscribePacket> {
  const startOffset = reader.offset

  const packetIdResult = reader.readUint16()
  if (!packetIdResult.ok) {
    return packetIdResult
  }

  // Properties (5.0 only)
  let properties: UnsubscribePacket["properties"]
  if (version === "5.0") {
    const propsResult = decodeProperties(reader)
    if (!propsResult.ok) {
      return propsResult
    }
    if (propsResult.value.size > 0) {
      properties = parseUnsubscribeProperties(propsResult.value)
    }
  }

  // Payload - topic filters
  const topicFilters: string[] = []
  const endOffset = startOffset + remainingLength

  while (reader.offset < endOffset) {
    const filter = reader.readMqttString()
    if (!filter.ok) {
      return filter
    }
    topicFilters.push(filter.value)
  }

  if (topicFilters.length === 0) {
    return err(
      decodeError("MALFORMED_PACKET", "unsubscribe must have at least one topic filter", "§3.10.3")
    )
  }

  return ok({
    type: PacketType.UNSUBSCRIBE,
    packetId: packetIdResult.value,
    topicFilters,
    properties
  })
}

// -----------------------------------------------------------------------------
// UNSUBACK Decoding (§3.11)
// -----------------------------------------------------------------------------

function decodeUnsuback(
  reader: BinaryReader,
  remainingLength: number,
  version: ProtocolVersion
): DecodeResult<UnsubackPacket> {
  const startOffset = reader.offset

  const packetIdResult = reader.readUint16()
  if (!packetIdResult.ok) {
    return packetIdResult
  }

  // Properties (5.0 only)
  let properties: UnsubackPacket["properties"]
  let reasonCodes: ReasonCode[] | undefined

  if (version === "5.0") {
    const propsResult = decodeProperties(reader)
    if (!propsResult.ok) {
      return propsResult
    }
    if (propsResult.value.size > 0) {
      properties = parseUnsubackProperties(propsResult.value)
    }

    // Payload - reason codes (5.0 only)
    reasonCodes = []
    const endOffset = startOffset + remainingLength

    while (reader.offset < endOffset) {
      const code = reader.readUint8()
      if (!code.ok) {
        return code
      }
      reasonCodes.push(code.value as ReasonCode)
    }
  }

  return ok({
    type: PacketType.UNSUBACK,
    packetId: packetIdResult.value,
    reasonCodes,
    properties
  })
}

// -----------------------------------------------------------------------------
// PINGREQ Decoding (§3.12)
// -----------------------------------------------------------------------------

function decodePingreq(): DecodeResult<PingreqPacket> {
  return ok({ type: PacketType.PINGREQ })
}

// -----------------------------------------------------------------------------
// PINGRESP Decoding (§3.13)
// -----------------------------------------------------------------------------

function decodePingresp(): DecodeResult<PingrespPacket> {
  return ok({ type: PacketType.PINGRESP })
}

// -----------------------------------------------------------------------------
// DISCONNECT Decoding (§3.14)
// -----------------------------------------------------------------------------

function decodeDisconnect(
  reader: BinaryReader,
  remainingLength: number,
  version: ProtocolVersion
): DecodeResult<DisconnectPacket> {
  // 3.1.1: no variable header or payload
  if (version === "3.1.1" || remainingLength === 0) {
    return ok({ type: PacketType.DISCONNECT })
  }

  // 5.0: reason code and properties
  let reasonCode: ReasonCode | undefined
  let properties: DisconnectPacket["properties"]

  if (remainingLength > 0) {
    const reasonCodeResult = reader.readUint8()
    if (!reasonCodeResult.ok) {
      return reasonCodeResult
    }
    reasonCode = reasonCodeResult.value as ReasonCode

    if (remainingLength > 1) {
      const propsResult = decodeProperties(reader)
      if (!propsResult.ok) {
        return propsResult
      }
      if (propsResult.value.size > 0) {
        properties = parseDisconnectProperties(propsResult.value)
      }
    }
  }

  return ok({
    type: PacketType.DISCONNECT,
    reasonCode,
    properties
  })
}

// -----------------------------------------------------------------------------
// AUTH Decoding (§3.15) - MQTT 5.0 only
// -----------------------------------------------------------------------------

function decodeAuth(reader: BinaryReader, remainingLength: number): DecodeResult<AuthPacket> {
  // Default reason code is 0x00 (success)
  let reasonCode: ReasonCode = 0x00
  let properties: AuthPacket["properties"]

  if (remainingLength > 0) {
    const reasonCodeResult = reader.readUint8()
    if (!reasonCodeResult.ok) {
      return reasonCodeResult
    }
    reasonCode = reasonCodeResult.value as ReasonCode

    if (remainingLength > 1) {
      const propsResult = decodeProperties(reader)
      if (!propsResult.ok) {
        return propsResult
      }
      if (propsResult.value.size > 0) {
        properties = parseAuthProperties(propsResult.value)
      }
    }
  }

  return ok({
    type: PacketType.AUTH,
    reasonCode,
    properties
  })
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Decoded packet result with bytes read.
 */
export type DecodedPacket = {
  /** The decoded packet */
  readonly packet: MqttPacket
  /** Total bytes consumed */
  readonly bytesRead: number
}

/** Required flags for packet types that must be 0x02 */
const REQUIRED_FLAGS_0X02: ReadonlySet<number> = new Set([
  PacketType.PUBREL,
  PacketType.SUBSCRIBE,
  PacketType.UNSUBSCRIBE
])

/** Spec section references for flag validation errors */
const FLAG_SPEC_REFS: Readonly<Record<number, string>> = {
  [PacketType.PUBREL]: "§3.6.1",
  [PacketType.SUBSCRIBE]: "§3.8.1",
  [PacketType.UNSUBSCRIBE]: "§3.10.1"
}

/** Packet names for error messages */
const PACKET_NAMES: Readonly<Record<number, string>> = {
  [PacketType.PUBREL]: "pubrel",
  [PacketType.SUBSCRIBE]: "subscribe",
  [PacketType.UNSUBSCRIBE]: "unsubscribe",
  [PacketType.PINGREQ]: "pingreq",
  [PacketType.PINGRESP]: "pingresp"
}

/** Zero-length packet types */
const ZERO_LENGTH_PACKETS: ReadonlySet<number> = new Set([PacketType.PINGREQ, PacketType.PINGRESP])

/** Spec section for zero-length errors */
const ZERO_LENGTH_SPEC_REFS: Readonly<Record<number, string>> = {
  [PacketType.PINGREQ]: "§3.12.1",
  [PacketType.PINGRESP]: "§3.13.1"
}

/** Decoder context passed to individual decoders. */
type DecoderContext = {
  reader: BinaryReader
  flags: number
  remainingLength: number
  version: ProtocolVersion
}

/** Standard decoder function signature. */
type PacketDecoder = (ctx: DecoderContext) => DecodeResult<MqttPacket>

/** Decoder lookup table. */
const PACKET_DECODERS: Readonly<Partial<Record<number, PacketDecoder>>> = {
  [PacketType.CONNECT]: (ctx) => decodeConnect(ctx.reader, ctx.remainingLength),
  [PacketType.CONNACK]: (ctx) => decodeConnack(ctx.reader, ctx.remainingLength, ctx.version),
  [PacketType.PUBLISH]: (ctx) =>
    decodePublish(ctx.reader, ctx.flags, ctx.remainingLength, ctx.version),
  [PacketType.PUBACK]: (ctx) => decodePuback(ctx.reader, ctx.remainingLength, ctx.version),
  [PacketType.PUBREC]: (ctx) => decodePubrec(ctx.reader, ctx.remainingLength, ctx.version),
  [PacketType.PUBREL]: (ctx) => decodePubrel(ctx.reader, ctx.remainingLength, ctx.version),
  [PacketType.PUBCOMP]: (ctx) => decodePubcomp(ctx.reader, ctx.remainingLength, ctx.version),
  [PacketType.SUBSCRIBE]: (ctx) => decodeSubscribe(ctx.reader, ctx.remainingLength, ctx.version),
  [PacketType.SUBACK]: (ctx) => decodeSuback(ctx.reader, ctx.remainingLength, ctx.version),
  [PacketType.UNSUBSCRIBE]: (ctx) =>
    decodeUnsubscribe(ctx.reader, ctx.remainingLength, ctx.version),
  [PacketType.UNSUBACK]: (ctx) => decodeUnsuback(ctx.reader, ctx.remainingLength, ctx.version),
  [PacketType.PINGREQ]: () => decodePingreq(),
  [PacketType.PINGRESP]: () => decodePingresp(),
  [PacketType.DISCONNECT]: (ctx) => decodeDisconnect(ctx.reader, ctx.remainingLength, ctx.version),
  [PacketType.AUTH]: (ctx) => {
    if (ctx.version !== "5.0") {
      return err(decodeError("PROTOCOL_ERROR", "auth packet only valid for mqtt 5.0", "§3.15"))
    }
    return decodeAuth(ctx.reader, ctx.remainingLength)
  }
}

/**
 * Decode an MQTT packet from binary data.
 *
 * The version parameter is used for packets where the version affects
 * the encoding (e.g., properties in 5.0). For CONNECT packets, the
 * version is determined from the packet itself.
 *
 * @param buffer - Buffer containing the packet
 * @param version - Protocol version (default: "5.0")
 * @param offset - Starting offset in buffer (default: 0)
 * @returns Decoded packet and bytes read
 *
 * @example
 * ```ts
 * const result = decodePacket(buffer, "5.0")
 * if (result.ok) {
 *   console.log(result.value.packet.type)
 * }
 * ```
 */
export function decodePacket(
  buffer: Uint8Array,
  version: ProtocolVersion = "5.0",
  offset = 0
): DecodeResult<DecodedPacket> {
  const reader = new BinaryReader(buffer, offset)
  const startOffset = reader.offset

  // Parse fixed header
  const header = parseFixedHeader(reader)
  if (!header.ok) {
    return header
  }

  const { packetType, flags, remainingLength } = header.value

  // Validate we have enough bytes for the remaining length
  if (!reader.hasRemaining(remainingLength)) {
    return err(
      decodeError("INCOMPLETE", "not enough bytes for packet payload", undefined, reader.offset)
    )
  }

  // Create a sub-reader constrained to the remaining length
  const payloadReader = reader.subReader(remainingLength)
  if (!payloadReader.ok) {
    return payloadReader
  }

  // Validate flags for packets requiring 0x02
  if (REQUIRED_FLAGS_0X02.has(packetType) && flags !== 0x02) {
    const packetName = PACKET_NAMES[packetType] ?? "packet"
    return err(
      decodeError(
        "MALFORMED_PACKET",
        `${packetName} flags must be 0x02`,
        FLAG_SPEC_REFS[packetType]
      )
    )
  }

  // Validate zero-length packets
  if (ZERO_LENGTH_PACKETS.has(packetType) && remainingLength !== 0) {
    const packetName = PACKET_NAMES[packetType] ?? "packet"
    return err(
      decodeError(
        "MALFORMED_PACKET",
        `${packetName} must have remaining length 0`,
        ZERO_LENGTH_SPEC_REFS[packetType]
      )
    )
  }

  // Look up decoder for packet type
  const decoder = PACKET_DECODERS[packetType]
  if (!decoder) {
    return err(
      decodeError("MALFORMED_PACKET", `unknown packet type: ${String(packetType)}`, "§2.1.2")
    )
  }

  const result = decoder({
    reader: payloadReader.value,
    flags,
    remainingLength,
    version
  })

  if (!result.ok) {
    return result
  }

  const bytesRead = reader.offset - startOffset
  return ok({
    packet: result.value,
    bytesRead
  })
}
