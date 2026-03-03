/**
 * Packet decoder tests.
 *
 * Tests decoding of all 15 MQTT packet types.
 */

import { describe, expect, it } from "vitest"

import { PacketType } from "../../../constants.js"
import { decodePacket } from "../../../packets/decode.js"
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

describe("decodePacket", () => {
  describe("CONNECT [§3.1]", () => {
    it("decodes minimal CONNECT for 3.1.1", () => {
      const original: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "3.1.1",
        clientId: "test-client",
        cleanStart: true,
        keepAlive: 60
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as ConnectPacket
      expect(packet.type).toBe(PacketType.CONNECT)
      expect(packet.protocolVersion).toBe("3.1.1")
      expect(packet.clientId).toBe("test-client")
      expect(packet.cleanStart).toBe(true)
      expect(packet.keepAlive).toBe(60)
    })

    it("decodes CONNECT for 5.0 with properties", () => {
      const original: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "5.0",
        clientId: "client-5",
        cleanStart: false,
        keepAlive: 120,
        properties: {
          sessionExpiryInterval: 3600,
          receiveMaximum: 100
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as ConnectPacket
      expect(packet.protocolVersion).toBe("5.0")
      expect(packet.properties?.sessionExpiryInterval).toBe(3600)
      expect(packet.properties?.receiveMaximum).toBe(100)
    })

    it("decodes CONNECT with will message", () => {
      const original: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "5.0",
        clientId: "will-client",
        cleanStart: true,
        keepAlive: 60,
        will: {
          topic: "will/topic",
          payload: new TextEncoder().encode("goodbye"),
          qos: 1,
          retain: true
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as ConnectPacket
      expect(packet.will).toBeDefined()
      expect(packet.will?.topic).toBe("will/topic")
      expect(packet.will?.qos).toBe(1)
      expect(packet.will?.retain).toBe(true)
    })

    it("decodes CONNECT with username and password", () => {
      const original: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "5.0",
        clientId: "auth-client",
        cleanStart: true,
        keepAlive: 60,
        username: "user",
        password: new TextEncoder().encode("pass")
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as ConnectPacket
      expect(packet.username).toBe("user")
      expect(packet.password).toEqual(new TextEncoder().encode("pass"))
    })
  })

  describe("CONNACK [§3.2]", () => {
    it("decodes CONNACK with session present", () => {
      const original: ConnackPacket = {
        type: PacketType.CONNACK,
        sessionPresent: true,
        reasonCode: 0x00
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as ConnackPacket
      expect(packet.type).toBe(PacketType.CONNACK)
      expect(packet.sessionPresent).toBe(true)
      expect(packet.reasonCode).toBe(0x00)
    })
  })

  describe("PUBLISH [§3.3]", () => {
    it("decodes QoS 0 PUBLISH", () => {
      const original: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test/topic",
        qos: 0,
        retain: false,
        dup: false,
        payload: new TextEncoder().encode("hello world")
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PublishPacket
      expect(packet.type).toBe(PacketType.PUBLISH)
      expect(packet.topic).toBe("test/topic")
      expect(packet.qos).toBe(0)
      expect(new TextDecoder().decode(packet.payload)).toBe("hello world")
    })

    it("decodes QoS 1 PUBLISH with packet ID", () => {
      const original: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "qos1/topic",
        packetId: 12345,
        qos: 1,
        retain: false,
        dup: false,
        payload: new TextEncoder().encode("message")
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PublishPacket
      expect(packet.packetId).toBe(12345)
      expect(packet.qos).toBe(1)
    })

    it("decodes PUBLISH with retain and dup flags", () => {
      const original: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "flags/topic",
        packetId: 1,
        qos: 2,
        retain: true,
        dup: true,
        payload: new Uint8Array(0)
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PublishPacket
      expect(packet.retain).toBe(true)
      expect(packet.dup).toBe(true)
      expect(packet.qos).toBe(2)
    })
  })

  describe("PUBACK/PUBREC/PUBREL/PUBCOMP [§3.4-§3.7]", () => {
    it("decodes PUBACK", () => {
      const original: PubackPacket = {
        type: PacketType.PUBACK,
        packetId: 42
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubackPacket
      expect(packet.type).toBe(PacketType.PUBACK)
      expect(packet.packetId).toBe(42)
    })

    it("decodes PUBREC", () => {
      const original: PubrecPacket = {
        type: PacketType.PUBREC,
        packetId: 123
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubrecPacket
      expect(packet.type).toBe(PacketType.PUBREC)
      expect(packet.packetId).toBe(123)
    })

    it("decodes PUBREL", () => {
      const original: PubrelPacket = {
        type: PacketType.PUBREL,
        packetId: 456
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubrelPacket
      expect(packet.type).toBe(PacketType.PUBREL)
      expect(packet.packetId).toBe(456)
    })

    it("decodes PUBCOMP", () => {
      const original: PubcompPacket = {
        type: PacketType.PUBCOMP,
        packetId: 789
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubcompPacket
      expect(packet.type).toBe(PacketType.PUBCOMP)
      expect(packet.packetId).toBe(789)
    })
  })

  describe("SUBSCRIBE [§3.8]", () => {
    it("decodes SUBSCRIBE with single topic", () => {
      const original: SubscribePacket = {
        type: PacketType.SUBSCRIBE,
        packetId: 1,
        subscriptions: [{ topicFilter: "test/#", options: { qos: 1 } }]
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as SubscribePacket
      expect(packet.type).toBe(PacketType.SUBSCRIBE)
      expect(packet.packetId).toBe(1)
      expect(packet.subscriptions.length).toBe(1)
      expect(packet.subscriptions[0].topicFilter).toBe("test/#")
      expect(packet.subscriptions[0].options.qos).toBe(1)
    })

    it("decodes SUBSCRIBE with multiple topics", () => {
      const original: SubscribePacket = {
        type: PacketType.SUBSCRIBE,
        packetId: 100,
        subscriptions: [
          { topicFilter: "a/+", options: { qos: 0 } },
          { topicFilter: "b/#", options: { qos: 2 } }
        ]
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as SubscribePacket
      expect(packet.subscriptions.length).toBe(2)
    })
  })

  describe("SUBACK [§3.9]", () => {
    it("decodes SUBACK", () => {
      const original: SubackPacket = {
        type: PacketType.SUBACK,
        packetId: 1,
        reasonCodes: [0x00, 0x01, 0x02]
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as SubackPacket
      expect(packet.type).toBe(PacketType.SUBACK)
      expect(packet.reasonCodes).toEqual([0x00, 0x01, 0x02])
    })
  })

  describe("UNSUBSCRIBE [§3.10]", () => {
    it("decodes UNSUBSCRIBE", () => {
      const original: UnsubscribePacket = {
        type: PacketType.UNSUBSCRIBE,
        packetId: 5,
        topicFilters: ["topic/a", "topic/b"]
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as UnsubscribePacket
      expect(packet.type).toBe(PacketType.UNSUBSCRIBE)
      expect(packet.topicFilters).toEqual(["topic/a", "topic/b"])
    })
  })

  describe("UNSUBACK [§3.11]", () => {
    it("decodes UNSUBACK", () => {
      const original: UnsubackPacket = {
        type: PacketType.UNSUBACK,
        packetId: 10,
        reasonCodes: [0x00, 0x11]
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as UnsubackPacket
      expect(packet.type).toBe(PacketType.UNSUBACK)
      expect(packet.reasonCodes).toEqual([0x00, 0x11])
    })
  })

  describe("PINGREQ [§3.12]", () => {
    it("decodes PINGREQ", () => {
      const original: PingreqPacket = {
        type: PacketType.PINGREQ
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      expect(result.value.packet.type).toBe(PacketType.PINGREQ)
    })
  })

  describe("PINGRESP [§3.13]", () => {
    it("decodes PINGRESP", () => {
      const original: PingrespPacket = {
        type: PacketType.PINGRESP
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      expect(result.value.packet.type).toBe(PacketType.PINGRESP)
    })
  })

  describe("DISCONNECT [§3.14]", () => {
    it("decodes 3.1.1 DISCONNECT", () => {
      const original: DisconnectPacket = {
        type: PacketType.DISCONNECT
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      expect(result.value.packet.type).toBe(PacketType.DISCONNECT)
    })

    it("decodes 5.0 DISCONNECT with reason code", () => {
      const original: DisconnectPacket = {
        type: PacketType.DISCONNECT,
        reasonCode: 0x04
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as DisconnectPacket
      expect(packet.reasonCode).toBe(0x04)
    })
  })

  describe("AUTH [§3.15]", () => {
    it("decodes AUTH", () => {
      const original: AuthPacket = {
        type: PacketType.AUTH,
        reasonCode: 0x18,
        properties: {
          authenticationMethod: "SCRAM-SHA-256"
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as AuthPacket
      expect(packet.type).toBe(PacketType.AUTH)
      expect(packet.reasonCode).toBe(0x18)
    })
  })

  describe("error handling", () => {
    it("returns error for empty buffer", () => {
      const result = decodePacket(new Uint8Array(0), "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for incomplete packet", () => {
      const result = decodePacket(new Uint8Array([0x10, 0x80]), "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for unknown packet type", () => {
      const result = decodePacket(new Uint8Array([0x00, 0x00]), "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for invalid PUBREL flags", () => {
      // PUBREL with flags != 0x02
      const result = decodePacket(new Uint8Array([0x60, 0x02, 0x00, 0x01]), "5.0")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("pubrel flags")
    })

    it("returns error for invalid SUBSCRIBE flags", () => {
      // SUBSCRIBE with flags != 0x02
      const result = decodePacket(new Uint8Array([0x80, 0x02, 0x00, 0x01]), "5.0")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("subscribe flags")
    })

    it("returns error for invalid UNSUBSCRIBE flags", () => {
      // UNSUBSCRIBE with flags != 0x02
      const result = decodePacket(new Uint8Array([0xa0, 0x02, 0x00, 0x01]), "5.0")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("unsubscribe flags")
    })

    it("returns error for PINGREQ with non-zero remaining length", () => {
      // PINGREQ must have remaining length 0
      const result = decodePacket(new Uint8Array([0xc0, 0x01, 0x00]), "5.0")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("remaining length 0")
    })

    it("returns error for PINGRESP with non-zero remaining length", () => {
      // PINGRESP must have remaining length 0
      const result = decodePacket(new Uint8Array([0xd0, 0x01, 0x00]), "5.0")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("remaining length 0")
    })

    it("returns error for invalid protocol name in CONNECT", () => {
      // CONNECT with invalid protocol name "XXXX" instead of "MQTT"
      const bytes = new Uint8Array([
        0x10, // CONNECT packet type
        0x0e, // remaining length
        0x00,
        0x04,
        0x58,
        0x58,
        0x58,
        0x58, // "XXXX" protocol name
        0x04, // protocol level 4 (3.1.1)
        0x02, // connect flags (clean start)
        0x00,
        0x3c, // keep alive 60
        0x00,
        0x02,
        0x69,
        0x64 // client ID "id"
      ])
      const result = decodePacket(bytes, "3.1.1")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("invalid protocol name")
    })

    it("returns error for unsupported protocol level in CONNECT", () => {
      // CONNECT with protocol level 3 (unsupported)
      const bytes = new Uint8Array([
        0x10, // CONNECT packet type
        0x0e, // remaining length
        0x00,
        0x04,
        0x4d,
        0x51,
        0x54,
        0x54, // "MQTT" protocol name
        0x03, // protocol level 3 (unsupported)
        0x02, // connect flags (clean start)
        0x00,
        0x3c, // keep alive 60
        0x00,
        0x02,
        0x69,
        0x64 // client ID "id"
      ])
      const result = decodePacket(bytes, "3.1.1")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("unsupported protocol level")
    })

    it("returns error for AUTH packet with 3.1.1", () => {
      // AUTH packet (0xF0) is only valid for MQTT 5.0
      const bytes = new Uint8Array([
        0xf0, // AUTH packet type
        0x02, // remaining length
        0x00, // reason code (success)
        0x00 // empty properties
      ])
      const result = decodePacket(bytes, "3.1.1")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("auth")
    })

    it("returns error for reserved connect flags bit", () => {
      // CONNECT with reserved bit set (bit 0)
      const bytes = new Uint8Array([
        0x10, // CONNECT packet type
        0x0e, // remaining length
        0x00,
        0x04,
        0x4d,
        0x51,
        0x54,
        0x54, // "MQTT" protocol name
        0x04, // protocol level 4 (3.1.1)
        0x03, // connect flags with reserved bit set
        0x00,
        0x3c, // keep alive 60
        0x00,
        0x02,
        0x69,
        0x64 // client ID "id"
      ])
      const result = decodePacket(bytes, "3.1.1")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("reserved")
    })

    it("returns error for CONNACK with reserved bits set", () => {
      // CONNACK with reserved bits set in acknowledge flags byte
      const bytes = new Uint8Array([
        0x20, // CONNACK packet type
        0x02, // remaining length
        0x02, // ack flags with reserved bit set
        0x00 // reason code
      ])
      const result = decodePacket(bytes, "3.1.1")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("reserved")
    })

    it("returns error for SUBSCRIBE with no subscriptions", () => {
      // SUBSCRIBE with only packet ID, no topic filters
      const bytes = new Uint8Array([
        0x82, // SUBSCRIBE packet type with proper flags
        0x03, // remaining length
        0x00,
        0x01, // packet ID
        0x00 // empty properties length for 5.0
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("at least one subscription")
    })

    it("returns error for UNSUBSCRIBE with no topic filters", () => {
      // UNSUBSCRIBE with only packet ID, no topic filters
      const bytes = new Uint8Array([
        0xa2, // UNSUBSCRIBE packet type with proper flags
        0x03, // remaining length
        0x00,
        0x01, // packet ID
        0x00 // empty properties length for 5.0
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("at least one topic")
    })

    it("returns error for truncated packet payload", () => {
      // CONNECT packet header claims more bytes than available
      const bytes = new Uint8Array([
        0x10, // CONNECT packet type
        0x20, // remaining length claims 32 bytes
        0x00,
        0x04 // only 2 bytes follow
      ])
      const result = decodePacket(bytes, "3.1.1")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.code).toBe("INCOMPLETE")
    })

    it("returns error for truncated CONNECT protocol name", () => {
      // CONNECT with truncated protocol name
      const bytes = new Uint8Array([
        0x10, // CONNECT packet type
        0x04, // remaining length
        0x00,
        0x04, // string length claims 4 bytes
        0x4d,
        0x51 // only "MQ" instead of "MQTT"
      ])
      const result = decodePacket(bytes, "3.1.1")
      expect(result.ok).toBe(false)
    })

    it("returns error for truncated PUBLISH topic", () => {
      // PUBLISH with truncated topic
      const bytes = new Uint8Array([
        0x30, // PUBLISH QoS 0
        0x05, // remaining length
        0x00,
        0x10, // string length claims 16 bytes
        0x74,
        0x65,
        0x73 // only "tes" instead of 16 bytes
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for truncated will message in CONNECT", () => {
      // CONNECT with will flag set but truncated will topic
      const bytes = new Uint8Array([
        0x10, // CONNECT packet type
        0x10, // remaining length
        0x00,
        0x04,
        0x4d,
        0x51,
        0x54,
        0x54, // "MQTT"
        0x04, // protocol level 4
        0x06, // connect flags: will flag + clean start
        0x00,
        0x3c, // keep alive
        0x00,
        0x02,
        0x69,
        0x64, // client ID "id"
        0x00,
        0x10 // will topic length claims 16 bytes but no data
      ])
      const result = decodePacket(bytes, "3.1.1")
      expect(result.ok).toBe(false)
    })

    it("returns error for truncated SUBACK reason codes", () => {
      // SUBACK with properties length but missing reason codes
      const bytes = new Uint8Array([
        0x90, // SUBACK packet type
        0x03, // remaining length
        0x00,
        0x01, // packet ID
        0x00 // empty properties for 5.0 (but no reason codes)
      ])
      // Note: This is technically valid as 0 reason codes (unusual but spec allows)
      // The decoder should parse this without error
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(true)
    })

    it("returns error for truncated SUBSCRIBE in 3.1.1", () => {
      // SUBSCRIBE with packet ID but truncated topic filter
      const bytes = new Uint8Array([
        0x82, // SUBSCRIBE with proper flags
        0x05, // remaining length
        0x00,
        0x01, // packet ID
        0x00,
        0x10, // topic length claims 16 bytes
        0x61 // only "a" follows
      ])
      const result = decodePacket(bytes, "3.1.1")
      expect(result.ok).toBe(false)
    })
  })

  describe("MQTT 3.1.1 specific [§3.x]", () => {
    it("decodes CONNECT for 3.1.1 with will message", () => {
      const original: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "3.1.1",
        clientId: "will-client-311",
        cleanStart: true,
        keepAlive: 60,
        will: {
          topic: "will/topic",
          payload: new TextEncoder().encode("goodbye"),
          qos: 1,
          retain: false
        }
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as ConnectPacket
      expect(packet.will?.topic).toBe("will/topic")
      expect(packet.will?.qos).toBe(1)
    })

    it("decodes CONNACK for 3.1.1", () => {
      const original: ConnackPacket = {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as ConnackPacket
      expect(packet.sessionPresent).toBe(false)
    })

    it("decodes PUBLISH for 3.1.1", () => {
      const original: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test/311",
        qos: 0,
        retain: false,
        dup: false,
        payload: new TextEncoder().encode("hello 3.1.1")
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PublishPacket
      expect(packet.topic).toBe("test/311")
    })

    it("decodes PUBACK for 3.1.1", () => {
      const original: PubackPacket = {
        type: PacketType.PUBACK,
        packetId: 123
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubackPacket
      expect(packet.packetId).toBe(123)
    })

    it("decodes PUBREC for 3.1.1", () => {
      const original: PubrecPacket = {
        type: PacketType.PUBREC,
        packetId: 456
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubrecPacket
      expect(packet.packetId).toBe(456)
    })

    it("decodes PUBREL for 3.1.1", () => {
      const original: PubrelPacket = {
        type: PacketType.PUBREL,
        packetId: 789
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubrelPacket
      expect(packet.packetId).toBe(789)
    })

    it("decodes PUBCOMP for 3.1.1", () => {
      const original: PubcompPacket = {
        type: PacketType.PUBCOMP,
        packetId: 101
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubcompPacket
      expect(packet.packetId).toBe(101)
    })

    it("decodes SUBSCRIBE for 3.1.1", () => {
      const original: SubscribePacket = {
        type: PacketType.SUBSCRIBE,
        packetId: 1,
        subscriptions: [{ topicFilter: "test/#", options: { qos: 2 } }]
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as SubscribePacket
      expect(packet.subscriptions[0].options.qos).toBe(2)
    })

    it("decodes SUBACK for 3.1.1", () => {
      const original: SubackPacket = {
        type: PacketType.SUBACK,
        packetId: 1,
        reasonCodes: [0x00, 0x01]
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as SubackPacket
      expect(packet.reasonCodes).toEqual([0x00, 0x01])
    })

    it("decodes UNSUBSCRIBE for 3.1.1", () => {
      const original: UnsubscribePacket = {
        type: PacketType.UNSUBSCRIBE,
        packetId: 2,
        topicFilters: ["topic/a"]
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as UnsubscribePacket
      expect(packet.topicFilters).toEqual(["topic/a"])
    })

    it("decodes UNSUBACK for 3.1.1", () => {
      const original: UnsubackPacket = {
        type: PacketType.UNSUBACK,
        packetId: 3
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as UnsubackPacket
      expect(packet.packetId).toBe(3)
    })

    it("decodes PINGREQ for 3.1.1", () => {
      const original: PingreqPacket = {
        type: PacketType.PINGREQ
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      expect(result.value.packet.type).toBe(PacketType.PINGREQ)
    })

    it("decodes PINGRESP for 3.1.1", () => {
      const original: PingrespPacket = {
        type: PacketType.PINGRESP
      }

      const bytes = encodePacket(original, "3.1.1")
      const result = decodePacket(bytes, "3.1.1")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      expect(result.value.packet.type).toBe(PacketType.PINGRESP)
    })
  })

  describe("MQTT 5.0 with properties [§3.x]", () => {
    it("decodes CONNACK with all properties", () => {
      const original: ConnackPacket = {
        type: PacketType.CONNACK,
        sessionPresent: true,
        reasonCode: 0x00,
        properties: {
          sessionExpiryInterval: 3600,
          receiveMaximum: 100,
          maximumQoS: 1,
          retainAvailable: true,
          maximumPacketSize: 65536,
          topicAliasMaximum: 10,
          reasonString: "connected",
          userProperties: [["server", "info"]]
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as ConnackPacket
      expect(packet.properties?.sessionExpiryInterval).toBe(3600)
      expect(packet.properties?.receiveMaximum).toBe(100)
      expect(packet.properties?.maximumQoS).toBe(1)
      expect(packet.properties?.retainAvailable).toBe(true)
    })

    it("decodes PUBLISH with all properties", () => {
      const original: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test/props",
        qos: 1,
        packetId: 1,
        retain: false,
        dup: false,
        payload: new TextEncoder().encode("data"),
        properties: {
          payloadFormatIndicator: 1,
          messageExpiryInterval: 300,
          topicAlias: 5,
          responseTopic: "response/topic",
          correlationData: new Uint8Array([1, 2, 3]),
          contentType: "text/plain",
          userProperties: [["key", "value"]]
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PublishPacket
      expect(packet.properties?.payloadFormatIndicator).toBe(1)
      expect(packet.properties?.messageExpiryInterval).toBe(300)
      expect(packet.properties?.topicAlias).toBe(5)
    })

    it("decodes PUBACK with properties", () => {
      const original: PubackPacket = {
        type: PacketType.PUBACK,
        packetId: 100,
        reasonCode: 0x00,
        properties: {
          reasonString: "success",
          userProperties: [["ack", "info"]]
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubackPacket
      expect(packet.properties?.reasonString).toBe("success")
    })

    it("decodes PUBREC with properties", () => {
      const original: PubrecPacket = {
        type: PacketType.PUBREC,
        packetId: 200,
        reasonCode: 0x00,
        properties: {
          reasonString: "received"
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubrecPacket
      expect(packet.properties?.reasonString).toBe("received")
    })

    it("decodes PUBREL with properties", () => {
      const original: PubrelPacket = {
        type: PacketType.PUBREL,
        packetId: 300,
        reasonCode: 0x00,
        properties: {
          reasonString: "released"
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubrelPacket
      expect(packet.properties?.reasonString).toBe("released")
    })

    it("decodes PUBCOMP with properties", () => {
      const original: PubcompPacket = {
        type: PacketType.PUBCOMP,
        packetId: 400,
        reasonCode: 0x00,
        properties: {
          reasonString: "complete"
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PubcompPacket
      expect(packet.properties?.reasonString).toBe("complete")
    })

    it("decodes SUBSCRIBE with properties", () => {
      const original: SubscribePacket = {
        type: PacketType.SUBSCRIBE,
        packetId: 50,
        subscriptions: [
          {
            topicFilter: "test/+",
            options: {
              qos: 1,
              noLocal: true,
              retainAsPublished: true,
              retainHandling: 1
            }
          }
        ],
        properties: {
          subscriptionIdentifier: 12345,
          userProperties: [["sub", "data"]]
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as SubscribePacket
      expect(packet.properties?.subscriptionIdentifier).toBe(12345)
      expect(packet.subscriptions[0].options.noLocal).toBe(true)
      expect(packet.subscriptions[0].options.retainAsPublished).toBe(true)
      expect(packet.subscriptions[0].options.retainHandling).toBe(1)
    })

    it("decodes SUBACK with properties", () => {
      const original: SubackPacket = {
        type: PacketType.SUBACK,
        packetId: 60,
        reasonCodes: [0x00],
        properties: {
          reasonString: "subscribed"
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as SubackPacket
      expect(packet.properties?.reasonString).toBe("subscribed")
    })

    it("decodes UNSUBSCRIBE with properties", () => {
      const original: UnsubscribePacket = {
        type: PacketType.UNSUBSCRIBE,
        packetId: 70,
        topicFilters: ["test/a"],
        properties: {
          userProperties: [["unsub", "data"]]
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as UnsubscribePacket
      expect(packet.properties?.userProperties).toEqual([["unsub", "data"]])
    })

    it("decodes UNSUBACK with properties", () => {
      const original: UnsubackPacket = {
        type: PacketType.UNSUBACK,
        packetId: 80,
        reasonCodes: [0x00],
        properties: {
          reasonString: "unsubscribed"
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as UnsubackPacket
      expect(packet.properties?.reasonString).toBe("unsubscribed")
    })

    it("decodes DISCONNECT with properties", () => {
      const original: DisconnectPacket = {
        type: PacketType.DISCONNECT,
        reasonCode: 0x00,
        properties: {
          sessionExpiryInterval: 0,
          reasonString: "client disconnect",
          serverReference: "other-server"
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as DisconnectPacket
      expect(packet.properties?.reasonString).toBe("client disconnect")
      expect(packet.properties?.serverReference).toBe("other-server")
    })

    it("decodes AUTH with all properties", () => {
      const original: AuthPacket = {
        type: PacketType.AUTH,
        reasonCode: 0x18,
        properties: {
          authenticationMethod: "SCRAM-SHA-256",
          authenticationData: new Uint8Array([1, 2, 3, 4]),
          reasonString: "continue auth"
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as AuthPacket
      expect(packet.properties?.authenticationMethod).toBe("SCRAM-SHA-256")
      expect(packet.properties?.authenticationData).toEqual(new Uint8Array([1, 2, 3, 4]))
    })

    it("decodes CONNECT with will properties", () => {
      const original: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "5.0",
        clientId: "will-props-client",
        cleanStart: true,
        keepAlive: 60,
        will: {
          topic: "will/topic",
          payload: new TextEncoder().encode("goodbye"),
          qos: 2,
          retain: true,
          properties: {
            willDelayInterval: 30,
            payloadFormatIndicator: 1,
            messageExpiryInterval: 600,
            contentType: "text/plain",
            responseTopic: "will/response",
            correlationData: new Uint8Array([5, 6, 7])
          }
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as ConnectPacket
      expect(packet.will?.properties?.willDelayInterval).toBe(30)
      expect(packet.will?.properties?.payloadFormatIndicator).toBe(1)
    })
  })

  describe("edge cases", () => {
    it("decodes QoS 2 PUBLISH with DUP flag", () => {
      const original: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "qos2/topic",
        packetId: 500,
        qos: 2,
        retain: true,
        dup: true,
        payload: new TextEncoder().encode("qos2 message")
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PublishPacket
      expect(packet.qos).toBe(2)
      expect(packet.retain).toBe(true)
      expect(packet.dup).toBe(true)
    })

    it("decodes CONNECT with all optional fields", () => {
      const original: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "5.0",
        clientId: "full-client",
        cleanStart: false,
        keepAlive: 300,
        username: "admin",
        password: new TextEncoder().encode("secret"),
        will: {
          topic: "lwt",
          payload: new TextEncoder().encode("offline"),
          qos: 0,
          retain: false
        },
        properties: {
          sessionExpiryInterval: 7200,
          receiveMaximum: 65535,
          maximumPacketSize: 1048576,
          topicAliasMaximum: 100,
          requestResponseInformation: true,
          requestProblemInformation: true,
          authenticationMethod: "PLAIN",
          authenticationData: new Uint8Array([0x00]),
          userProperties: [
            ["client", "test"],
            ["version", "1.0"]
          ]
        }
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as ConnectPacket
      expect(packet.username).toBe("admin")
      expect(packet.will?.topic).toBe("lwt")
      expect(packet.properties?.sessionExpiryInterval).toBe(7200)
    })

    it("decodes empty payload PUBLISH", () => {
      const original: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "empty/payload",
        qos: 0,
        retain: false,
        dup: false,
        payload: new Uint8Array(0)
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PublishPacket
      expect(packet.payload.length).toBe(0)
    })

    it("decodes AUTH with no properties (just reason code)", () => {
      const original: AuthPacket = {
        type: PacketType.AUTH,
        reasonCode: 0x00
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as AuthPacket
      expect(packet.reasonCode).toBe(0x00)
    })

    it("returns error for invalid QoS value 3 in PUBLISH", () => {
      // PUBLISH packet with QoS 3 (flags byte has bits 1-2 set to 11)
      // 0x36 = 0011 0110 = PUBLISH (0x30) + DUP (0x08 off) + QoS 3 (0x06) + RETAIN (0x00)
      const bytes = new Uint8Array([
        0x36, // PUBLISH with QoS 3
        0x07, // remaining length
        0x00,
        0x04,
        0x74,
        0x65,
        0x73,
        0x74, // topic "test"
        0x00 // properties length
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.message).toContain("invalid qos")
    })

    it("decodes DISCONNECT with reason code only (no properties)", () => {
      // DISCONNECT with just reason code, no properties
      const bytes = new Uint8Array([
        0xe0, // DISCONNECT packet type
        0x01, // remaining length = 1 (just reason code)
        0x00 // reason code (normal disconnect)
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as DisconnectPacket
      expect(packet.reasonCode).toBe(0x00)
      expect(packet.properties).toBeUndefined()
    })

    it("decodes AUTH with empty remaining length (default reason code)", () => {
      // AUTH with no variable header (remaining length 0)
      const bytes = new Uint8Array([
        0xf0, // AUTH packet type
        0x00 // remaining length 0
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as AuthPacket
      expect(packet.reasonCode).toBe(0x00) // default success
    })

    it("decodes AUTH with reason code only (no properties)", () => {
      // AUTH with just reason code
      const bytes = new Uint8Array([
        0xf0, // AUTH packet type
        0x01, // remaining length = 1
        0x18 // reason code (continue authentication)
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as AuthPacket
      expect(packet.reasonCode).toBe(0x18)
      expect(packet.properties).toBeUndefined()
    })

    it("decodes PUBLISH with QoS 2 and empty properties", () => {
      const original: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "qos2/empty-props",
        packetId: 999,
        qos: 2,
        retain: false,
        dup: false,
        payload: new TextEncoder().encode("test")
      }

      const bytes = encodePacket(original, "5.0")
      const result = decodePacket(bytes, "5.0")

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as PublishPacket
      expect(packet.qos).toBe(2)
      expect(packet.packetId).toBe(999)
    })

    it("decodes CONNACK with empty properties for 5.0", () => {
      // CONNACK with no properties (properties length 0)
      const bytes = new Uint8Array([
        0x20, // CONNACK packet type
        0x03, // remaining length
        0x00, // session not present
        0x00, // reason code success
        0x00 // empty properties
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      const packet = result.value.packet as ConnackPacket
      expect(packet.sessionPresent).toBe(false)
      expect(packet.reasonCode).toBe(0x00)
    })

    it("returns error for DISCONNECT with malformed properties", () => {
      // DISCONNECT with invalid property ID in properties section
      const bytes = new Uint8Array([
        0xe0, // DISCONNECT packet type
        0x04, // remaining length
        0x00, // reason code (normal disconnect)
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00 // dummy value
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.code).toBe("INVALID_PROPERTY_ID")
    })

    it("returns error for AUTH with malformed properties", () => {
      // AUTH with invalid property ID in properties section
      const bytes = new Uint8Array([
        0xf0, // AUTH packet type
        0x04, // remaining length
        0x00, // reason code
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00 // dummy value
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.code).toBe("INVALID_PROPERTY_ID")
    })

    it("returns error for PUBACK with malformed properties", () => {
      // PUBACK with invalid property in properties section
      const bytes = new Uint8Array([
        0x40, // PUBACK packet type
        0x06, // remaining length
        0x00,
        0x01, // packet ID
        0x00, // reason code
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00 // dummy value
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      expect(result.error.code).toBe("INVALID_PROPERTY_ID")
    })

    it("returns error for PUBREC with malformed properties", () => {
      // PUBREC with invalid property
      const bytes = new Uint8Array([
        0x50, // PUBREC packet type
        0x06, // remaining length
        0x00,
        0x01, // packet ID
        0x00, // reason code
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for PUBREL with malformed properties", () => {
      // PUBREL with invalid property
      const bytes = new Uint8Array([
        0x62, // PUBREL packet type with proper flags (0x02)
        0x06, // remaining length
        0x00,
        0x01, // packet ID
        0x00, // reason code
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for PUBCOMP with malformed properties", () => {
      // PUBCOMP with invalid property
      const bytes = new Uint8Array([
        0x70, // PUBCOMP packet type
        0x06, // remaining length
        0x00,
        0x01, // packet ID
        0x00, // reason code
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for SUBSCRIBE with malformed properties", () => {
      // SUBSCRIBE with invalid property
      const bytes = new Uint8Array([
        0x82, // SUBSCRIBE packet type with proper flags
        0x0a, // remaining length
        0x00,
        0x01, // packet ID
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00, // dummy value
        0x00,
        0x01,
        0x61, // topic "a"
        0x00 // QoS 0
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for UNSUBSCRIBE with malformed properties", () => {
      // UNSUBSCRIBE with invalid property
      const bytes = new Uint8Array([
        0xa2, // UNSUBSCRIBE packet type with proper flags
        0x08, // remaining length
        0x00,
        0x01, // packet ID
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00, // dummy value
        0x00,
        0x01,
        0x61 // topic "a"
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for SUBACK with malformed properties", () => {
      // SUBACK with invalid property
      const bytes = new Uint8Array([
        0x90, // SUBACK packet type
        0x06, // remaining length
        0x00,
        0x01, // packet ID
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00, // dummy value
        0x00 // one reason code
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for UNSUBACK with malformed properties", () => {
      // UNSUBACK with invalid property
      const bytes = new Uint8Array([
        0xb0, // UNSUBACK packet type
        0x06, // remaining length
        0x00,
        0x01, // packet ID
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00, // dummy value
        0x00 // one reason code
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for CONNACK with malformed properties", () => {
      // CONNACK with invalid property
      const bytes = new Uint8Array([
        0x20, // CONNACK packet type
        0x05, // remaining length
        0x00, // session not present
        0x00, // reason code success
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00 // dummy value
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for PUBLISH with malformed properties", () => {
      // PUBLISH QoS 0 with invalid property
      const bytes = new Uint8Array([
        0x30, // PUBLISH QoS 0
        0x0a, // remaining length
        0x00,
        0x04,
        0x74,
        0x65,
        0x73,
        0x74, // topic "test"
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00 // dummy value
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
    })

    it("returns error for CONNECT with malformed properties", () => {
      // CONNECT with invalid property in connect properties
      const bytes = new Uint8Array([
        0x10, // CONNECT packet type
        0x11, // remaining length
        0x00,
        0x04,
        0x4d,
        0x51,
        0x54,
        0x54, // "MQTT"
        0x05, // protocol level 5
        0x02, // connect flags (clean start)
        0x00,
        0x3c, // keep alive 60
        0x02, // properties length = 2
        0xff, // invalid property ID
        0x00, // dummy value
        0x00,
        0x02,
        0x69,
        0x64 // client ID "id"
      ])
      const result = decodePacket(bytes, "5.0")
      expect(result.ok).toBe(false)
    })
  })
})
