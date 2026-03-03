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
  })
})
