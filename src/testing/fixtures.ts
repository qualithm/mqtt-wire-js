/**
 * MQTT spec-compliant packet fixtures for testing.
 *
 * Contains packet examples from MQTT 3.1.1 and 5.0 specifications,
 * plus edge cases for comprehensive testing.
 *
 * @example
 * ```ts
 * import { fixtures } from "@qualithm/mqtt-wire/testing"
 *
 * for (const fixture of fixtures.connect) {
 *   const encoded = encodePacket(fixture.packet, fixture.version)
 *   expect(encoded).toEqual(fixture.bytes)
 * }
 * ```
 *
 * @packageDocumentation
 */

import { PacketType } from "../constants.js"
import type {
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
} from "../packets/types.js"
import type { ProtocolVersion } from "../types.js"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * A packet fixture with expected bytes.
 */
export type PacketFixture<T extends MqttPacket = MqttPacket> = {
  /** Descriptive name for the fixture */
  readonly name: string
  /** The packet data */
  readonly packet: T
  /** Expected encoded bytes */
  readonly bytes: Uint8Array
  /** Protocol version */
  readonly version: ProtocolVersion
  /** Optional spec section reference */
  readonly specRef?: string
}

/**
 * A malformed packet fixture that should be rejected.
 */
export type MalformedFixture = {
  /** Descriptive name */
  readonly name: string
  /** Malformed bytes */
  readonly bytes: Uint8Array
  /** Protocol version */
  readonly version: ProtocolVersion
  /** Expected error code */
  readonly expectedError: string
  /** Optional spec section reference */
  readonly specRef?: string
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Create a Uint8Array from hex string.
 */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, "")
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Create a Uint8Array from ASCII string.
 */
export function fromAscii(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

// -----------------------------------------------------------------------------
// CONNECT Fixtures
// -----------------------------------------------------------------------------

/**
 * CONNECT packet fixtures.
 */
export const connectFixtures: PacketFixture<ConnectPacket>[] = [
  {
    name: "minimal MQTT 5.0 CONNECT",
    version: "5.0",
    specRef: "§3.1",
    packet: {
      type: PacketType.CONNECT,
      protocolVersion: "5.0",
      clientId: "",
      cleanStart: true,
      keepAlive: 0
    },
    bytes: fromHex("10 0d 00 04 4d 51 54 54 05 02 00 00 00 00 00")
  },
  {
    name: "MQTT 5.0 CONNECT with client ID",
    version: "5.0",
    specRef: "§3.1",
    packet: {
      type: PacketType.CONNECT,
      protocolVersion: "5.0",
      clientId: "test",
      cleanStart: true,
      keepAlive: 60
    },
    bytes: fromHex("10 11 00 04 4d 51 54 54 05 02 00 3c 00 00 04 74 65 73 74")
  },
  {
    name: "MQTT 3.1.1 CONNECT",
    version: "3.1.1",
    specRef: "§3.1",
    packet: {
      type: PacketType.CONNECT,
      protocolVersion: "3.1.1",
      clientId: "test",
      cleanStart: true,
      keepAlive: 60
    },
    bytes: fromHex("10 10 00 04 4d 51 54 54 04 02 00 3c 00 04 74 65 73 74")
  },
  {
    name: "MQTT 5.0 CONNECT with username/password",
    version: "5.0",
    specRef: "§3.1.3.5",
    packet: {
      type: PacketType.CONNECT,
      protocolVersion: "5.0",
      clientId: "c1",
      cleanStart: true,
      keepAlive: 30,
      username: "user",
      password: fromAscii("pass")
    },
    bytes: fromHex(
      "10 1b 00 04 4d 51 54 54 05 c2 00 1e 00 00 02 63 31 00 04 75 73 65 72 00 04 70 61 73 73"
    )
  },
  {
    name: "MQTT 5.0 CONNECT with properties",
    version: "5.0",
    specRef: "§3.1.2.11",
    packet: {
      type: PacketType.CONNECT,
      protocolVersion: "5.0",
      clientId: "c1",
      cleanStart: true,
      keepAlive: 60,
      properties: {
        sessionExpiryInterval: 3600,
        receiveMaximum: 100,
        topicAliasMaximum: 10
      }
    },
    bytes: fromHex(
      "10 1e 00 04 4d 51 54 54 05 02 00 3c 0b 11 00 00 0e 10 21 00 64 22 00 0a 00 02 63 31"
    )
  }
]

// -----------------------------------------------------------------------------
// CONNACK Fixtures
// -----------------------------------------------------------------------------

/**
 * CONNACK packet fixtures.
 */
export const connackFixtures: PacketFixture<ConnackPacket>[] = [
  {
    name: "successful MQTT 5.0 CONNACK",
    version: "5.0",
    specRef: "§3.2",
    packet: {
      type: PacketType.CONNACK,
      sessionPresent: false,
      reasonCode: 0x00
    },
    bytes: fromHex("20 03 00 00 00")
  },
  {
    name: "MQTT 5.0 CONNACK with session present",
    version: "5.0",
    specRef: "§3.2.2.1.1",
    packet: {
      type: PacketType.CONNACK,
      sessionPresent: true,
      reasonCode: 0x00
    },
    bytes: fromHex("20 03 01 00 00")
  },
  {
    name: "MQTT 3.1.1 CONNACK",
    version: "3.1.1",
    specRef: "§3.2",
    packet: {
      type: PacketType.CONNACK,
      sessionPresent: false,
      reasonCode: 0x00
    },
    bytes: fromHex("20 02 00 00")
  },
  {
    name: "MQTT 5.0 CONNACK with properties",
    version: "5.0",
    specRef: "§3.2.2.3",
    packet: {
      type: PacketType.CONNACK,
      sessionPresent: false,
      reasonCode: 0x00,
      properties: {
        receiveMaximum: 20,
        topicAliasMaximum: 10,
        maximumQoS: 1,
        retainAvailable: true
      }
    },
    bytes: fromHex("20 0b 00 00 08 21 00 14 22 00 0a 24 01 25 01")
  },
  {
    name: "MQTT 5.0 CONNACK not authorised",
    version: "5.0",
    specRef: "§3.2.2.2",
    packet: {
      type: PacketType.CONNACK,
      sessionPresent: false,
      reasonCode: 0x87
    },
    bytes: fromHex("20 03 00 87 00")
  }
]

// -----------------------------------------------------------------------------
// PUBLISH Fixtures
// -----------------------------------------------------------------------------

/**
 * PUBLISH packet fixtures.
 */
export const publishFixtures: PacketFixture<PublishPacket>[] = [
  {
    name: "QoS 0 PUBLISH",
    version: "5.0",
    specRef: "§3.3",
    packet: {
      type: PacketType.PUBLISH,
      topic: "a/b",
      qos: 0,
      retain: false,
      dup: false,
      payload: fromAscii("hi")
    },
    bytes: fromHex("30 08 00 03 61 2f 62 00 68 69")
  },
  {
    name: "QoS 1 PUBLISH",
    version: "5.0",
    specRef: "§3.3",
    packet: {
      type: PacketType.PUBLISH,
      topic: "a/b",
      packetId: 1,
      qos: 1,
      retain: false,
      dup: false,
      payload: fromAscii("hi")
    },
    bytes: fromHex("32 0a 00 03 61 2f 62 00 01 00 68 69")
  },
  {
    name: "QoS 2 PUBLISH with retain",
    version: "5.0",
    specRef: "§3.3",
    packet: {
      type: PacketType.PUBLISH,
      topic: "a/b",
      packetId: 2,
      qos: 2,
      retain: true,
      dup: false,
      payload: fromAscii("hi")
    },
    bytes: fromHex("35 0a 00 03 61 2f 62 00 02 00 68 69")
  },
  {
    name: "PUBLISH with empty payload",
    version: "5.0",
    specRef: "§3.3.3",
    packet: {
      type: PacketType.PUBLISH,
      topic: "test",
      qos: 0,
      retain: false,
      dup: false,
      payload: new Uint8Array(0)
    },
    bytes: fromHex("30 07 00 04 74 65 73 74 00")
  },
  {
    name: "PUBLISH with properties",
    version: "5.0",
    specRef: "§3.3.2.3",
    packet: {
      type: PacketType.PUBLISH,
      topic: "t",
      qos: 0,
      retain: false,
      dup: false,
      payload: fromAscii("x"),
      properties: {
        messageExpiryInterval: 60,
        contentType: "text/plain"
      }
    },
    bytes: fromHex("30 18 00 01 74 11 02 00 00 00 3c 03 00 0a 74 65 78 74 2f 70 6c 61 69 6e 78")
  },
  {
    name: "MQTT 3.1.1 QoS 1 PUBLISH",
    version: "3.1.1",
    specRef: "§3.3",
    packet: {
      type: PacketType.PUBLISH,
      topic: "test",
      packetId: 1,
      qos: 1,
      retain: false,
      dup: false,
      payload: fromAscii("hello")
    },
    bytes: fromHex("32 0e 00 04 74 65 73 74 00 01 68 65 6c 6c 6f")
  }
]

// -----------------------------------------------------------------------------
// PUBACK/PUBREC/PUBREL/PUBCOMP Fixtures
// -----------------------------------------------------------------------------

/**
 * PUBACK packet fixtures.
 */
export const pubackFixtures: PacketFixture<PubackPacket>[] = [
  {
    name: "MQTT 5.0 PUBACK success (short form)",
    version: "5.0",
    specRef: "§3.4",
    packet: {
      type: PacketType.PUBACK,
      packetId: 1
    },
    bytes: fromHex("40 02 00 01")
  },
  {
    name: "MQTT 5.0 PUBACK with reason code",
    version: "5.0",
    specRef: "§3.4.2.1",
    packet: {
      type: PacketType.PUBACK,
      packetId: 1,
      reasonCode: 0x10 // No matching subscribers
    },
    bytes: fromHex("40 03 00 01 10")
  },
  {
    name: "MQTT 3.1.1 PUBACK",
    version: "3.1.1",
    specRef: "§3.4",
    packet: {
      type: PacketType.PUBACK,
      packetId: 1
    },
    bytes: fromHex("40 02 00 01")
  }
]

/**
 * PUBREC packet fixtures.
 */
export const pubrecFixtures: PacketFixture<PubrecPacket>[] = [
  {
    name: "MQTT 5.0 PUBREC",
    version: "5.0",
    specRef: "§3.5",
    packet: {
      type: PacketType.PUBREC,
      packetId: 1
    },
    bytes: fromHex("50 02 00 01")
  }
]

/**
 * PUBREL packet fixtures.
 */
export const pubrelFixtures: PacketFixture<PubrelPacket>[] = [
  {
    name: "MQTT 5.0 PUBREL",
    version: "5.0",
    specRef: "§3.6",
    packet: {
      type: PacketType.PUBREL,
      packetId: 1
    },
    bytes: fromHex("62 02 00 01")
  }
]

/**
 * PUBCOMP packet fixtures.
 */
export const pubcompFixtures: PacketFixture<PubcompPacket>[] = [
  {
    name: "MQTT 5.0 PUBCOMP",
    version: "5.0",
    specRef: "§3.7",
    packet: {
      type: PacketType.PUBCOMP,
      packetId: 1
    },
    bytes: fromHex("70 02 00 01")
  }
]

// -----------------------------------------------------------------------------
// SUBSCRIBE Fixtures
// -----------------------------------------------------------------------------

/**
 * SUBSCRIBE packet fixtures.
 */
export const subscribeFixtures: PacketFixture<SubscribePacket>[] = [
  {
    name: "MQTT 5.0 SUBSCRIBE single topic",
    version: "5.0",
    specRef: "§3.8",
    packet: {
      type: PacketType.SUBSCRIBE,
      packetId: 1,
      subscriptions: [{ topicFilter: "a/b", options: { qos: 1 } }]
    },
    bytes: fromHex("82 0a 00 01 00 00 03 61 2f 62 01")
  },
  {
    name: "MQTT 5.0 SUBSCRIBE multiple topics",
    version: "5.0",
    specRef: "§3.8",
    packet: {
      type: PacketType.SUBSCRIBE,
      packetId: 1,
      subscriptions: [
        { topicFilter: "a/#", options: { qos: 0 } },
        { topicFilter: "b/+", options: { qos: 2 } }
      ]
    },
    bytes: fromHex("82 10 00 01 00 00 03 61 2f 23 00 00 03 62 2f 2b 02")
  },
  {
    name: "MQTT 3.1.1 SUBSCRIBE",
    version: "3.1.1",
    specRef: "§3.8",
    packet: {
      type: PacketType.SUBSCRIBE,
      packetId: 1,
      subscriptions: [{ topicFilter: "test", options: { qos: 1 } }]
    },
    bytes: fromHex("82 09 00 01 00 04 74 65 73 74 01")
  },
  {
    name: "MQTT 5.0 SUBSCRIBE with options",
    version: "5.0",
    specRef: "§3.8.3.1",
    packet: {
      type: PacketType.SUBSCRIBE,
      packetId: 1,
      subscriptions: [
        {
          topicFilter: "t",
          options: {
            qos: 1,
            noLocal: true,
            retainAsPublished: true,
            retainHandling: 1
          }
        }
      ]
    },
    bytes: fromHex("82 08 00 01 00 00 01 74 1d")
  }
]

// -----------------------------------------------------------------------------
// SUBACK Fixtures
// -----------------------------------------------------------------------------

/**
 * SUBACK packet fixtures.
 */
export const subackFixtures: PacketFixture<SubackPacket>[] = [
  {
    name: "MQTT 5.0 SUBACK success",
    version: "5.0",
    specRef: "§3.9",
    packet: {
      type: PacketType.SUBACK,
      packetId: 1,
      reasonCodes: [0x01] // Granted QoS 1
    },
    bytes: fromHex("90 04 00 01 00 01")
  },
  {
    name: "MQTT 5.0 SUBACK multiple",
    version: "5.0",
    specRef: "§3.9",
    packet: {
      type: PacketType.SUBACK,
      packetId: 1,
      reasonCodes: [0x00, 0x02] // QoS 0 and QoS 2
    },
    bytes: fromHex("90 05 00 01 00 00 02")
  },
  {
    name: "MQTT 3.1.1 SUBACK",
    version: "3.1.1",
    specRef: "§3.9",
    packet: {
      type: PacketType.SUBACK,
      packetId: 1,
      reasonCodes: [0x01]
    },
    bytes: fromHex("90 03 00 01 01")
  },
  {
    name: "MQTT 5.0 SUBACK with failure",
    version: "5.0",
    specRef: "§3.9.3",
    packet: {
      type: PacketType.SUBACK,
      packetId: 1,
      reasonCodes: [0x01, 0x80] // QoS 1, then failure
    },
    bytes: fromHex("90 05 00 01 00 01 80")
  }
]

// -----------------------------------------------------------------------------
// UNSUBSCRIBE Fixtures
// -----------------------------------------------------------------------------

/**
 * UNSUBSCRIBE packet fixtures.
 */
export const unsubscribeFixtures: PacketFixture<UnsubscribePacket>[] = [
  {
    name: "MQTT 5.0 UNSUBSCRIBE",
    version: "5.0",
    specRef: "§3.10",
    packet: {
      type: PacketType.UNSUBSCRIBE,
      packetId: 1,
      topicFilters: ["a/b"]
    },
    bytes: fromHex("a2 08 00 01 00 00 03 61 2f 62")
  },
  {
    name: "MQTT 3.1.1 UNSUBSCRIBE",
    version: "3.1.1",
    specRef: "§3.10",
    packet: {
      type: PacketType.UNSUBSCRIBE,
      packetId: 1,
      topicFilters: ["test"]
    },
    bytes: fromHex("a2 08 00 01 00 04 74 65 73 74")
  }
]

// -----------------------------------------------------------------------------
// UNSUBACK Fixtures
// -----------------------------------------------------------------------------

/**
 * UNSUBACK packet fixtures.
 */
export const unsubackFixtures: PacketFixture<UnsubackPacket>[] = [
  {
    name: "MQTT 5.0 UNSUBACK",
    version: "5.0",
    specRef: "§3.11",
    packet: {
      type: PacketType.UNSUBACK,
      packetId: 1,
      reasonCodes: [0x00]
    },
    bytes: fromHex("b0 04 00 01 00 00")
  },
  {
    name: "MQTT 3.1.1 UNSUBACK",
    version: "3.1.1",
    specRef: "§3.11",
    packet: {
      type: PacketType.UNSUBACK,
      packetId: 1
    },
    bytes: fromHex("b0 02 00 01")
  }
]

// -----------------------------------------------------------------------------
// PINGREQ/PINGRESP Fixtures
// -----------------------------------------------------------------------------

/**
 * PINGREQ packet fixtures.
 */
export const pingreqFixtures: PacketFixture<PingreqPacket>[] = [
  {
    name: "PINGREQ",
    version: "5.0",
    specRef: "§3.12",
    packet: {
      type: PacketType.PINGREQ
    },
    bytes: fromHex("c0 00")
  }
]

/**
 * PINGRESP packet fixtures.
 */
export const pingrespFixtures: PacketFixture<PingrespPacket>[] = [
  {
    name: "PINGRESP",
    version: "5.0",
    specRef: "§3.13",
    packet: {
      type: PacketType.PINGRESP
    },
    bytes: fromHex("d0 00")
  }
]

// -----------------------------------------------------------------------------
// DISCONNECT Fixtures
// -----------------------------------------------------------------------------

/**
 * DISCONNECT packet fixtures.
 */
export const disconnectFixtures: PacketFixture<DisconnectPacket>[] = [
  {
    name: "MQTT 5.0 DISCONNECT normal",
    version: "5.0",
    specRef: "§3.14",
    packet: {
      type: PacketType.DISCONNECT
    },
    bytes: fromHex("e0 00")
  },
  {
    name: "MQTT 5.0 DISCONNECT with reason",
    version: "5.0",
    specRef: "§3.14.2.1",
    packet: {
      type: PacketType.DISCONNECT,
      reasonCode: 0x04 // Disconnect with will message
    },
    bytes: fromHex("e0 02 04 00")
  },
  {
    name: "MQTT 3.1.1 DISCONNECT",
    version: "3.1.1",
    specRef: "§3.14",
    packet: {
      type: PacketType.DISCONNECT
    },
    bytes: fromHex("e0 00")
  }
]

// -----------------------------------------------------------------------------
// Malformed Packet Fixtures
// -----------------------------------------------------------------------------

/**
 * Malformed packets that should be rejected by the decoder.
 */
export const malformedFixtures: MalformedFixture[] = [
  {
    name: "truncated fixed header",
    bytes: fromHex("30"),
    version: "5.0",
    expectedError: "INCOMPLETE",
    specRef: "§2.2"
  },
  {
    name: "invalid remaining length (5 bytes)",
    bytes: fromHex("30 ff ff ff ff 01"),
    version: "5.0",
    expectedError: "MALFORMED_VARINT",
    specRef: "§2.2.3"
  },
  {
    name: "packet too short for type",
    bytes: fromHex("20 01 00"), // CONNACK needs at least 2 bytes
    version: "5.0",
    expectedError: "INCOMPLETE",
    specRef: "§3.2"
  },
  {
    name: "invalid packet type 0",
    bytes: fromHex("00 00"),
    version: "5.0",
    expectedError: "MALFORMED_PACKET",
    specRef: "§2.1.2"
  },
  {
    name: "invalid packet type 15",
    bytes: fromHex("f0 00"),
    version: "5.0",
    expectedError: "MALFORMED_PACKET",
    specRef: "§2.1.2"
  },
  {
    name: "CONNECT with invalid protocol name",
    bytes: fromHex("10 0c 00 04 58 51 54 54 05 02 00 00 00 00 00"),
    version: "5.0",
    expectedError: "PROTOCOL_ERROR",
    specRef: "§3.1.2.1"
  },
  {
    name: "CONNECT with invalid protocol level",
    bytes: fromHex("10 0c 00 04 4d 51 54 54 03 02 00 00 00 00 00"),
    version: "5.0",
    expectedError: "PROTOCOL_ERROR",
    specRef: "§3.1.2.2"
  },
  {
    name: "PUBLISH with invalid QoS 3",
    bytes: fromHex("36 05 00 01 74 00 01"), // QoS = 3 (invalid)
    version: "5.0",
    expectedError: "MALFORMED_PACKET",
    specRef: "§3.3.1.2"
  },
  {
    name: "invalid UTF-8 in topic",
    bytes: fromHex("30 06 00 03 61 ff 62 00"), // 0xFF is invalid UTF-8
    version: "5.0",
    expectedError: "MALFORMED_UTF8",
    specRef: "§1.5.4"
  },
  {
    name: "SUBSCRIBE with no subscriptions",
    bytes: fromHex("82 03 00 01 00"), // Empty subscription list
    version: "5.0",
    expectedError: "MALFORMED_PACKET",
    specRef: "§3.8.3"
  }
]

// -----------------------------------------------------------------------------
// Edge Case Fixtures
// -----------------------------------------------------------------------------

/**
 * Edge case packets for boundary testing.
 */
export const edgeCaseFixtures = {
  /** Maximum packet ID */
  maxPacketId: {
    name: "maximum packet ID (65535)",
    version: "5.0" as ProtocolVersion,
    packet: {
      type: PacketType.PUBACK,
      packetId: 65535
    } as PubackPacket,
    bytes: fromHex("40 02 ff ff")
  },

  /** Minimum packet ID */
  minPacketId: {
    name: "minimum packet ID (1)",
    version: "5.0" as ProtocolVersion,
    packet: {
      type: PacketType.PUBACK,
      packetId: 1
    } as PubackPacket,
    bytes: fromHex("40 02 00 01")
  },

  /** Empty client ID (allowed in MQTT 5.0) */
  emptyClientId: {
    name: "empty client ID",
    version: "5.0" as ProtocolVersion,
    packet: {
      type: PacketType.CONNECT,
      protocolVersion: "5.0",
      clientId: "",
      cleanStart: true,
      keepAlive: 60
    } as ConnectPacket
  },

  /** Maximum topic length (65535 bytes would be too large for most tests) */
  longTopic: {
    name: "long topic (128 characters)",
    version: "5.0" as ProtocolVersion,
    packet: {
      type: PacketType.PUBLISH,
      topic: "a".repeat(128),
      qos: 0,
      retain: false,
      dup: false,
      payload: new Uint8Array(0)
    } as PublishPacket
  },

  /** Topic with multi-level wildcard */
  multiLevelWildcard: {
    name: "multi-level wildcard subscription",
    version: "5.0" as ProtocolVersion,
    packet: {
      type: PacketType.SUBSCRIBE,
      packetId: 1,
      subscriptions: [{ topicFilter: "sensors/#", options: { qos: 1 } }]
    } as SubscribePacket
  },

  /** Topic with single-level wildcard */
  singleLevelWildcard: {
    name: "single-level wildcard subscription",
    version: "5.0" as ProtocolVersion,
    packet: {
      type: PacketType.SUBSCRIBE,
      packetId: 1,
      subscriptions: [{ topicFilter: "sensors/+/temp", options: { qos: 1 } }]
    } as SubscribePacket
  }
}

// -----------------------------------------------------------------------------
// All Fixtures
// -----------------------------------------------------------------------------

/**
 * All packet fixtures grouped by type.
 */
export const fixtures = {
  connect: connectFixtures,
  connack: connackFixtures,
  publish: publishFixtures,
  puback: pubackFixtures,
  pubrec: pubrecFixtures,
  pubrel: pubrelFixtures,
  pubcomp: pubcompFixtures,
  subscribe: subscribeFixtures,
  suback: subackFixtures,
  unsubscribe: unsubscribeFixtures,
  unsuback: unsubackFixtures,
  pingreq: pingreqFixtures,
  pingresp: pingrespFixtures,
  disconnect: disconnectFixtures,
  malformed: malformedFixtures,
  edgeCases: edgeCaseFixtures
}

/**
 * All valid packet fixtures as a flat array.
 */
export const allValidFixtures: PacketFixture[] = [
  ...connectFixtures,
  ...connackFixtures,
  ...publishFixtures,
  ...pubackFixtures,
  ...pubrecFixtures,
  ...pubrelFixtures,
  ...pubcompFixtures,
  ...subscribeFixtures,
  ...subackFixtures,
  ...unsubscribeFixtures,
  ...unsubackFixtures,
  ...pingreqFixtures,
  ...pingrespFixtures,
  ...disconnectFixtures
]
