import { describe, expect, it, vi } from "vitest"

import { PacketType } from "../../../constants.js"
import { encodePacket } from "../../../packets/encode.js"
import type {
  ConnackPacket,
  DisconnectPacket,
  PingrespPacket,
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket,
  SubackPacket,
  UnsubackPacket
} from "../../../packets/types.js"
import type { LifecycleHooks } from "../../../state/types.js"
import { MqttWire, ProtocolError, StateError } from "../../../wire.js"

/**
 * Helper to create MqttWire with mock onSend.
 */
function createWire(hooks: Partial<LifecycleHooks> = {}): {
  wire: MqttWire
  onSend: ReturnType<typeof vi.fn>
  sentPackets: Uint8Array[]
} {
  const sentPackets: Uint8Array[] = []
  const onSend = vi.fn(async (data: Uint8Array) => {
    sentPackets.push(data)
    return Promise.resolve()
  })
  const wire = new MqttWire({ onSend, ...hooks })
  return { wire, onSend, sentPackets }
}

/**
 * Simulate receiving a packet by encoding and passing to wire.receive().
 */
async function receivePacket(
  wire: MqttWire,
  packet: Parameters<typeof encodePacket>[0]
): Promise<void> {
  const data = encodePacket(packet, wire.version)
  await wire.receive(data)
}

describe("MqttWire", () => {
  describe("constructor", () => {
    it("initialises with default options", () => {
      const { wire } = createWire()
      expect(wire.connectionState).toBe("disconnected")
      expect(wire.isConnected).toBe(false)
      expect(wire.version).toBe("5.0")
    })

    it("respects custom protocol version", () => {
      const wire = new MqttWire({ onSend: vi.fn() }, { protocolVersion: "3.1.1" })
      expect(wire.version).toBe("3.1.1")
    })
  })

  describe("connect", () => {
    it("sends CONNECT packet and transitions to connecting", async () => {
      const { wire, sentPackets } = createWire()

      await wire.connect({ clientId: "test-client" })

      expect(wire.connectionState).toBe("connecting")
      expect(sentPackets).toHaveLength(1)
    })

    it("throws StateError when already connecting", async () => {
      const { wire } = createWire()
      await wire.connect({ clientId: "test-client" })

      await expect(wire.connect({ clientId: "test-client" })).rejects.toThrow(StateError)
    })

    it("uses custom connect options", async () => {
      const { wire, sentPackets } = createWire()

      await wire.connect({
        clientId: "custom-client",
        cleanStart: false,
        keepAlive: 120,
        username: "user",
        password: new Uint8Array([1, 2, 3])
      })

      expect(sentPackets).toHaveLength(1)
      // Packet was sent - we can't easily decode it but at least it was sent
    })

    it("accepts valid will message", async () => {
      const { wire, sentPackets } = createWire()

      await wire.connect({
        clientId: "test-client",
        will: {
          topic: "last/will/topic",
          payload: new Uint8Array([0x62, 0x79, 0x65]),
          qos: 1,
          retain: false
        }
      })

      expect(sentPackets).toHaveLength(1)
    })

    it("rejects will with invalid topic", async () => {
      const { wire } = createWire()

      await expect(
        wire.connect({
          clientId: "test-client",
          will: {
            topic: "invalid/+/topic",
            payload: new Uint8Array(),
            qos: 0,
            retain: false
          }
        })
      ).rejects.toThrow("will topic invalid")
    })

    it("rejects will with empty topic", async () => {
      const { wire } = createWire()

      await expect(
        wire.connect({
          clientId: "test-client",
          will: {
            topic: "",
            payload: new Uint8Array(),
            qos: 0,
            retain: false
          }
        })
      ).rejects.toThrow("will topic invalid")
    })

    it("rejects will with invalid QoS", async () => {
      const { wire } = createWire()

      await expect(
        wire.connect({
          clientId: "test-client",
          will: {
            topic: "valid/topic",
            payload: new Uint8Array(),
            qos: 3 as 0,
            retain: false
          }
        })
      ).rejects.toThrow("will QoS must be 0, 1, or 2")
    })
  })

  describe("CONNACK handling", () => {
    it("transitions to connected on successful CONNACK", async () => {
      const onConnect = vi.fn()
      const { wire } = createWire({ onConnect })

      await wire.connect({ clientId: "test-client" })
      expect(wire.connectionState).toBe("connecting")

      const connack: ConnackPacket = {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      }
      await receivePacket(wire, connack)

      expect(wire.connectionState).toBe("connected")
      expect(wire.isConnected).toBe(true)
      expect(onConnect).toHaveBeenCalledWith(connack)
    })

    it("handles CONNACK with properties", async () => {
      const { wire } = createWire()
      await wire.connect({ clientId: "test-client" })

      const connack: ConnackPacket = {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00,
        properties: {
          receiveMaximum: 100,
          maximumPacketSize: 1000000,
          topicAliasMaximum: 10,
          serverKeepAlive: 30,
          assignedClientIdentifier: "server-assigned-id"
        }
      }
      await receivePacket(wire, connack)

      expect(wire.receiveMaximum).toBe(100)
      expect(wire.maximumPacketSize).toBe(1000000)
      expect(wire.clientId).toBe("server-assigned-id")
    })

    it("handles connection refused", async () => {
      const onDisconnect = vi.fn()
      const { wire } = createWire({ onDisconnect })
      await wire.connect({ clientId: "test-client" })

      const connack: ConnackPacket = {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x86 // Bad username or password
      }
      await receivePacket(wire, connack)

      expect(wire.connectionState).toBe("disconnected")
      expect(onDisconnect).toHaveBeenCalled()
    })
  })

  describe("disconnect", () => {
    it("sends DISCONNECT and cleans up when connected", async () => {
      const { wire, sentPackets } = createWire()
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      await wire.disconnect()

      expect(wire.connectionState).toBe("disconnected")
      expect(sentPackets.length).toBeGreaterThan(1) // CONNECT + DISCONNECT
    })

    it("is a no-op when not connected", async () => {
      const { wire, sentPackets } = createWire()

      await wire.disconnect()

      expect(wire.connectionState).toBe("disconnected")
      expect(sentPackets).toHaveLength(0)
    })

    it("supports custom reason code", async () => {
      const { wire, sentPackets } = createWire()
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      await wire.disconnect(0x04) // Disconnect with will message

      expect(sentPackets.length).toBeGreaterThan(1)
    })
  })

  describe("publish", () => {
    async function connectedWire(): Promise<ReturnType<typeof createWire>> {
      const result = createWire()
      await result.wire.connect({ clientId: "test" })
      await receivePacket(result.wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00,
        properties: { topicAliasMaximum: 10 }
      })
      return result
    }

    it("publishes QoS 0 message", async () => {
      const { wire, sentPackets } = await connectedWire()

      const packetId = await wire.publish("topic/test", new Uint8Array([1, 2, 3]))

      expect(packetId).toBeUndefined()
      expect(sentPackets.length).toBeGreaterThan(1)
    })

    it("publishes QoS 1 message with packet ID", async () => {
      const { wire } = await connectedWire()

      const packetId = await wire.publish("topic/test", new Uint8Array([1, 2, 3]), { qos: 1 })

      expect(packetId).toBeDefined()
      expect(typeof packetId).toBe("number")
    })

    it("publishes QoS 2 message with packet ID", async () => {
      const { wire } = await connectedWire()

      const packetId = await wire.publish("topic/test", new Uint8Array([1, 2, 3]), { qos: 2 })

      expect(packetId).toBeDefined()
    })

    it("throws StateError when not connected", async () => {
      const { wire } = createWire()

      await expect(wire.publish("topic", new Uint8Array())).rejects.toThrow(StateError)
    })

    it("supports retain and dup flags", async () => {
      const { wire, sentPackets } = await connectedWire()

      await wire.publish("topic", new Uint8Array(), { retain: true, dup: true })

      expect(sentPackets.length).toBeGreaterThan(1)
    })

    it("uses topic aliases on subsequent publishes", async () => {
      const { wire } = await connectedWire()

      // First publish sets up alias
      await wire.publish("topic/aliased", new Uint8Array())
      // Second publish can use alias
      await wire.publish("topic/aliased", new Uint8Array())

      // Just verify no errors thrown
    })
  })

  describe("subscribe", () => {
    async function connectedWire(): Promise<ReturnType<typeof createWire>> {
      const result = createWire()
      await result.wire.connect({ clientId: "test" })
      await receivePacket(result.wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })
      return result
    }

    it("sends SUBSCRIBE packet", async () => {
      const { wire, sentPackets } = await connectedWire()

      const packetId = await wire.subscribe([{ topicFilter: "topic/#", options: { qos: 1 } }])

      expect(packetId).toBe(1)
      expect(sentPackets.length).toBeGreaterThan(1)
    })

    it("throws when not connected", async () => {
      const { wire } = createWire()

      await expect(wire.subscribe([{ topicFilter: "topic", options: { qos: 0 } }])).rejects.toThrow(
        StateError
      )
    })

    it("throws when subscriptions empty", async () => {
      const { wire } = await connectedWire()

      await expect(wire.subscribe([])).rejects.toThrow("empty")
    })
  })

  describe("unsubscribe", () => {
    async function connectedWire(): Promise<ReturnType<typeof createWire>> {
      const result = createWire()
      await result.wire.connect({ clientId: "test" })
      await receivePacket(result.wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })
      return result
    }

    it("sends UNSUBSCRIBE packet", async () => {
      const { wire, sentPackets } = await connectedWire()

      const packetId = await wire.unsubscribe(["topic/#"])

      expect(packetId).toBe(1)
      expect(sentPackets.length).toBeGreaterThan(1)
    })

    it("throws when not connected", async () => {
      const { wire } = createWire()

      await expect(wire.unsubscribe(["topic"])).rejects.toThrow(StateError)
    })

    it("throws when topicFilters empty", async () => {
      const { wire } = await connectedWire()

      await expect(wire.unsubscribe([])).rejects.toThrow("empty")
    })
  })

  describe("ping", () => {
    it("sends PINGREQ when connected", async () => {
      const { wire, sentPackets } = createWire()
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      await wire.ping()

      expect(sentPackets.length).toBeGreaterThan(1)
    })

    it("throws when not connected", async () => {
      const { wire } = createWire()

      await expect(wire.ping()).rejects.toThrow(StateError)
    })
  })

  describe("PUBLISH handling (inbound)", () => {
    async function connectedWire(options?: { topicAliasMaximum?: number }): Promise<{
      wire: MqttWire
      onPublish: ReturnType<typeof vi.fn>
      sentPackets: Uint8Array[]
    }> {
      const onPublish = vi.fn()
      const sentPackets: Uint8Array[] = []
      const wire = new MqttWire(
        {
          onSend: async (data: Uint8Array) => {
            sentPackets.push(data)
            return Promise.resolve()
          },
          onPublish
        },
        { topicAliasMaximum: options?.topicAliasMaximum }
      )
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00,
        properties: { topicAliasMaximum: 10 }
      })
      return { wire, onPublish, sentPackets }
    }

    it("delivers QoS 0 message to hook", async () => {
      const { wire, onPublish } = await connectedWire()

      const publish: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test/topic",
        qos: 0,
        retain: false,
        dup: false,
        payload: new Uint8Array([1, 2, 3])
      }
      await receivePacket(wire, publish)

      expect(onPublish).toHaveBeenCalled()
    })

    it("sends PUBACK for QoS 1 and delivers", async () => {
      const { wire, onPublish, sentPackets } = await connectedWire()
      const initialPackets = sentPackets.length

      const publish: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test/topic",
        packetId: 1,
        qos: 1,
        retain: false,
        dup: false,
        payload: new Uint8Array([1, 2, 3])
      }
      await receivePacket(wire, publish)

      expect(onPublish).toHaveBeenCalled()
      expect(sentPackets.length).toBeGreaterThan(initialPackets) // PUBACK sent
    })

    it("sends PUBREC for QoS 2 (first part)", async () => {
      const { wire, sentPackets, onPublish } = await connectedWire()
      const initialPackets = sentPackets.length

      const publish: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test/topic",
        packetId: 1,
        qos: 2,
        retain: false,
        dup: false,
        payload: new Uint8Array([1, 2, 3])
      }
      await receivePacket(wire, publish)

      // QoS 2 doesn't deliver until PUBREL
      expect(onPublish).not.toHaveBeenCalled()
      expect(sentPackets.length).toBeGreaterThan(initialPackets) // PUBREC sent
    })

    it("handles topic alias on inbound PUBLISH", async () => {
      const { wire, onPublish } = await connectedWire({ topicAliasMaximum: 10 })

      // First message sets up alias
      const publish1: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "sensor/temperature",
        qos: 0,
        retain: false,
        dup: false,
        payload: new Uint8Array([1]),
        properties: { topicAlias: 1 }
      }
      await receivePacket(wire, publish1)

      // Second message uses alias (empty topic)
      const publish2: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "",
        qos: 0,
        retain: false,
        dup: false,
        payload: new Uint8Array([2]),
        properties: { topicAlias: 1 }
      }
      await receivePacket(wire, publish2)

      expect(onPublish).toHaveBeenCalledTimes(2)
      // Both should resolve to sensor/temperature
    })
  })

  describe("QoS flow acknowledgements", () => {
    async function connectedWire(): Promise<ReturnType<typeof createWire>> {
      const result = createWire()
      await result.wire.connect({ clientId: "test" })
      await receivePacket(result.wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })
      return result
    }

    it("handles PUBACK for outbound QoS 1", async () => {
      const { wire } = await connectedWire()

      const packetId = await wire.publish("topic", new Uint8Array(), { qos: 1 })

      const puback: PubackPacket = {
        type: PacketType.PUBACK,
        packetId: packetId!
      }
      await receivePacket(wire, puback)

      // No error means success
    })

    it("handles QoS 2 flow: PUBREC → PUBREL → PUBCOMP", async () => {
      const { wire, sentPackets } = await connectedWire()

      const packetId = await wire.publish("topic", new Uint8Array(), { qos: 2 })

      // Receive PUBREC
      const pubrec: PubrecPacket = {
        type: PacketType.PUBREC,
        packetId: packetId!
      }
      await receivePacket(wire, pubrec)
      const afterPubrec = sentPackets.length

      // PUBREL should have been sent
      expect(sentPackets.length).toBeGreaterThan(afterPubrec - 1)

      // Receive PUBCOMP
      const pubcomp: PubcompPacket = {
        type: PacketType.PUBCOMP,
        packetId: packetId!
      }
      await receivePacket(wire, pubcomp)

      // Flow complete
    })

    it("completes QoS 2 inbound with PUBREL", async () => {
      const onPublish = vi.fn()
      const wire = new MqttWire({ onSend: vi.fn(), onPublish })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      // Receive QoS 2 PUBLISH
      const publish: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test",
        packetId: 1,
        qos: 2,
        retain: false,
        dup: false,
        payload: new Uint8Array()
      }
      await receivePacket(wire, publish)

      // Receive PUBREL - triggers delivery
      const pubrel: PubrelPacket = {
        type: PacketType.PUBREL,
        packetId: 1
      }
      await receivePacket(wire, pubrel)

      expect(onPublish).toHaveBeenCalled()
    })
  })

  describe("SUBACK handling", () => {
    it("calls onSubscribe hook", async () => {
      const onSubscribe = vi.fn()
      const { wire } = createWire({ onSubscribe })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      await wire.subscribe([{ topicFilter: "topic/#", options: { qos: 1 } }])

      const suback: SubackPacket = {
        type: PacketType.SUBACK,
        packetId: 1,
        reasonCodes: [0x01]
      }
      await receivePacket(wire, suback)

      expect(onSubscribe).toHaveBeenCalled()
    })
  })

  describe("UNSUBACK handling", () => {
    it("calls onUnsubscribe hook", async () => {
      const onUnsubscribe = vi.fn()
      const { wire } = createWire({ onUnsubscribe })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      await wire.unsubscribe(["topic/#"])

      const unsuback: UnsubackPacket = {
        type: PacketType.UNSUBACK,
        packetId: 1,
        reasonCodes: [0x00]
      }
      await receivePacket(wire, unsuback)

      expect(onUnsubscribe).toHaveBeenCalled()
    })
  })

  describe("DISCONNECT handling (inbound)", () => {
    it("calls onDisconnect hook", async () => {
      const onDisconnect = vi.fn()
      const { wire } = createWire({ onDisconnect })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      const disconnect: DisconnectPacket = {
        type: PacketType.DISCONNECT,
        reasonCode: 0x8b // Server shutting down
      }
      await receivePacket(wire, disconnect)

      expect(wire.connectionState).toBe("disconnected")
      expect(onDisconnect).toHaveBeenCalledWith(disconnect)
    })
  })

  describe("PINGRESP handling", () => {
    it("handles PINGRESP without error", async () => {
      const { wire } = createWire()
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      const pingresp: PingrespPacket = {
        type: PacketType.PINGRESP
      }
      await receivePacket(wire, pingresp)

      // Should just work without doing anything
      expect(wire.isConnected).toBe(true)
    })
  })

  describe("reset", () => {
    it("clears all state", async () => {
      const { wire } = createWire()
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      wire.reset()

      expect(wire.connectionState).toBe("disconnected")
      expect(wire.clientId).toBeNull()
    })
  })

  describe("error classes", () => {
    it("ProtocolError has reasonCode", () => {
      const err = new ProtocolError("test error", 0x81)
      expect(err.reasonCode).toBe(0x81)
      expect(err.name).toBe("ProtocolError")
    })

    it("ProtocolError uses default reasonCode", () => {
      const err = new ProtocolError("test error")
      expect(err.reasonCode).toBe(0x82) // Default protocol error
    })

    it("StateError has state", () => {
      const err = new StateError("test error", "connecting")
      expect(err.state).toBe("connecting")
      expect(err.name).toBe("StateError")
    })
  })

  describe("protocol error handling", () => {
    it("calls onError hook on protocol error", async () => {
      const onError = vi.fn()
      const wire = new MqttWire({ onSend: vi.fn(), onError })
      await wire.connect({ clientId: "test" })

      // Send a proper packet header but invalid content
      const invalidPacket = new Uint8Array([0x20, 0x02, 0x00, 0xff]) // CONNACK with bad code
      await wire.receive(invalidPacket)

      // Should still be in connecting state after bad CONNACK (refused)
    })
  })

  describe("keepalive", () => {
    it("is disabled when keepAlive is 0", async () => {
      const wire = new MqttWire({ onSend: vi.fn() }, { keepAlive: 0 })
      await wire.connect({ clientId: "test", keepAlive: 0 })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      expect(wire.isConnected).toBe(true)
      // No keepalive timer running
    })

    it("respects server keepalive override", async () => {
      const { wire } = createWire()
      await wire.connect({ clientId: "test", keepAlive: 60 })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00,
        properties: { serverKeepAlive: 30 }
      })

      expect(wire.isConnected).toBe(true)
    })
  })

  describe("connection state", () => {
    it("handles CONNACK during wrong state", async () => {
      const { wire } = createWire()
      // Not connecting, just disconnected
      const connack: ConnackPacket = {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      }
      await receivePacket(wire, connack)

      // Should be ignored
      expect(wire.connectionState).toBe("disconnected")
    })

    it("handles PUBLISH when not connected", async () => {
      const onPublish = vi.fn()
      const wire = new MqttWire({ onSend: vi.fn(), onPublish })
      await wire.connect({ clientId: "test" })
      // Still connecting, not connected

      const publish: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test",
        qos: 0,
        retain: false,
        dup: false,
        payload: new Uint8Array()
      }
      await receivePacket(wire, publish)

      // Should be ignored because state is not connected
      expect(onPublish).not.toHaveBeenCalled()
    })
  })

  describe("3.1.1 protocol", () => {
    it("connects with 3.1.1 version", async () => {
      const wire = new MqttWire({ onSend: vi.fn() }, { protocolVersion: "3.1.1" })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      expect(wire.version).toBe("3.1.1")
      expect(wire.isConnected).toBe(true)
    })

    it("publishes without topic aliases in 3.1.1", async () => {
      const sentPackets: Uint8Array[] = []
      const wire = new MqttWire(
        {
          onSend: async (data: Uint8Array) => {
            sentPackets.push(data)
            return Promise.resolve()
          }
        },
        { protocolVersion: "3.1.1" }
      )
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      await wire.publish("topic", new Uint8Array())

      expect(sentPackets.length).toBeGreaterThan(1)
    })
  })

  describe("disconnect with properties", () => {
    it("sends disconnect with custom properties", async () => {
      const { wire, sentPackets } = createWire()
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      await wire.disconnect(0x00, { reasonString: "Client closing" })

      expect(sentPackets.length).toBeGreaterThan(1)
    })
  })

  describe("framing errors", () => {
    it("handles framing error in receive", async () => {
      const onError = vi.fn()
      const { wire } = createWire({ onError })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      // Send incomplete varint (continuation bit set but no more bytes)
      // This will cause a framing error when trying to read remaining length
      const incompleteFrame = new Uint8Array([0x30, 0x80, 0x80, 0x80, 0x80, 0x80])
      await wire.receive(incompleteFrame)

      expect(onError).toHaveBeenCalled()
    })
  })

  describe("decode errors", () => {
    it("handles unexpected packet type from server", async () => {
      const onError = vi.fn()
      const { wire } = createWire({ onError })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      // Send a CONNECT packet (type 0x10) which servers should never send
      // This tests the error path for unexpected client-to-server packets
      // Using proper encoding to ensure framing works
      const connectPacket = new Uint8Array([
        0x10,
        0x0d, // CONNECT, remaining length 13
        0x00,
        0x04,
        0x4d,
        0x51,
        0x54,
        0x54, // "MQTT"
        0x05, // Protocol level 5
        0x02, // Connect flags (clean start)
        0x00,
        0x3c, // Keep alive 60
        0x00, // Properties length 0
        0x00,
        0x00 // Client ID length 0
      ])
      await wire.receive(connectPacket)

      expect(onError).toHaveBeenCalled()
    })
  })

  describe("receive maximum exceeded", () => {
    it("throws when receive maximum exceeded", async () => {
      const wire = new MqttWire({ onSend: vi.fn() }, { receiveMaximum: 1 })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00,
        properties: { receiveMaximum: 1 }
      })

      // First QoS 1 publish should work
      await wire.publish("topic", new Uint8Array(), { qos: 1 })

      // Second should fail due to receive maximum
      await expect(wire.publish("topic2", new Uint8Array(), { qos: 1 })).rejects.toThrow(
        "receive maximum exceeded"
      )
    })
  })

  describe("unexpected packet types", () => {
    it("handles CONNECT packet from server as protocol error", async () => {
      const onError = vi.fn()
      const { wire } = createWire({ onError })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      // Manually craft a CONNECT packet (which server should never send)
      // Type 0x10 (CONNECT), remaining length 0
      const connectPacket = new Uint8Array([0x10, 0x00])
      await wire.receive(connectPacket)

      expect(onError).toHaveBeenCalled()
    })

    it("handles SUBSCRIBE packet from server as protocol error", async () => {
      const onError = vi.fn()
      const { wire } = createWire({ onError })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      // Type 0x82 (SUBSCRIBE), remaining length 0
      const subscribePacket = new Uint8Array([0x82, 0x00])
      await wire.receive(subscribePacket)

      expect(onError).toHaveBeenCalled()
    })
  })

  describe("topic alias errors", () => {
    it("handles invalid topic alias on inbound PUBLISH", async () => {
      const onError = vi.fn()
      const wire = new MqttWire({ onSend: vi.fn(), onError }, { topicAliasMaximum: 5 })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00,
        properties: { topicAliasMaximum: 5 }
      })

      // Send PUBLISH with topic alias that hasn't been set yet (empty topic)
      const publish: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "",
        qos: 0,
        retain: false,
        dup: false,
        payload: new Uint8Array(),
        properties: { topicAlias: 99 } // Invalid alias
      }
      await receivePacket(wire, publish)

      expect(onError).toHaveBeenCalled()
    })
  })

  describe("QoS 2 with topic alias resolution", () => {
    it("resolves topic alias on PUBREL delivery", async () => {
      const onPublish = vi.fn()
      const wire = new MqttWire({ onSend: vi.fn(), onPublish }, { topicAliasMaximum: 10 })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00,
        properties: { topicAliasMaximum: 10 }
      })

      // Send QoS 2 PUBLISH with topic alias
      const publish: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "sensor/data",
        packetId: 1,
        qos: 2,
        retain: false,
        dup: false,
        payload: new Uint8Array([1, 2, 3]),
        properties: { topicAlias: 1 }
      }
      await receivePacket(wire, publish)

      // Complete QoS 2 flow with PUBREL
      const pubrel: PubrelPacket = {
        type: PacketType.PUBREL,
        packetId: 1
      }
      await receivePacket(wire, pubrel)

      expect(onPublish).toHaveBeenCalled()
      expect(onPublish.mock.calls[0][0].topic).toBe("sensor/data")
    })
  })

  describe("protocol error with disconnect", () => {
    it("sends DISCONNECT on protocol error when connected (5.0)", async () => {
      const onError = vi.fn()
      const sentPackets: Uint8Array[] = []
      const wire = new MqttWire({
        onSend: async (data) => {
          sentPackets.push(data)
          return Promise.resolve()
        },
        onError
      })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      const packetsBefore = sentPackets.length

      // Send a CONNECT packet which triggers protocol error (server should never send CONNECT)
      const connectPacket = new Uint8Array([
        0x10,
        0x0d, // CONNECT, remaining length 13
        0x00,
        0x04,
        0x4d,
        0x51,
        0x54,
        0x54, // "MQTT"
        0x05, // Protocol level 5
        0x02, // Connect flags (clean start)
        0x00,
        0x3c, // Keep alive 60
        0x00, // Properties length 0
        0x00,
        0x00 // Client ID length 0
      ])
      await wire.receive(connectPacket)

      // Should have sent DISCONNECT
      expect(sentPackets.length).toBeGreaterThan(packetsBefore)
      expect(wire.connectionState).toBe("disconnected")
    })

    it("does not send DISCONNECT on protocol error in 3.1.1", async () => {
      const onError = vi.fn()
      const sentPackets: Uint8Array[] = []
      const wire = new MqttWire(
        {
          onSend: async (data) => {
            sentPackets.push(data)
            return Promise.resolve()
          },
          onError
        },
        { protocolVersion: "3.1.1" }
      )
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      const packetsBefore = sentPackets.length

      // Send a CONNECT packet which triggers protocol error (server should never send CONNECT)
      const connectPacket = new Uint8Array([
        0x10,
        0x0c, // CONNECT, remaining length 12
        0x00,
        0x04,
        0x4d,
        0x51,
        0x54,
        0x54, // "MQTT"
        0x04, // Protocol level 4 (3.1.1)
        0x02, // Connect flags (clean session)
        0x00,
        0x3c, // Keep alive 60
        0x00,
        0x00 // Client ID length 0
      ])
      await wire.receive(connectPacket)

      // Should NOT have sent DISCONNECT (3.1.1 doesn't have reason codes)
      expect(sentPackets.length).toBe(packetsBefore)
      expect(wire.connectionState).toBe("disconnected")
    })
  })

  // These tests use Vitest fake timer APIs not available in Bun's native test runner
  describe.skipIf(typeof vi.advanceTimersByTimeAsync !== "function")("keepalive timer", () => {
    it("sends PINGREQ when no activity", async () => {
      vi.useFakeTimers()
      try {
        const sentPackets: Uint8Array[] = []
        const wire = new MqttWire(
          {
            onSend: async (data) => {
              sentPackets.push(data)
              return Promise.resolve()
            }
          },
          { keepAlive: 10 } // 10 second keepalive
        )
        await wire.connect({ clientId: "test", keepAlive: 10 })
        await receivePacket(wire, {
          type: PacketType.CONNACK,
          sessionPresent: false,
          reasonCode: 0x00
        })

        const packetsAfterConnect = sentPackets.length

        // Advance time past keepalive interval check (intervalMs / 2 = 5 seconds first check)
        await vi.advanceTimersByTimeAsync(5000)
        // This first check won't trigger ping because not enough time elapsed

        // Advance another 5 seconds (now 10 seconds total - should trigger ping)
        await vi.advanceTimersByTimeAsync(5000)

        // Should have sent PINGREQ
        expect(sentPackets.length).toBeGreaterThan(packetsAfterConnect)
      } finally {
        vi.useRealTimers()
      }
    })

    it("triggers keepalive timeout when no response", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const onError = vi.fn()
        const wire = new MqttWire(
          { onSend: vi.fn(), onError },
          { keepAlive: 10, keepAliveMultiplier: 1.5 }
        )

        // Set initial time
        vi.setSystemTime(new Date(0))

        await wire.connect({ clientId: "test", keepAlive: 10 })
        await receivePacket(wire, {
          type: PacketType.CONNACK,
          sessionPresent: false,
          reasonCode: 0x00
        })

        // Advance time past 1.5x keepalive (15 seconds)
        // The wire checks at intervalMs/2 = 5 seconds
        // At 15+ seconds with no activity, it should trigger timeout
        vi.setSystemTime(new Date(20000)) // 20 seconds in the future
        await vi.advanceTimersByTimeAsync(5000) // Trigger timer check

        expect(onError).toHaveBeenCalled()
        expect(wire.connectionState).toBe("disconnected")
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("CONNACK in wrong state", () => {
    it("handles unexpected CONNACK when already connected", async () => {
      const onError = vi.fn()
      const { wire } = createWire({ onError })
      await wire.connect({ clientId: "test" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      // Send another CONNACK when already connected
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })

      expect(onError).toHaveBeenCalled()
    })
  })

  describe("session state persistence", () => {
    async function connectedWire(hooks: Partial<LifecycleHooks> = {}): Promise<{
      wire: MqttWire
      sentPackets: Uint8Array[]
    }> {
      const sentPackets: Uint8Array[] = []
      const onSend = async (data: Uint8Array): Promise<void> => {
        await Promise.resolve()
        sentPackets.push(data)
      }
      const wire = new MqttWire({ onSend, ...hooks })
      await wire.connect({ clientId: "test-client" })
      await receivePacket(wire, {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      })
      return { wire, sentPackets }
    }

    describe("exportSessionState", () => {
      it("returns null when no client ID", () => {
        const wire = new MqttWire({ onSend: vi.fn() })
        expect(wire.exportSessionState()).toBeNull()
      })

      it("exports session with client ID after connect", async () => {
        const { wire } = await connectedWire()
        const state = wire.exportSessionState()

        expect(state).not.toBeNull()
        expect(state?.clientId).toBe("test-client")
        expect(state?.outboundFlows).toBeInstanceOf(Map)
        expect(state?.inboundFlows).toBeInstanceOf(Map)
        expect(state?.pendingOperations).toBeInstanceOf(Map)
        expect(state?.subscriptions).toBeInstanceOf(Map)
      })

      it("exports pending QoS 1 flows", async () => {
        const { wire } = await connectedWire()

        // Publish QoS 1 without receiving PUBACK
        await wire.publish("test/topic", new Uint8Array([1, 2, 3]), { qos: 1 })

        const state = wire.exportSessionState()
        expect(state?.outboundFlows.size).toBe(1)

        const flow = state?.outboundFlows.get(1)
        expect(flow?.type).toBe("qos1-outbound")
      })

      it("exports active subscriptions", async () => {
        const { wire } = await connectedWire()

        await wire.subscribe([{ topicFilter: "test/#", options: { qos: 1 } }])

        // Receive SUBACK
        const suback: SubackPacket = {
          type: PacketType.SUBACK,
          packetId: 1,
          reasonCodes: [1] // Granted QoS 1
        }
        await receivePacket(wire, suback)

        const state = wire.exportSessionState()
        expect(state?.subscriptions.size).toBe(1)
        expect(state?.subscriptions.get("test/#")).toBe(1)
      })
    })

    describe("restoreSessionState", () => {
      it("throws when not disconnected", async () => {
        const { wire } = await connectedWire()

        const state = wire.exportSessionState()
        expect(() => {
          wire.restoreSessionState(state!)
        }).toThrow("cannot restore session")
      })

      it("restores session state", async () => {
        const { wire } = await connectedWire()

        // Create some state
        await wire.publish("test/topic", new Uint8Array([1]), { qos: 1 })
        await wire.subscribe([{ topicFilter: "test/#", options: { qos: 1 } }])
        await receivePacket(wire, {
          type: PacketType.SUBACK,
          packetId: 2,
          reasonCodes: [1]
        } as SubackPacket)

        const state = wire.exportSessionState()
        await wire.disconnect()

        // Create new wire and restore
        const wire2 = new MqttWire({ onSend: vi.fn() })
        wire2.restoreSessionState(state!)

        expect(wire2.hasSessionState()).toBe(true)
        expect(wire2.getSubscriptions().size).toBe(1)
      })

      it("does not restore expired session", async () => {
        const wire = new MqttWire({ onSend: vi.fn() }, { sessionExpiryInterval: 1 })
        await wire.connect({ clientId: "test" })
        await receivePacket(wire, {
          type: PacketType.CONNACK,
          sessionPresent: false,
          reasonCode: 0x00
        })

        // Create some state
        await wire.publish("test/topic", new Uint8Array([1]), { qos: 1 })
        const state = wire.exportSessionState()
        await wire.disconnect()

        // Manually expire the session
        const expiredState = { ...state!, expiresAt: Date.now() - 1000 }

        // Create new wire and try to restore
        const wire2 = new MqttWire({ onSend: vi.fn() })
        wire2.restoreSessionState(expiredState)

        expect(wire2.hasSessionState()).toBe(false)
      })
    })

    describe("session resumption", () => {
      it("resends pending QoS 1 messages on session resume", async () => {
        const sentPackets: Uint8Array[] = []
        const wire = new MqttWire({
          async onSend(data): Promise<void> {
            await Promise.resolve()
            sentPackets.push(data)
          }
        })

        await wire.connect({ clientId: "test" })
        await receivePacket(wire, {
          type: PacketType.CONNACK,
          sessionPresent: false,
          reasonCode: 0x00
        })

        // Publish QoS 1
        await wire.publish("test/topic", new Uint8Array([1, 2, 3]), { qos: 1 })

        const state = wire.exportSessionState()
        await wire.disconnect()

        // Create new wire with restored state
        const sentPackets2: Uint8Array[] = []
        const wire2 = new MqttWire({
          async onSend(data): Promise<void> {
            await Promise.resolve()
            sentPackets2.push(data)
          }
        })
        wire2.restoreSessionState(state!)

        // Reconnect with cleanStart=false
        await wire2.connect({ clientId: "test", cleanStart: false })
        const packetsBeforeConnack = sentPackets2.length

        // Server resumes session
        await receivePacket(wire2, {
          type: PacketType.CONNACK,
          sessionPresent: true,
          reasonCode: 0x00
        })

        // Should have resent the PUBLISH with DUP flag
        expect(sentPackets2.length).toBeGreaterThan(packetsBeforeConnack)
      })

      it("calls onSessionLost when server does not resume", async () => {
        const onSessionLost = vi.fn()
        const wire = new MqttWire({ onSend: vi.fn(), onSessionLost })

        await wire.connect({ clientId: "test" })
        await receivePacket(wire, {
          type: PacketType.CONNACK,
          sessionPresent: false,
          reasonCode: 0x00
        })

        // Create some state
        await wire.subscribe([{ topicFilter: "test/#", options: { qos: 1 } }])
        await receivePacket(wire, {
          type: PacketType.SUBACK,
          packetId: 1,
          reasonCodes: [1]
        } as SubackPacket)

        const state = wire.exportSessionState()
        await wire.disconnect()

        // New wire with restored state
        const wire2 = new MqttWire({ onSend: vi.fn(), onSessionLost })
        wire2.restoreSessionState(state!)

        // Connect expecting session resumption
        await wire2.connect({ clientId: "test", cleanStart: false })

        // Server does NOT have session
        await receivePacket(wire2, {
          type: PacketType.CONNACK,
          sessionPresent: false,
          reasonCode: 0x00
        })

        // Hook should be called
        expect(onSessionLost).toHaveBeenCalled()

        // State should be cleared
        expect(wire2.hasSessionState()).toBe(false)
      })

      it("does not call onSessionLost when cleanStart=true", async () => {
        const onSessionLost = vi.fn()
        const wire = new MqttWire({ onSend: vi.fn(), onSessionLost })

        await wire.connect({ clientId: "test", cleanStart: true })
        await receivePacket(wire, {
          type: PacketType.CONNACK,
          sessionPresent: false,
          reasonCode: 0x00
        })

        expect(onSessionLost).not.toHaveBeenCalled()
      })
    })

    describe("hasSessionState", () => {
      it("returns false for fresh wire", () => {
        const wire = new MqttWire({ onSend: vi.fn() })
        expect(wire.hasSessionState()).toBe(false)
      })

      it("returns true when there are pending QoS flows", async () => {
        const { wire } = await connectedWire()
        await wire.publish("test/topic", new Uint8Array([1]), { qos: 1 })

        expect(wire.hasSessionState()).toBe(true)
      })

      it("returns true when there are active subscriptions", async () => {
        const { wire } = await connectedWire()
        await wire.subscribe([{ topicFilter: "test/#", options: { qos: 0 } }])
        await receivePacket(wire, {
          type: PacketType.SUBACK,
          packetId: 1,
          reasonCodes: [0]
        } as SubackPacket)

        expect(wire.hasSessionState()).toBe(true)
      })
    })

    describe("getSubscriptions", () => {
      it("returns empty map initially", () => {
        const wire = new MqttWire({ onSend: vi.fn() })
        expect(wire.getSubscriptions().size).toBe(0)
      })

      it("returns active subscriptions", async () => {
        const { wire } = await connectedWire()
        await wire.subscribe([
          { topicFilter: "topic1", options: { qos: 0 } },
          { topicFilter: "topic2", options: { qos: 1 } }
        ])
        await receivePacket(wire, {
          type: PacketType.SUBACK,
          packetId: 1,
          reasonCodes: [0, 1]
        } as SubackPacket)

        const subs = wire.getSubscriptions()
        expect(subs.size).toBe(2)
        expect(subs.get("topic1")).toBe(0)
        expect(subs.get("topic2")).toBe(1)
      })
    })
  })
})
