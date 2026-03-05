/**
 * MQTT packet encoder.
 *
 * Encodes typed packet objects into binary format.
 *
 * @packageDocumentation
 */

import { BinaryWriter } from "../codec/writer.js"
import { PacketType } from "../constants.js"
import { PROTOCOL_LEVEL, type ProtocolVersion } from "../types.js"
import {
  buildAuthProperties,
  buildConnackProperties,
  buildConnectProperties,
  buildDisconnectProperties,
  buildPubAckProperties,
  buildPublishProperties,
  buildSubackProperties,
  buildSubscribeProperties,
  buildUnsubackProperties,
  buildUnsubscribeProperties,
  buildWillProperties,
  encodeEmptyProperties,
  encodeProperties
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
  UnsubackPacket,
  UnsubscribePacket
} from "./types.js"

// -----------------------------------------------------------------------------
// Fixed Header Encoding
// -----------------------------------------------------------------------------

/**
 * Write the fixed header (packet type + flags + remaining length).
 */
function writeFixedHeader(
  writer: BinaryWriter,
  packetType: number,
  flags: number,
  remainingLength: number
): void {
  writer.writeUint8((packetType << 4) | (flags & 0x0f))
  writer.writeVariableByteInteger(remainingLength)
}

// -----------------------------------------------------------------------------
// CONNECT Encoding (§3.1)
// -----------------------------------------------------------------------------

/**
 * Encode a CONNECT packet to binary format.
 *
 * Encodes protocol name, level, connect flags, keep alive, properties (5.0),
 * and payload (client ID, will, username, password).
 *
 * @see MQTT 5.0 §3.1
 */
function encodeConnect(packet: ConnectPacket, version: ProtocolVersion): Uint8Array {
  const writer = new BinaryWriter()

  // Variable header
  const protocolName = "MQTT"
  const protocolLevel = PROTOCOL_LEVEL[version]

  // Connect flags
  let connectFlags = 0
  if (packet.cleanStart) {
    connectFlags |= 0x02
  }
  if (packet.will) {
    connectFlags |= 0x04
    connectFlags |= (packet.will.qos & 0x03) << 3
    if (packet.will.retain) {
      connectFlags |= 0x20
    }
  }
  if (packet.password !== undefined) {
    connectFlags |= 0x40
  }
  if (packet.username !== undefined) {
    connectFlags |= 0x80
  }

  // Calculate remaining length
  const tempWriter = new BinaryWriter()
  tempWriter.writeMqttString(protocolName)
  tempWriter.writeUint8(protocolLevel)
  tempWriter.writeUint8(connectFlags)
  tempWriter.writeUint16(packet.keepAlive)

  // Properties (5.0 only)
  if (version === "5.0") {
    if (packet.properties) {
      const rawProps = buildConnectProperties(packet.properties)
      encodeProperties(tempWriter, rawProps)
    } else {
      encodeEmptyProperties(tempWriter)
    }
  }

  // Payload
  tempWriter.writeMqttString(packet.clientId)

  if (packet.will) {
    // Will properties (5.0 only)
    if (version === "5.0") {
      if (packet.will.properties) {
        const willProps = buildWillProperties(packet.will.properties)
        encodeProperties(tempWriter, willProps)
      } else {
        encodeEmptyProperties(tempWriter)
      }
    }
    tempWriter.writeMqttString(packet.will.topic)
    tempWriter.writeMqttBinary(packet.will.payload)
  }

  if (packet.username !== undefined) {
    tempWriter.writeMqttString(packet.username)
  }
  if (packet.password !== undefined) {
    tempWriter.writeMqttBinary(packet.password)
  }

  const remainingLength = tempWriter.length

  // Write fixed header
  writeFixedHeader(writer, PacketType.CONNECT, 0, remainingLength)

  // Write variable header and payload
  writer.writeBytes(tempWriter.toUint8Array())

  return writer.toUint8Array()
}

// -----------------------------------------------------------------------------
// CONNACK Encoding (§3.2)
// -----------------------------------------------------------------------------

/**
 * Encode a CONNACK packet to binary format.
 *
 * Encodes session present flag, reason code, and properties (5.0).
 *
 * @see MQTT 5.0 §3.2
 */
function encodeConnack(packet: ConnackPacket, version: ProtocolVersion): Uint8Array {
  const writer = new BinaryWriter()
  const tempWriter = new BinaryWriter()

  // Connect acknowledge flags
  tempWriter.writeUint8(packet.sessionPresent ? 0x01 : 0x00)
  // Reason code
  tempWriter.writeUint8(packet.reasonCode)

  // Properties (5.0 only)
  if (version === "5.0") {
    if (packet.properties) {
      const rawProps = buildConnackProperties(packet.properties)
      encodeProperties(tempWriter, rawProps)
    } else {
      encodeEmptyProperties(tempWriter)
    }
  }

  const remainingLength = tempWriter.length
  writeFixedHeader(writer, PacketType.CONNACK, 0, remainingLength)
  writer.writeBytes(tempWriter.toUint8Array())

  return writer.toUint8Array()
}

// -----------------------------------------------------------------------------
// PUBLISH Encoding (§3.3)
// -----------------------------------------------------------------------------

/**
 * Encode a PUBLISH packet to binary format.
 *
 * Fixed header flags encode DUP (bit 3), QoS (bits 2-1), and RETAIN (bit 0).
 * Packet ID is only present for QoS > 0.
 *
 * @see MQTT 5.0 §3.3
 */
function encodePublish(packet: PublishPacket, version: ProtocolVersion): Uint8Array {
  const writer = new BinaryWriter()
  const tempWriter = new BinaryWriter()

  // Fixed header flags
  let flags = 0
  if (packet.dup) {
    flags |= 0x08
  }
  flags |= (packet.qos & 0x03) << 1
  if (packet.retain) {
    flags |= 0x01
  }

  // Variable header
  tempWriter.writeMqttString(packet.topic)

  // Packet identifier (QoS > 0 only)
  if (packet.qos > 0 && packet.packetId !== undefined) {
    tempWriter.writeUint16(packet.packetId)
  }

  // Properties (5.0 only)
  if (version === "5.0") {
    if (packet.properties) {
      const rawProps = buildPublishProperties(packet.properties)
      encodeProperties(tempWriter, rawProps)
    } else {
      encodeEmptyProperties(tempWriter)
    }
  }

  // Payload
  tempWriter.writeBytes(packet.payload)

  const remainingLength = tempWriter.length
  writeFixedHeader(writer, PacketType.PUBLISH, flags, remainingLength)
  writer.writeBytes(tempWriter.toUint8Array())

  return writer.toUint8Array()
}

// -----------------------------------------------------------------------------
// PUBACK/PUBREC/PUBREL/PUBCOMP Encoding (§3.4-§3.7)
// -----------------------------------------------------------------------------

/**
 * Encode PUBACK, PUBREC, PUBREL, or PUBCOMP packets.
 *
 * Shared encoder for QoS acknowledgement packets. PUBREL requires fixed header
 * flags of 0x02; others use 0x00. In 5.0, reason code and properties are omitted
 * if reason code is 0x00 (success) and no properties are present.
 *
 * @see MQTT 5.0 §3.4-§3.7
 */
function encodePubAckType(
  packetType:
    | typeof PacketType.PUBACK
    | typeof PacketType.PUBREC
    | typeof PacketType.PUBREL
    | typeof PacketType.PUBCOMP,
  packet: PubackPacket | PubrecPacket | PubrelPacket | PubcompPacket,
  version: ProtocolVersion
): Uint8Array {
  const writer = new BinaryWriter()
  const tempWriter = new BinaryWriter()

  // PUBREL has fixed header flags of 0x02
  const flags = packetType === PacketType.PUBREL ? 0x02 : 0x00

  // Packet identifier
  tempWriter.writeUint16(packet.packetId)

  // For 5.0, include reason code and properties if present
  if (version === "5.0") {
    const reasonCode = packet.reasonCode ?? 0x00
    const hasProperties =
      packet.properties !== undefined &&
      (packet.properties.reasonString !== undefined ||
        (packet.properties.userProperties !== undefined &&
          packet.properties.userProperties.length > 0))

    // Only include reason code if non-zero or has properties
    if (reasonCode !== 0x00 || hasProperties) {
      tempWriter.writeUint8(reasonCode)

      if (hasProperties) {
        const rawProps = buildPubAckProperties(packet.properties)
        encodeProperties(tempWriter, rawProps)
      }
    }
  }

  const remainingLength = tempWriter.length
  writeFixedHeader(writer, packetType, flags, remainingLength)
  writer.writeBytes(tempWriter.toUint8Array())

  return writer.toUint8Array()
}

/** Encode PUBACK (QoS 1 publish acknowledgement). @see MQTT 5.0 §3.4 */
function encodePuback(packet: PubackPacket, version: ProtocolVersion): Uint8Array {
  return encodePubAckType(PacketType.PUBACK, packet, version)
}

/** Encode PUBREC (QoS 2 publish received). @see MQTT 5.0 §3.5 */
function encodePubrec(packet: PubrecPacket, version: ProtocolVersion): Uint8Array {
  return encodePubAckType(PacketType.PUBREC, packet, version)
}

/** Encode PUBREL (QoS 2 publish release). @see MQTT 5.0 §3.6 */
function encodePubrel(packet: PubrelPacket, version: ProtocolVersion): Uint8Array {
  return encodePubAckType(PacketType.PUBREL, packet, version)
}

/** Encode PUBCOMP (QoS 2 publish complete). @see MQTT 5.0 §3.7 */
function encodePubcomp(packet: PubcompPacket, version: ProtocolVersion): Uint8Array {
  return encodePubAckType(PacketType.PUBCOMP, packet, version)
}

// -----------------------------------------------------------------------------
// SUBSCRIBE Encoding (§3.8)
// -----------------------------------------------------------------------------

/**
 * Encode a SUBSCRIBE packet to binary format.
 *
 * Fixed header flags must be 0x02. Subscription options byte layout (5.0):
 * bits 0-1: QoS, bit 2: No Local, bit 3: Retain As Published, bits 4-5: Retain Handling.
 *
 * @see MQTT 5.0 §3.8
 */
function encodeSubscribe(packet: SubscribePacket, version: ProtocolVersion): Uint8Array {
  const writer = new BinaryWriter()
  const tempWriter = new BinaryWriter()

  // SUBSCRIBE has fixed header flags of 0x02
  const flags = 0x02

  // Packet identifier
  tempWriter.writeUint16(packet.packetId)

  // Properties (5.0 only)
  if (version === "5.0") {
    if (packet.properties) {
      const rawProps = buildSubscribeProperties(packet.properties)
      encodeProperties(tempWriter, rawProps)
    } else {
      encodeEmptyProperties(tempWriter)
    }
  }

  // Payload - subscriptions
  for (const sub of packet.subscriptions) {
    tempWriter.writeMqttString(sub.topicFilter)

    if (version === "5.0") {
      // Subscription options byte
      let options = sub.options.qos & 0x03
      if (sub.options.noLocal === true) {
        options |= 0x04
      }
      if (sub.options.retainAsPublished === true) {
        options |= 0x08
      }
      options |= ((sub.options.retainHandling ?? 0) & 0x03) << 4
      tempWriter.writeUint8(options)
    } else {
      // 3.1.1 - just QoS
      tempWriter.writeUint8(sub.options.qos & 0x03)
    }
  }

  const remainingLength = tempWriter.length
  writeFixedHeader(writer, PacketType.SUBSCRIBE, flags, remainingLength)
  writer.writeBytes(tempWriter.toUint8Array())

  return writer.toUint8Array()
}

// -----------------------------------------------------------------------------
// SUBACK Encoding (§3.9)
// -----------------------------------------------------------------------------

/**
 * Encode a SUBACK packet to binary format.
 *
 * Contains one reason code per subscription in the corresponding SUBSCRIBE.
 *
 * @see MQTT 5.0 §3.9
 */
function encodeSuback(packet: SubackPacket, version: ProtocolVersion): Uint8Array {
  const writer = new BinaryWriter()
  const tempWriter = new BinaryWriter()

  // Packet identifier
  tempWriter.writeUint16(packet.packetId)

  // Properties (5.0 only)
  if (version === "5.0") {
    if (packet.properties) {
      const rawProps = buildSubackProperties(packet.properties)
      encodeProperties(tempWriter, rawProps)
    } else {
      encodeEmptyProperties(tempWriter)
    }
  }

  // Payload - reason codes
  for (const code of packet.reasonCodes) {
    tempWriter.writeUint8(code)
  }

  const remainingLength = tempWriter.length
  writeFixedHeader(writer, PacketType.SUBACK, 0, remainingLength)
  writer.writeBytes(tempWriter.toUint8Array())

  return writer.toUint8Array()
}

// -----------------------------------------------------------------------------
// UNSUBSCRIBE Encoding (§3.10)
// -----------------------------------------------------------------------------

/**
 * Encode an UNSUBSCRIBE packet to binary format.
 *
 * Fixed header flags must be 0x02. Payload contains topic filters to unsubscribe.
 *
 * @see MQTT 5.0 §3.10
 */
function encodeUnsubscribe(packet: UnsubscribePacket, version: ProtocolVersion): Uint8Array {
  const writer = new BinaryWriter()
  const tempWriter = new BinaryWriter()

  // UNSUBSCRIBE has fixed header flags of 0x02
  const flags = 0x02

  // Packet identifier
  tempWriter.writeUint16(packet.packetId)

  // Properties (5.0 only)
  if (version === "5.0") {
    if (packet.properties) {
      const rawProps = buildUnsubscribeProperties(packet.properties)
      encodeProperties(tempWriter, rawProps)
    } else {
      encodeEmptyProperties(tempWriter)
    }
  }

  // Payload - topic filters
  for (const filter of packet.topicFilters) {
    tempWriter.writeMqttString(filter)
  }

  const remainingLength = tempWriter.length
  writeFixedHeader(writer, PacketType.UNSUBSCRIBE, flags, remainingLength)
  writer.writeBytes(tempWriter.toUint8Array())

  return writer.toUint8Array()
}

// -----------------------------------------------------------------------------
// UNSUBACK Encoding (§3.11)
// -----------------------------------------------------------------------------

/**
 * Encode an UNSUBACK packet to binary format.
 *
 * In 5.0, contains reason codes for each topic filter. In 3.1.1, only packet ID.
 *
 * @see MQTT 5.0 §3.11
 */
function encodeUnsuback(packet: UnsubackPacket, version: ProtocolVersion): Uint8Array {
  const writer = new BinaryWriter()
  const tempWriter = new BinaryWriter()

  // Packet identifier
  tempWriter.writeUint16(packet.packetId)

  // Properties and reason codes (5.0 only)
  if (version === "5.0") {
    if (packet.properties) {
      const rawProps = buildUnsubackProperties(packet.properties)
      encodeProperties(tempWriter, rawProps)
    } else {
      encodeEmptyProperties(tempWriter)
    }

    // Reason codes (5.0 only)
    if (packet.reasonCodes) {
      for (const code of packet.reasonCodes) {
        tempWriter.writeUint8(code)
      }
    }
  }

  const remainingLength = tempWriter.length
  writeFixedHeader(writer, PacketType.UNSUBACK, 0, remainingLength)
  writer.writeBytes(tempWriter.toUint8Array())

  return writer.toUint8Array()
}

// -----------------------------------------------------------------------------
// PINGREQ Encoding (§3.12)
// -----------------------------------------------------------------------------

/**
 * Encode a PINGREQ packet (fixed 2 bytes: 0xC0 0x00).
 *
 * @see MQTT 5.0 §3.12
 */
function encodePingreq(_packet: PingreqPacket): Uint8Array {
  return new Uint8Array([0xc0, 0x00])
}

// -----------------------------------------------------------------------------
// PINGRESP Encoding (§3.13)
// -----------------------------------------------------------------------------

/**
 * Encode a PINGRESP packet (fixed 2 bytes: 0xD0 0x00).
 *
 * @see MQTT 5.0 §3.13
 */
function encodePingresp(_packet: PingrespPacket): Uint8Array {
  return new Uint8Array([0xd0, 0x00])
}

// -----------------------------------------------------------------------------
// DISCONNECT Encoding (§3.14)
// -----------------------------------------------------------------------------

/**
 * Encode a DISCONNECT packet to binary format.
 *
 * In 3.1.1, always fixed 2 bytes (0xE0 0x00). In 5.0, reason code and properties
 * are omitted if reason code is 0x00 (normal) and no properties present.
 *
 * @see MQTT 5.0 §3.14
 */
function encodeDisconnect(packet: DisconnectPacket, version: ProtocolVersion): Uint8Array {
  const writer = new BinaryWriter()

  if (version === "3.1.1") {
    // 3.1.1 DISCONNECT is fixed: 0xE0 0x00
    return new Uint8Array([0xe0, 0x00])
  }

  // 5.0 DISCONNECT
  const tempWriter = new BinaryWriter()
  const reasonCode = packet.reasonCode ?? 0x00
  const hasProperties =
    packet.properties !== undefined &&
    (packet.properties.sessionExpiryInterval !== undefined ||
      packet.properties.reasonString !== undefined ||
      packet.properties.serverReference !== undefined ||
      (packet.properties.userProperties !== undefined &&
        packet.properties.userProperties.length > 0))

  // Omit reason code and properties if both are default
  if (reasonCode !== 0x00 || hasProperties) {
    tempWriter.writeUint8(reasonCode)

    if (hasProperties) {
      const rawProps = buildDisconnectProperties(packet.properties)
      encodeProperties(tempWriter, rawProps)
    }
  }

  const remainingLength = tempWriter.length
  writeFixedHeader(writer, PacketType.DISCONNECT, 0, remainingLength)
  if (remainingLength > 0) {
    writer.writeBytes(tempWriter.toUint8Array())
  }

  return writer.toUint8Array()
}

// -----------------------------------------------------------------------------
// AUTH Encoding (§3.15) - MQTT 5.0 only
// -----------------------------------------------------------------------------

/**
 * Encode an AUTH packet to binary format (MQTT 5.0 only).
 *
 * Used for extended authentication. Reason code and properties can be omitted
 * if reason code is 0x00 (success) and no properties present.
 *
 * @see MQTT 5.0 §3.15
 */
function encodeAuth(packet: AuthPacket): Uint8Array {
  const writer = new BinaryWriter()
  const tempWriter = new BinaryWriter()

  const { reasonCode } = packet
  const hasProperties =
    packet.properties !== undefined &&
    (packet.properties.authenticationMethod !== undefined ||
      packet.properties.authenticationData !== undefined ||
      packet.properties.reasonString !== undefined ||
      (packet.properties.userProperties !== undefined &&
        packet.properties.userProperties.length > 0))

  // Can omit reason code and properties if reason code is 0x00 and no properties
  if (reasonCode !== 0x00 || hasProperties) {
    tempWriter.writeUint8(reasonCode)

    if (hasProperties) {
      const rawProps = buildAuthProperties(packet.properties)
      encodeProperties(tempWriter, rawProps)
    } else if (reasonCode !== 0x00) {
      // Need empty properties if reason code is present
      encodeEmptyProperties(tempWriter)
    }
  }

  const remainingLength = tempWriter.length
  writeFixedHeader(writer, PacketType.AUTH, 0, remainingLength)
  if (remainingLength > 0) {
    writer.writeBytes(tempWriter.toUint8Array())
  }

  return writer.toUint8Array()
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Encode an MQTT packet to binary format.
 *
 * @param packet - The packet to encode
 * @param version - Protocol version (default: "5.0")
 * @returns Encoded packet bytes
 *
 * @example
 * ```ts
 * const packet: ConnectPacket = {
 *   type: PacketType.CONNECT,
 *   protocolVersion: "5.0",
 *   clientId: "client-123",
 *   cleanStart: true,
 *   keepAlive: 60
 * }
 * const bytes = encodePacket(packet, "5.0")
 * ```
 */
export function encodePacket(packet: MqttPacket, version: ProtocolVersion = "5.0"): Uint8Array {
  switch (packet.type) {
    case PacketType.CONNECT:
      return encodeConnect(packet, version)
    case PacketType.CONNACK:
      return encodeConnack(packet, version)
    case PacketType.PUBLISH:
      return encodePublish(packet, version)
    case PacketType.PUBACK:
      return encodePuback(packet, version)
    case PacketType.PUBREC:
      return encodePubrec(packet, version)
    case PacketType.PUBREL:
      return encodePubrel(packet, version)
    case PacketType.PUBCOMP:
      return encodePubcomp(packet, version)
    case PacketType.SUBSCRIBE:
      return encodeSubscribe(packet, version)
    case PacketType.SUBACK:
      return encodeSuback(packet, version)
    case PacketType.UNSUBSCRIBE:
      return encodeUnsubscribe(packet, version)
    case PacketType.UNSUBACK:
      return encodeUnsuback(packet, version)
    case PacketType.PINGREQ:
      return encodePingreq(packet)
    case PacketType.PINGRESP:
      return encodePingresp(packet)
    case PacketType.DISCONNECT:
      return encodeDisconnect(packet, version)
    case PacketType.AUTH:
      return encodeAuth(packet)
  }
}
