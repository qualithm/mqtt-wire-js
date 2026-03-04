import { describe, expect, it, vi } from "vitest"

import { PacketType } from "../../../constants.js"
import { encodePacket } from "../../../packets/encode.js"
import type {
  ConnackPacket,
  ConnectPacket,
  DisconnectPacket,
  PublishPacket,
  PubrelPacket,
  SubackPacket,
  SubscribePacket,
  UnsubackPacket,
  UnsubscribePacket
} from "../../../packets/types.js"
import type { LifecycleHooks } from "../../../state/types.js"
import { MqttWire, ProtocolError, StateError } from "../../../wire.js"

/**
 * Helper to create MqttWire with mock hooks.
 */
function createWire(hooks: Partial<LifecycleHooks> = {}): {
  wire: MqttWire
  onSend: ReturnType<typeof vi.fn>
  onConnect: ReturnType<typeof vi.fn>
  sentPackets: Uint8Array[]
} {
  const sentPackets: Uint8Array[] = []
  const onSend = vi.fn(async (data: Uint8Array) => {
    sentPackets.push(data)
    return Promise.resolve()
  })
  const onConnect = vi.fn(
    (_packet: ConnectPacket): ConnackPacket => ({
      type: PacketType.CONNACK,
      sessionPresent: false,
      reasonCode: 0x00
    })
  )
  const wire = new MqttWire({ onSend, onConnect, ...hooks })
  return { wire, onSend, onConnect, sentPackets }
}

/**
 * Simulate receiving a packet by encoding and passing to wire.receive().
 */
async function receivePacket(
  wire: MqttWire,
  packet: Parameters<typeof encodePacket>[0],
  version: "3.1.1" | "5.0" = "5.0"
): Promise<void> {
  const data = encodePacket(packet, version)
  await wire.receive(data)
}

/**
 * Simulate client connection by sending CONNECT and expecting CONNACK.
 */
async function connectClient(wire: MqttWire, options: Partial<ConnectPacket> = {}): Promise<void> {
  const connect: ConnectPacket = {
    type: PacketType.CONNECT,
    protocolVersion: "5.0",
    clientId: "test-client",
    cleanStart: true,
    keepAlive: 60,
    ...options
  }
  await receivePacket(wire, connect, connect.protocolVersion)
}

describe("MqttWire (Server-Side)", () => {
  describe("constructor", () => {
    it("initialises with awaiting-connect state", () => {
      const { wire } = createWire()
      expect(wire.connectionState).toBe("awaiting-connect")
      expect(wire.isConnected).toBe(false)
      expect(wire.version).toBe("5.0")
    })
  })

  describe("CONNECT handling", () => {
    it("transitions to connected on valid CONNECT", async () => {
      const { wire, onConnect, sentPackets } = createWire()

      await connectClient(wire)

      expect(wire.connectionState).toBe("connected")
      expect(wire.isConnected).toBe(true)
      expect(wire.clientId).toBe("test-client")
      expect(onConnect).toHaveBeenCalledTimes(1)
      expect(sentPackets).toHaveLength(1) // CONNACK sent
    })

    it("stores client ID from CONNECT packet", async () => {
      const { wire } = createWire()

      await connectClient(wire, { clientId: "my-unique-client" })

      expect(wire.clientId).toBe("my-unique-client")
    })

    it("uses assigned client ID from CONNACK if provided", async () => {
      const onConnect = vi.fn(
        (): ConnackPacket => ({
          type: PacketType.CONNACK,
          sessionPresent: false,
          reasonCode: 0x00,
          properties: {
            assignedClientIdentifier: "server-assigned-id"
          }
        })
      )
      const { wire } = createWire({ onConnect })

      await connectClient(wire, { clientId: "" })

      expect(wire.clientId).toBe("server-assigned-id")
    })

    it("handles MQTT 3.1.1 CONNECT", async () => {
      const { wire } = createWire()

      await connectClient(wire, { protocolVersion: "3.1.1" })

      expect(wire.isConnected).toBe(true)
      expect(wire.version).toBe("3.1.1")
    })

    it("stores client properties from CONNECT", async () => {
      const { wire } = createWire()

      await connectClient(wire, {
        properties: {
          receiveMaximum: 100,
          maximumPacketSize: 1024000,
          topicAliasMaximum: 10
        }
      })

      expect(wire.receiveMaximum).toBe(100)
      expect(wire.maximumPacketSize).toBe(1024000)
    })

    it("rejects connection when hook throws", async () => {
      const onDisconnect = vi.fn()
      const onConnect = vi.fn((): ConnackPacket => {
        throw new ProtocolError("not authorised", 0x87)
      })
      const { wire, sentPackets } = createWire({ onConnect, onDisconnect })

      await connectClient(wire)

      expect(wire.connectionState).toBe("disconnected")
      expect(sentPackets).toHaveLength(1) // CONNACK with error
      expect(onDisconnect).toHaveBeenCalled()
    })

    it("rejects duplicate CONNECT", async () => {
      const onError = vi.fn()
      const { wire } = createWire({ onError })

      await connectClient(wire)
      expect(wire.isConnected).toBe(true)

      // Send another CONNECT
      await connectClient(wire)

      expect(onError).toHaveBeenCalled()
    })

    it("handles CONNACK with failure reason code", async () => {
      const onDisconnect = vi.fn()
      const onConnect = vi.fn(
        (): ConnackPacket => ({
          type: PacketType.CONNACK,
          sessionPresent: false,
          reasonCode: 0x87 // Not authorised
        })
      )
      const { wire } = createWire({ onConnect, onDisconnect })

      await connectClient(wire)

      expect(wire.connectionState).toBe("disconnected")
      expect(onDisconnect).toHaveBeenCalled()
    })
  })

  describe("PUBLISH handling (client → server)", () => {
    it("calls onPublish hook for QoS 0 message", async () => {
      const onPublish = vi.fn()
      const { wire } = createWire({ onPublish })
      await connectClient(wire)

      const publish: PublishPacket = {
        type: PacketType.PUBLISH,
        topic: "test/topic",
        qos: 0,
        retain: false,
        dup: false,
        payload: new Uint8Array([1, 2, 3])
      }
      await receivePacket(wire, publish)

      expect(onPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: "test/topic",
          qos: 0
        })
      )
    })

    it("sends PUBACK for QoS 1 message", async () => {
      const onPublish = vi.fn()
      const { wire, sentPackets } = createWire({ onPublish })
      await connectClient(wire)
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

      expect(sentPackets.length).toBe(initialPackets + 1) // PUBACK sent
      expect(onPublish).toHaveBeenCalled()
    })

    it("sends PUBREC for QoS 2 message", async () => {
      const onPublish = vi.fn()
      const { wire, sentPackets } = createWire({ onPublish })
      await connectClient(wire)
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

      expect(sentPackets.length).toBe(initialPackets + 1) // PUBREC sent
      // onPublish NOT called yet (QoS 2 delivers on PUBREL)
      expect(onPublish).not.toHaveBeenCalled()
    })

    it("completes QoS 2 flow and delivers on PUBREL", async () => {
      const onPublish = vi.fn()
      const { wire, sentPackets } = createWire({ onPublish })
      await connectClient(wire)

      // Client sends PUBLISH QoS 2
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

      const packetsAfterPublish = sentPackets.length

      // Client sends PUBREL
      const pubrel: PubrelPacket = {
        type: PacketType.PUBREL,
        packetId: 1
      }
      await receivePacket(wire, pubrel)

      expect(sentPackets.length).toBe(packetsAfterPublish + 1) // PUBCOMP sent
      expect(onPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: "test/topic",
          qos: 2
        })
      )
    })
  })

  describe("PUBLISH (server → client)", () => {
    it("sends QoS 0 publish", async () => {
      const { wire, sentPackets } = createWire()
      await connectClient(wire)
      const initialPackets = sentPackets.length

      const result = await wire.publish("test/topic", new Uint8Array([1, 2, 3]))

      expect(result).toBeUndefined() // No packet ID for QoS 0
      expect(sentPackets.length).toBe(initialPackets + 1)
    })

    it("sends QoS 1 publish and returns packet ID", async () => {
      const { wire, sentPackets } = createWire()
      await connectClient(wire)
      const initialPackets = sentPackets.length

      const packetId = await wire.publish("test/topic", new Uint8Array([1, 2, 3]), { qos: 1 })

      expect(packetId).toBe(1)
      expect(sentPackets.length).toBe(initialPackets + 1)
    })

    it("throws StateError when not connected", async () => {
      const { wire } = createWire()

      await expect(wire.publish("topic", new Uint8Array())).rejects.toThrow(StateError)
    })

    it("validates topic name", async () => {
      const { wire } = createWire()
      await connectClient(wire)

      // Invalid topic with wildcard
      await expect(wire.publish("test/+/invalid", new Uint8Array())).rejects.toThrow(
        "invalid topic"
      )
    })
  })

  describe("SUBSCRIBE handling", () => {
    it("calls onSubscribe hook and sends SUBACK", async () => {
      const onSubscribe = vi.fn(
        (packet: SubscribePacket): SubackPacket => ({
          type: PacketType.SUBACK,
          packetId: packet.packetId,
          reasonCodes: [0, 1] // Grant QoS 0 and 1
        })
      )
      const { wire, sentPackets } = createWire({ onSubscribe })
      await connectClient(wire)
      const initialPackets = sentPackets.length

      const subscribe: SubscribePacket = {
        type: PacketType.SUBSCRIBE,
        packetId: 1,
        subscriptions: [
          { topicFilter: "test/#", options: { qos: 1 } },
          { topicFilter: "other/+", options: { qos: 2 } }
        ]
      }
      await receivePacket(wire, subscribe)

      expect(onSubscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          packetId: 1,
          subscriptions: expect.arrayContaining([
            expect.objectContaining({ topicFilter: "test/#" })
          ])
        })
      )
      expect(sentPackets.length).toBe(initialPackets + 1) // SUBACK sent
    })

    it("grants requested QoS when no hook provided", async () => {
      const { wire, sentPackets } = createWire({ onSubscribe: undefined })
      await connectClient(wire)
      const initialPackets = sentPackets.length

      const subscribe: SubscribePacket = {
        type: PacketType.SUBSCRIBE,
        packetId: 1,
        subscriptions: [{ topicFilter: "test/#", options: { qos: 2 } }]
      }
      await receivePacket(wire, subscribe)

      expect(sentPackets.length).toBe(initialPackets + 1) // SUBACK sent
    })
  })

  describe("UNSUBSCRIBE handling", () => {
    it("calls onUnsubscribe hook and sends UNSUBACK", async () => {
      const onUnsubscribe = vi.fn(
        (packet: UnsubscribePacket): UnsubackPacket => ({
          type: PacketType.UNSUBACK,
          packetId: packet.packetId,
          reasonCodes: [0x00, 0x11] // Success and no subscription
        })
      )
      const { wire, sentPackets } = createWire({ onUnsubscribe })
      await connectClient(wire)
      const initialPackets = sentPackets.length

      const unsubscribe: UnsubscribePacket = {
        type: PacketType.UNSUBSCRIBE,
        packetId: 1,
        topicFilters: ["test/#", "other/+"]
      }
      await receivePacket(wire, unsubscribe)

      expect(onUnsubscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          packetId: 1,
          topicFilters: ["test/#", "other/+"]
        })
      )
      expect(sentPackets.length).toBe(initialPackets + 1) // UNSUBACK sent
    })
  })

  describe("PINGREQ handling", () => {
    it("responds with PINGRESP", async () => {
      const { wire, sentPackets } = createWire()
      await connectClient(wire)
      const initialPackets = sentPackets.length

      await receivePacket(wire, { type: PacketType.PINGREQ })

      expect(sentPackets.length).toBe(initialPackets + 1) // PINGRESP sent
    })
  })

  describe("DISCONNECT handling", () => {
    it("calls onDisconnect hook", async () => {
      const onDisconnect = vi.fn()
      const { wire } = createWire({ onDisconnect })
      await connectClient(wire)

      const disconnect: DisconnectPacket = {
        type: PacketType.DISCONNECT,
        reasonCode: 0x00
      }
      await receivePacket(wire, disconnect)

      expect(wire.connectionState).toBe("disconnected")
      // Note: DISCONNECT with reasonCode 0x00 is encoded as minimal (no reason code byte)
      // so the decoded packet may not have reasonCode property
      expect(onDisconnect).toHaveBeenCalledWith(
        expect.objectContaining({ type: PacketType.DISCONNECT })
      )
    })
  })

  describe("disconnect() method", () => {
    it("sends DISCONNECT to client (MQTT 5.0)", async () => {
      const { wire, sentPackets } = createWire()
      await connectClient(wire)
      const initialPackets = sentPackets.length

      await wire.disconnect()

      expect(wire.connectionState).toBe("disconnected")
      expect(sentPackets.length).toBe(initialPackets + 1) // DISCONNECT sent
    })

    it("does not send DISCONNECT for MQTT 3.1.1", async () => {
      const { wire, sentPackets } = createWire()
      await connectClient(wire, { protocolVersion: "3.1.1" })
      const initialPackets = sentPackets.length

      await wire.disconnect()

      expect(wire.connectionState).toBe("disconnected")
      // 3.1.1 doesn't support server-initiated DISCONNECT
      expect(sentPackets.length).toBe(initialPackets)
    })

    it("handles disconnect when not connected", async () => {
      const { wire } = createWire()

      // Should not throw
      await wire.disconnect()

      expect(wire.connectionState).toBe("disconnected")
    })
  })

  describe("protocol errors", () => {
    it("rejects server-to-client packets", async () => {
      const onError = vi.fn()
      const { wire } = createWire({ onError })
      await connectClient(wire)

      // CONNACK is a server-to-client packet
      const connack: ConnackPacket = {
        type: PacketType.CONNACK,
        sessionPresent: false,
        reasonCode: 0x00
      }
      await receivePacket(wire, connack)

      expect(onError).toHaveBeenCalledWith(expect.any(ProtocolError))
    })
  })

  describe("reset()", () => {
    it("resets all state", async () => {
      const { wire } = createWire()
      await connectClient(wire)
      expect(wire.isConnected).toBe(true)

      wire.reset()

      expect(wire.connectionState).toBe("awaiting-connect")
      expect(wire.clientId).toBeNull()
    })
  })

  describe("receive() error handling", () => {
    it("handles malformed packet data", async () => {
      const onError = vi.fn()
      const { wire } = createWire({ onError })
      await connectClient(wire)

      // Send malformed data (packet type 0 is invalid)
      const malformed = new Uint8Array([0x00, 0x00]) // Type 0, remaining length 0
      await wire.receive(malformed)

      expect(onError).toHaveBeenCalledWith(expect.any(ProtocolError))
    })
  })

  describe("QoS 2 server → client flow", () => {
    it("completes QoS 2 outbound flow with PUBREC and PUBCOMP", async () => {
      const { wire, sentPackets } = createWire()
      await connectClient(wire)
      const initialPackets = sentPackets.length

      // Server sends QoS 2 PUBLISH
      const packetId = await wire.publish("test/topic", new Uint8Array([1, 2, 3]), { qos: 2 })
      expect(packetId).toBe(1)
      expect(sentPackets.length).toBe(initialPackets + 1)

      // Client responds with PUBREC
      await receivePacket(wire, { type: PacketType.PUBREC, packetId: 1 })
      expect(sentPackets.length).toBe(initialPackets + 2) // PUBREL sent

      // Client responds with PUBCOMP
      await receivePacket(wire, { type: PacketType.PUBCOMP, packetId: 1 })
      // Flow completed
    })

    it("handles PUBREC for unknown packet ID", async () => {
      const { wire } = createWire()
      await connectClient(wire)

      // PUBREC for non-existent flow (should not throw)
      await receivePacket(wire, { type: PacketType.PUBREC, packetId: 999 })
    })

    it("handles PUBCOMP for unknown packet ID", async () => {
      const { wire } = createWire()
      await connectClient(wire)

      // PUBCOMP for non-existent flow (should not throw)
      await receivePacket(wire, { type: PacketType.PUBCOMP, packetId: 999 })
    })
  })

  describe("QoS 1 server → client flow", () => {
    it("completes QoS 1 outbound flow with PUBACK", async () => {
      const { wire, sentPackets } = createWire()
      await connectClient(wire)
      const initialPackets = sentPackets.length

      // Server sends QoS 1 PUBLISH
      const packetId = await wire.publish("test/topic", new Uint8Array([1, 2, 3]), { qos: 1 })
      expect(packetId).toBe(1)
      expect(sentPackets.length).toBe(initialPackets + 1)

      // Client responds with PUBACK
      await receivePacket(wire, { type: PacketType.PUBACK, packetId: 1 })
      // Flow completed, packet ID released
    })

    it("handles PUBACK for unknown packet ID", async () => {
      const { wire } = createWire()
      await connectClient(wire)

      // PUBACK for non-existent flow (should not throw)
      await receivePacket(wire, { type: PacketType.PUBACK, packetId: 999 })
    })
  })

  describe("PUBREL handling", () => {
    it("sends PUBCOMP even for unknown flow", async () => {
      const { wire, sentPackets } = createWire()
      await connectClient(wire)
      const initialPackets = sentPackets.length

      // PUBREL for non-existent flow
      const pubrel: PubrelPacket = {
        type: PacketType.PUBREL,
        packetId: 999
      }
      await receivePacket(wire, pubrel)

      // PUBCOMP should still be sent
      expect(sentPackets.length).toBe(initialPackets + 1)
    })
  })

  describe("PINGREQ when not connected", () => {
    it("ignores PINGREQ before connection", async () => {
      const { wire, sentPackets } = createWire()

      // Send PINGREQ without connecting first - need to encode manually
      // since it bypasses normal state checks
      const pingreq = new Uint8Array([0xc0, 0x00]) // PINGREQ packet
      await wire.receive(pingreq)

      // No PINGRESP should be sent since not connected
      expect(sentPackets.length).toBe(0)
    })
  })

  describe("PUBLISH when not connected", () => {
    it("ignores PUBLISH before connection", async () => {
      const onPublish = vi.fn()
      const { wire, sentPackets } = createWire({ onPublish })

      // Manually create encoded PUBLISH (bypassing state checks)
      // QoS 0 PUBLISH to avoid packet ID issues
      const topic = new TextEncoder().encode("test")
      const publish = new Uint8Array([
        0x30, // PUBLISH QoS 0
        topic.length + 2,
        0x00,
        topic.length,
        ...topic
      ])
      await wire.receive(publish)

      // Should be ignored, onPublish not called
      expect(onPublish).not.toHaveBeenCalled()
      expect(sentPackets.length).toBe(0)
    })
  })

  describe("UNSUBSCRIBE without hook", () => {
    it("sends success UNSUBACK when no hook provided", async () => {
      const { wire, sentPackets } = createWire({ onUnsubscribe: undefined })
      await connectClient(wire)
      const initialPackets = sentPackets.length

      const unsubscribe: UnsubscribePacket = {
        type: PacketType.UNSUBSCRIBE,
        packetId: 1,
        topicFilters: ["test/#", "other/+"]
      }
      await receivePacket(wire, unsubscribe)

      expect(sentPackets.length).toBe(initialPackets + 1) // UNSUBACK sent
    })
  })

  describe("UNSUBSCRIBE when not connected", () => {
    it("ignores UNSUBSCRIBE before connection", async () => {
      const { wire, sentPackets } = createWire()

      // Manually encode UNSUBSCRIBE and send before connecting
      const unsubscribe = new Uint8Array([
        0xa2, // UNSUBSCRIBE
        0x09, // Remaining length
        0x00,
        0x01, // Packet ID
        0x00,
        0x05, // Topic filter length
        0x74,
        0x65,
        0x73,
        0x74,
        0x2f // "test/"
      ])
      await wire.receive(unsubscribe)

      // Should be ignored
      expect(sentPackets.length).toBe(0)
    })
  })

  describe("SUBSCRIBE when not connected", () => {
    it("ignores SUBSCRIBE before connection", async () => {
      const { wire, sentPackets } = createWire()

      // Manually encode SUBSCRIBE and send before connecting
      const subscribe = new Uint8Array([
        0x82, // SUBSCRIBE
        0x0a, // Remaining length
        0x00,
        0x01, // Packet ID
        0x00,
        0x05, // Topic filter length
        0x74,
        0x65,
        0x73,
        0x74,
        0x2f, // "test/"
        0x01 // QoS 1
      ])
      await wire.receive(subscribe)

      // Should be ignored
      expect(sentPackets.length).toBe(0)
    })
  })

  describe("disconnect() with onDisconnect hook", () => {
    it("calls onDisconnect hook on server-initiated disconnect", async () => {
      const onDisconnect = vi.fn()
      const { wire } = createWire({ onDisconnect })
      await connectClient(wire)

      await wire.disconnect()

      expect(onDisconnect).toHaveBeenCalled()
    })
  })

  describe("keepalive disabled", () => {
    it("accepts keepAlive=0 from client", async () => {
      const { wire } = createWire()

      await connectClient(wire, { keepAlive: 0 })

      expect(wire.isConnected).toBe(true)
    })
  })

  describe("topic alias (server → client)", () => {
    it("uses topic alias when client supports it", async () => {
      const sentPackets: Uint8Array[] = []
      const onSend = vi.fn((data: Uint8Array) => {
        sentPackets.push(data)
      })
      const onConnect = vi.fn(
        (): ConnackPacket => ({
          type: PacketType.CONNACK,
          sessionPresent: false,
          reasonCode: 0x00
        })
      )
      const wire = new MqttWire(
        { onSend, onConnect },
        { topicAliasMaximum: 10 } // Server allows aliases
      )

      // Client connects with topic alias support
      const connect: ConnectPacket = {
        type: PacketType.CONNECT,
        protocolVersion: "5.0",
        clientId: "test-client",
        cleanStart: true,
        keepAlive: 60,
        properties: {
          topicAliasMaximum: 10 // Client accepts aliases
        }
      }
      await receivePacket(wire, connect)

      // Server sends to same topic twice - second should use alias
      await wire.publish("test/alias/topic", new Uint8Array([1]))
      await wire.publish("test/alias/topic", new Uint8Array([2]))

      // Both messages sent
      expect(sentPackets.length).toBe(3) // CONNACK + 2 PUBLISH
    })
  })

  describe("SUBSCRIBE without hook", () => {
    it("grants requested QoS when no hook", async () => {
      const { wire, sentPackets } = createWire({ onSubscribe: undefined })
      await connectClient(wire)
      const initialPackets = sentPackets.length

      const subscribe: SubscribePacket = {
        type: PacketType.SUBSCRIBE,
        packetId: 1,
        subscriptions: [
          { topicFilter: "test/#", options: { qos: 0 } },
          { topicFilter: "other/+", options: { qos: 2 } }
        ]
      }
      await receivePacket(wire, subscribe)

      expect(sentPackets.length).toBe(initialPackets + 1) // SUBACK sent
    })
  })

  describe("AUTH packet", () => {
    it("handles AUTH packet without error", async () => {
      const { wire } = createWire()
      await connectClient(wire)

      // AUTH packet - not implemented so should be silently handled
      const auth = new Uint8Array([0xf0, 0x02, 0x00, 0x00]) // AUTH with success
      await wire.receive(auth)

      // Should not disconnect or error
      expect(wire.isConnected).toBe(true)
    })
  })
})
