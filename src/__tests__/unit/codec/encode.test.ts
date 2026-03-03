/**
 * Packet encoder tests.
 *
 * Tests encoding of all 15 MQTT packet types.
 */

import { describe, expect, it } from "vitest"

import { PacketType } from "../../../constants.js"
import { encodePacket } from "../../../packets/encode.js"
import type {
  AuthPacket,
  ConnackPacket,
  ConnectPacket,
  DisconnectPacket,
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
} from "../../../packets/types.js"

describe("encodePacket", () => {
  describe("CONNECT [§3.1]", () => {
    it("encodes minimal CONNECT for 3.1.1", () => {
      const packet: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "3.1.1",
        clientId: "test",
        cleanStart: true,
        keepAlive: 60
      }

      const bytes = encodePacket(packet, "3.1.1")

      // Fixed header: 0x10 + remaining length
      expect(bytes[0]).toBe(0x10)

      // Verify protocol name "MQTT"
      const protocolName = new TextDecoder().decode(bytes.slice(4, 8))
      expect(protocolName).toBe("MQTT")

      // Protocol level 4 for 3.1.1
      expect(bytes[8]).toBe(4)
    })

    it("encodes minimal CONNECT for 5.0", () => {
      const packet: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "5.0",
        clientId: "test",
        cleanStart: true,
        keepAlive: 60
      }

      const bytes = encodePacket(packet, "5.0")

      // Fixed header: 0x10 + remaining length
      expect(bytes[0]).toBe(0x10)

      // Protocol level 5 for 5.0
      expect(bytes[8]).toBe(5)
    })

    it("encodes CONNECT with username and password", () => {
      const packet: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "5.0",
        clientId: "test",
        cleanStart: true,
        keepAlive: 60,
        username: "user",
        password: new Uint8Array([0x70, 0x61, 0x73, 0x73]) // "pass"
      }

      const bytes = encodePacket(packet, "5.0")

      // Connect flags should have username (0x80) and password (0x40) bits set
      expect(bytes[9] & 0xc0).toBe(0xc0)
    })

    it("encodes CONNECT with will message", () => {
      const packet: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "5.0",
        clientId: "test",
        cleanStart: true,
        keepAlive: 60,
        will: {
          topic: "will/topic",
          payload: new TextEncoder().encode("goodbye"),
          qos: 1,
          retain: true
        }
      }

      const bytes = encodePacket(packet, "5.0")

      // Connect flags should have will flag (0x04), will QoS 1 (0x08), and will retain (0x20)
      expect(bytes[9] & 0x3c).toBe(0x2c)
    })

    it("encodes CONNECT with properties", () => {
      const packet: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "5.0",
        clientId: "test",
        cleanStart: false,
        keepAlive: 120,
        properties: {
          sessionExpiryInterval: 3600,
          receiveMaximum: 100
        }
      }

      const bytes = encodePacket(packet, "5.0")

      // Should have non-zero properties length
      expect(bytes.length).toBeGreaterThan(20)
    })
  })

  describe("CONNACK [§3.2]", () => {
    it("encodes CONNACK with session present", () => {
      const packet: ConnackPacket = {
        type: PacketType.CONNACK,
        sessionPresent: true,
        reasonCode: 0x00
      }

      const bytes = encodePacket(packet, "5.0")

      // Fixed header
      expect(bytes[0]).toBe(0x20)
      // Session present flag
      expect(bytes[2]).toBe(0x01)
      // Reason code
      expect(bytes[3]).toBe(0x00)
    })

    it("encodes CONNACK with error reason code", () => {
      const packet: ConnackPacket = {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x84 // Unsupported protocol version
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes[2]).toBe(0x00)
      expect(bytes[3]).toBe(0x84)
    })
  })

  describe("PUBLISH [§3.3]", () => {
    it("encodes QoS 0 PUBLISH", () => {
      const packet: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test/topic",
        qos: 0,
        retain: false,
        dup: false,
        payload: new TextEncoder().encode("hello")
      }

      const bytes = encodePacket(packet, "5.0")

      // Fixed header: PUBLISH (0x30) with no flags
      expect(bytes[0]).toBe(0x30)
    })

    it("encodes QoS 1 PUBLISH with packet ID", () => {
      const packet: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test",
        packetId: 1234,
        qos: 1,
        retain: false,
        dup: false,
        payload: new Uint8Array(0)
      }

      const bytes = encodePacket(packet, "5.0")

      // Fixed header: PUBLISH (0x30) with QoS 1 (0x02)
      expect(bytes[0]).toBe(0x32)
    })

    it("encodes PUBLISH with retain flag", () => {
      const packet: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test",
        qos: 0,
        retain: true,
        dup: false,
        payload: new Uint8Array(0)
      }

      const bytes = encodePacket(packet, "5.0")

      // Fixed header: PUBLISH (0x30) with retain (0x01)
      expect(bytes[0]).toBe(0x31)
    })

    it("encodes PUBLISH with dup flag", () => {
      const packet: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test",
        packetId: 1,
        qos: 1,
        retain: false,
        dup: true,
        payload: new Uint8Array(0)
      }

      const bytes = encodePacket(packet, "5.0")

      // Fixed header: PUBLISH (0x30) with QoS 1 (0x02) and DUP (0x08)
      expect(bytes[0]).toBe(0x3a)
    })
  })

  describe("PUBACK [§3.4]", () => {
    it("encodes minimal PUBACK", () => {
      const packet: PubackPacket = {
        type: PacketType.PUBACK,
        packetId: 1
      }

      const bytes = encodePacket(packet, "5.0")

      // Fixed header
      expect(bytes[0]).toBe(0x40)
      // Remaining length (just packet ID)
      expect(bytes[1]).toBe(2)
      // Packet ID
      expect((bytes[2] << 8) | bytes[3]).toBe(1)
    })

    it("encodes PUBACK with reason code", () => {
      const packet: PubackPacket = {
        type: PacketType.PUBACK,
        packetId: 100,
        reasonCode: 0x10 // No matching subscribers
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes[4]).toBe(0x10)
    })
  })

  describe("PUBREC/PUBREL/PUBCOMP [§3.5-§3.7]", () => {
    it("encodes PUBREC", () => {
      const packet: PubrecPacket = {
        type: PacketType.PUBREC,
        packetId: 42
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes[0]).toBe(0x50)
      expect((bytes[2] << 8) | bytes[3]).toBe(42)
    })

    it("encodes PUBREL with flags=0x02", () => {
      const packet: PubrelPacket = {
        type: PacketType.PUBREL,
        packetId: 42
      }

      const bytes = encodePacket(packet, "5.0")

      // PUBREL has fixed flags of 0x02
      expect(bytes[0]).toBe(0x62)
    })

    it("encodes PUBCOMP", () => {
      const packet: PubcompPacket = {
        type: PacketType.PUBCOMP,
        packetId: 42
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes[0]).toBe(0x70)
    })
  })

  describe("SUBSCRIBE [§3.8]", () => {
    it("encodes SUBSCRIBE with single topic", () => {
      const packet: SubscribePacket = {
        type: PacketType.SUBSCRIBE,
        packetId: 1,
        subscriptions: [
          {
            topicFilter: "test/#",
            options: { qos: 1 }
          }
        ]
      }

      const bytes = encodePacket(packet, "5.0")

      // SUBSCRIBE has fixed flags of 0x02
      expect(bytes[0]).toBe(0x82)
    })

    it("encodes SUBSCRIBE with multiple topics", () => {
      const packet: SubscribePacket = {
        type: PacketType.SUBSCRIBE,
        packetId: 1,
        subscriptions: [
          { topicFilter: "a/b", options: { qos: 0 } },
          { topicFilter: "c/d", options: { qos: 1 } },
          { topicFilter: "e/f", options: { qos: 2 } }
        ]
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes[0]).toBe(0x82)
    })

    it("encodes SUBSCRIBE with 5.0 options", () => {
      const packet: SubscribePacket = {
        type: PacketType.SUBSCRIBE,
        packetId: 1,
        subscriptions: [
          {
            topicFilter: "test",
            options: {
              qos: 1,
              noLocal: true,
              retainAsPublished: true,
              retainHandling: 2
            }
          }
        ]
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes[0]).toBe(0x82)
    })
  })

  describe("SUBACK [§3.9]", () => {
    it("encodes SUBACK", () => {
      const packet: SubackPacket = {
        type: PacketType.SUBACK,
        packetId: 1,
        reasonCodes: [0x00, 0x01, 0x02]
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes[0]).toBe(0x90)
    })
  })

  describe("UNSUBSCRIBE [§3.10]", () => {
    it("encodes UNSUBSCRIBE", () => {
      const packet: UnsubscribePacket = {
        type: PacketType.UNSUBSCRIBE,
        packetId: 1,
        topicFilters: ["test/a", "test/b"]
      }

      const bytes = encodePacket(packet, "5.0")

      // UNSUBSCRIBE has fixed flags of 0x02
      expect(bytes[0]).toBe(0xa2)
    })
  })

  describe("UNSUBACK [§3.11]", () => {
    it("encodes UNSUBACK", () => {
      const packet: UnsubackPacket = {
        type: PacketType.UNSUBACK,
        packetId: 1,
        reasonCodes: [0x00, 0x11]
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes[0]).toBe(0xb0)
    })
  })

  describe("PINGREQ [§3.12]", () => {
    it("encodes PINGREQ as fixed bytes", () => {
      const packet: PingreqPacket = {
        type: PacketType.PINGREQ
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes).toEqual(new Uint8Array([0xc0, 0x00]))
    })
  })

  describe("PINGRESP [§3.13]", () => {
    it("encodes PINGRESP as fixed bytes", () => {
      const packet: PingrespPacket = {
        type: PacketType.PINGRESP
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes).toEqual(new Uint8Array([0xd0, 0x00]))
    })
  })

  describe("DISCONNECT [§3.14]", () => {
    it("encodes 3.1.1 DISCONNECT as fixed bytes", () => {
      const packet: DisconnectPacket = {
        type: PacketType.DISCONNECT
      }

      const bytes = encodePacket(packet, "3.1.1")

      expect(bytes).toEqual(new Uint8Array([0xe0, 0x00]))
    })

    it("encodes 5.0 DISCONNECT with default reason code as minimal", () => {
      const packet: DisconnectPacket = {
        type: PacketType.DISCONNECT,
        reasonCode: 0x00
      }

      const bytes = encodePacket(packet, "5.0")

      // With default reason code and no properties, should be minimal
      expect(bytes[0]).toBe(0xe0)
      expect(bytes[1]).toBe(0)
    })

    it("encodes 5.0 DISCONNECT with reason code", () => {
      const packet: DisconnectPacket = {
        type: PacketType.DISCONNECT,
        reasonCode: 0x04 // Disconnect with will message
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes[0]).toBe(0xe0)
      expect(bytes[2]).toBe(0x04)
    })
  })

  describe("AUTH [§3.15]", () => {
    it("encodes AUTH with success reason code", () => {
      const packet: AuthPacket = {
        type: PacketType.AUTH,
        reasonCode: 0x00
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes[0]).toBe(0xf0)
    })

    it("encodes AUTH with continue authentication", () => {
      const packet: AuthPacket = {
        type: PacketType.AUTH,
        reasonCode: 0x18,
        properties: {
          authenticationMethod: "SCRAM-SHA-256",
          authenticationData: new TextEncoder().encode("challenge")
        }
      }

      const bytes = encodePacket(packet, "5.0")

      expect(bytes[0]).toBe(0xf0)
      expect(bytes.length).toBeGreaterThan(2)
    })
  })
})
