import { describe, expect, it } from "vitest"

import { PacketType } from "../../../constants.js"
import { createTestHarness, TestHarness } from "../../../testing/index.js"

describe("testing/harness", () => {
  describe("TestHarness", () => {
    it("creates MqttWire instance in awaiting-connect state", () => {
      const harness = new TestHarness()

      expect(harness.wire).toBeDefined()
      expect(harness.wire.connectionState).toBe("awaiting-connect")
    })

    it("handles client CONNECT and sends CONNACK", async () => {
      const harness = new TestHarness()

      await harness.clientConnect({ clientId: "test" })

      expect(harness.wire.isConnected).toBe(true)
      expect(harness.wire.clientId).toBe("test")
      expect(harness.sentPackets).toHaveLength(1)
      expect(harness.sentPackets[0].packet?.type).toBe(PacketType.CONNACK)
    })

    it("records onConnect hook call", async () => {
      const harness = new TestHarness()

      await harness.clientConnect({ clientId: "test-client" })

      expect(harness.hookCalls.onConnect).toHaveLength(1)
      expect(harness.hookCalls.onConnect[0].clientId).toBe("test-client")
    })

    it("supports custom onConnect handler", async () => {
      const harness = new TestHarness()
      harness.setOnConnect(() => ({
        type: PacketType.CONNACK,
        sessionPresent: true,
        reasonCode: 0x00
      }))

      await harness.clientConnect()

      const connack = harness.lastSentPacketOfType(PacketType.CONNACK)
      expect(connack?.sessionPresent).toBe(true)
    })

    it("handles client PUBLISH QoS 0", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()

      await harness.clientPublish("test/topic", "hello world")

      expect(harness.hookCalls.onPublish).toHaveLength(1)
      expect(harness.hookCalls.onPublish[0].topic).toBe("test/topic")
    })

    it("handles client PUBLISH QoS 1 with PUBACK", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()
      const initialPackets = harness.sentPackets.length

      await harness.clientPublish("test/topic", "hello", { qos: 1, packetId: 1 })

      expect(harness.hookCalls.onPublish).toHaveLength(1)
      expect(harness.sentPackets.length).toBe(initialPackets + 1)
      const puback = harness.lastSentPacketOfType(PacketType.PUBACK)
      expect(puback?.packetId).toBe(1)
    })

    it("handles client PUBLISH QoS 2 flow", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()

      // Client sends PUBLISH QoS 2
      await harness.clientPublish("test/topic", "hello", { qos: 2, packetId: 1 })
      expect(harness.lastSentPacketOfType(PacketType.PUBREC)).toBeDefined()
      expect(harness.hookCalls.onPublish).toHaveLength(0) // Not yet delivered

      // Client sends PUBREL
      await harness.clientPubrel(1)
      expect(harness.lastSentPacketOfType(PacketType.PUBCOMP)).toBeDefined()
      expect(harness.hookCalls.onPublish).toHaveLength(1) // Now delivered
    })

    it("handles client SUBSCRIBE", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()

      await harness.clientSubscribe("test/#")

      expect(harness.hookCalls.onSubscribe).toHaveLength(1)
      expect(harness.hookCalls.onSubscribe[0].subscriptions[0].topicFilter).toBe("test/#")
      const suback = harness.lastSentPacketOfType(PacketType.SUBACK)
      expect(suback).toBeDefined()
    })

    it("handles client SUBSCRIBE with custom handler", async () => {
      const harness = new TestHarness()
      harness.setOnSubscribe((packet) => ({
        type: PacketType.SUBACK,
        packetId: packet.packetId,
        reasonCodes: [0x80] // Reject all
      }))
      await harness.clientConnect()

      await harness.clientSubscribe([{ topicFilter: "test/#", qos: 1 }])

      const suback = harness.lastSentPacketOfType(PacketType.SUBACK)
      expect(suback?.reasonCodes[0]).toBe(0x80)
    })

    it("handles client UNSUBSCRIBE", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()

      await harness.clientUnsubscribe(["test/#", "other/+"])

      expect(harness.hookCalls.onUnsubscribe).toHaveLength(1)
      const unsuback = harness.lastSentPacketOfType(PacketType.UNSUBACK)
      expect(unsuback).toBeDefined()
    })

    it("handles client PINGREQ with PINGRESP", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()
      const initialPackets = harness.sentPackets.length

      await harness.clientPing()

      expect(harness.sentPackets.length).toBe(initialPackets + 1)
      expect(harness.lastSentPacketOfType(PacketType.PINGRESP)).toBeDefined()
    })

    it("handles client DISCONNECT", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()

      await harness.clientDisconnect()

      expect(harness.hookCalls.onDisconnect).toHaveLength(1)
      expect(harness.wire.connectionState).toBe("disconnected")
    })

    it("clears all state", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()

      harness.clear()

      expect(harness.sentPackets).toHaveLength(0)
      expect(harness.hookCalls.onConnect).toHaveLength(0)
    })

    it("provides helper getters", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()

      expect(harness.lastSentPacket?.packet?.type).toBe(PacketType.CONNACK)
      expect(harness.lastSentPacketOfType(PacketType.CONNACK)).toBeDefined()
      expect(harness.getSentPacketsOfType(PacketType.CONNACK)).toHaveLength(1)
    })

    it("supports MQTT 3.1.1", async () => {
      const harness = new TestHarness()

      await harness.clientConnect({ protocolVersion: "3.1.1" })

      expect(harness.wire.isConnected).toBe(true)
      expect(harness.version).toBe("3.1.1")
    })

    it("supports server publish to client", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()
      const initialPackets = harness.sentPackets.length

      await harness.wire.publish("response/topic", new Uint8Array([1, 2, 3]))

      expect(harness.sentPackets.length).toBe(initialPackets + 1)
      const publish = harness.lastSentPacketOfType(PacketType.PUBLISH)
      expect(publish?.topic).toBe("response/topic")
    })

    it("waits for condition", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()

      // Already has 1 packet (CONNACK)
      await harness.waitFor(() => harness.sentPackets.length >= 1)
      expect(harness.sentPackets.length).toBe(1)
    })

    it("waits for sent packets count", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()

      await harness.waitForSentPackets(1)
      expect(harness.sentPackets.length).toBe(1)
    })

    it("waits for sent packet of type", async () => {
      const harness = new TestHarness()
      await harness.clientConnect()

      await harness.waitForSentPacketOfType(PacketType.CONNACK)
      expect(harness.getSentPacketsOfType(PacketType.CONNACK)).toHaveLength(1)
    })
  })

  describe("createTestHarness", () => {
    it("creates harness with defaults", () => {
      const harness = createTestHarness()

      expect(harness.wire).toBeDefined()
      expect(harness.wire.connectionState).toBe("awaiting-connect")
    })

    it("accepts options", () => {
      const harness = createTestHarness({
        maximumPacketSize: 1024
      })

      expect(harness.wire).toBeDefined()
    })
  })
})
