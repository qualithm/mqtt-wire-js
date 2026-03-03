import { describe, expect, it } from "vitest"

import { PacketType } from "../../../constants.js"
import type {
  PubackPacket,
  PubcompPacket,
  PublishPacket,
  PubrecPacket,
  PubrelPacket
} from "../../../packets/types.js"
import { QoSFlowTracker } from "../../../state/qos-flow.js"

const makePublish = (packetId: number, qos: 0 | 1 | 2): PublishPacket => ({
  type: PacketType.PUBLISH,
  topic: "test/topic",
  packetId,
  qos,
  retain: false,
  dup: false,
  payload: new Uint8Array([1, 2, 3])
})

describe("QoSFlowTracker", () => {
  describe("QoS 1 outbound", () => {
    it("starts and completes QoS 1 flow", () => {
      const tracker = new QoSFlowTracker()
      const packet = makePublish(1, 1)

      tracker.startQoS1Outbound(packet, Date.now())
      expect(tracker.outboundCount).toBe(1)
      expect(tracker.getOutbound(1)).toBeDefined()

      const puback: PubackPacket = { type: PacketType.PUBACK, packetId: 1 }
      const result = tracker.handlePuback(puback)

      expect(result.success).toBe(true)
      expect(result.flow?.packetId).toBe(1)
      expect(tracker.outboundCount).toBe(0)
    })

    it("fails PUBACK for unknown packet ID", () => {
      const tracker = new QoSFlowTracker()
      const puback: PubackPacket = { type: PacketType.PUBACK, packetId: 99 }
      const result = tracker.handlePuback(puback)

      expect(result.success).toBe(false)
      expect(result.reason).toContain("unknown")
    })

    it("fails PUBACK for QoS 2 flow", () => {
      const tracker = new QoSFlowTracker()
      const packet = makePublish(1, 2)
      tracker.startQoS2Outbound(packet, Date.now())

      const puback: PubackPacket = { type: PacketType.PUBACK, packetId: 1 }
      const result = tracker.handlePuback(puback)

      expect(result.success).toBe(false)
      expect(result.reason).toContain("qos2-outbound")
    })

    it("throws for QoS 1 packet without packetId", () => {
      const tracker = new QoSFlowTracker()
      const packet: PublishPacket = {
        ...makePublish(1, 1),
        packetId: undefined
      }
      expect(() => {
        tracker.startQoS1Outbound(packet, Date.now())
      }).toThrow("packetId")
    })
  })

  describe("QoS 2 outbound", () => {
    it("completes full QoS 2 flow", () => {
      const tracker = new QoSFlowTracker()
      const packet = makePublish(1, 2)
      const now = Date.now()

      // Step 1: PUBLISH sent
      tracker.startQoS2Outbound(packet, now)
      expect(tracker.getOutbound(1)?.type).toBe("qos2-outbound")

      // Step 2: PUBREC received
      const pubrec: PubrecPacket = { type: PacketType.PUBREC, packetId: 1 }
      const recResult = tracker.handlePubrec(pubrec, now)
      expect(recResult.success).toBe(true)

      // Step 3: PUBREL sent (handled externally)

      // Step 4: PUBCOMP received
      const pubcomp: PubcompPacket = { type: PacketType.PUBCOMP, packetId: 1 }
      const compResult = tracker.handlePubcomp(pubcomp)
      expect(compResult.success).toBe(true)
      expect(tracker.outboundCount).toBe(0)
    })

    it("rejects PUBREC with error reason code", () => {
      const tracker = new QoSFlowTracker()
      const packet = makePublish(1, 2)
      tracker.startQoS2Outbound(packet, Date.now())

      const pubrec: PubrecPacket = {
        type: PacketType.PUBREC,
        packetId: 1,
        reasonCode: 0x80 // Unspecified error
      }
      const result = tracker.handlePubrec(pubrec, Date.now())

      expect(result.success).toBe(false)
      expect(result.reason).toContain("error")
      expect(tracker.outboundCount).toBe(0) // Flow terminated
    })

    it("rejects PUBCOMP in wrong state", () => {
      const tracker = new QoSFlowTracker()
      const packet = makePublish(1, 2)
      tracker.startQoS2Outbound(packet, Date.now())

      // Try PUBCOMP without PUBREC
      const pubcomp: PubcompPacket = { type: PacketType.PUBCOMP, packetId: 1 }
      const result = tracker.handlePubcomp(pubcomp)

      expect(result.success).toBe(false)
      expect(result.reason).toContain("state")
    })

    it("rejects PUBREC for unknown packet ID", () => {
      const tracker = new QoSFlowTracker()

      const pubrec: PubrecPacket = { type: PacketType.PUBREC, packetId: 99 }
      const result = tracker.handlePubrec(pubrec, Date.now())

      expect(result.success).toBe(false)
      expect(result.reason).toContain("unknown")
    })

    it("rejects PUBREC in wrong state (already got PUBREC)", () => {
      const tracker = new QoSFlowTracker()
      const packet = makePublish(1, 2)
      const now = Date.now()

      tracker.startQoS2Outbound(packet, now)

      // First PUBREC succeeds
      const pubrec: PubrecPacket = { type: PacketType.PUBREC, packetId: 1 }
      const result1 = tracker.handlePubrec(pubrec, now)
      expect(result1.success).toBe(true)

      // Second PUBREC should fail (wrong state)
      const result2 = tracker.handlePubrec(pubrec, now)
      expect(result2.success).toBe(false)
      expect(result2.reason).toContain("state")
    })

    it("rejects PUBREC for QoS 1 flow", () => {
      const tracker = new QoSFlowTracker()
      const packet = makePublish(1, 1)
      tracker.startQoS1Outbound(packet, Date.now())

      const pubrec: PubrecPacket = { type: PacketType.PUBREC, packetId: 1 }
      const result = tracker.handlePubrec(pubrec, Date.now())

      expect(result.success).toBe(false)
      expect(result.reason).toContain("qos1-outbound")
    })

    it("rejects PUBCOMP for QoS 1 flow", () => {
      const tracker = new QoSFlowTracker()
      const packet = makePublish(1, 1)
      tracker.startQoS1Outbound(packet, Date.now())

      const pubcomp: PubcompPacket = { type: PacketType.PUBCOMP, packetId: 1 }
      const result = tracker.handlePubcomp(pubcomp)

      expect(result.success).toBe(false)
      expect(result.reason).toContain("qos1-outbound")
    })

    it("rejects PUBCOMP for unknown packet ID", () => {
      const tracker = new QoSFlowTracker()

      const pubcomp: PubcompPacket = { type: PacketType.PUBCOMP, packetId: 99 }
      const result = tracker.handlePubcomp(pubcomp)

      expect(result.success).toBe(false)
      expect(result.reason).toContain("unknown")
    })

    it("throws for QoS 2 packet without packetId", () => {
      const tracker = new QoSFlowTracker()
      const packet: PublishPacket = {
        ...makePublish(1, 2),
        packetId: undefined
      }
      expect(() => {
        tracker.startQoS2Outbound(packet, Date.now())
      }).toThrow("packetId")
    })
  })

  describe("QoS 2 inbound", () => {
    it("tracks inbound QoS 2 flow", () => {
      const tracker = new QoSFlowTracker()
      const packet = makePublish(1, 2)

      tracker.startQoS2Inbound(packet, Date.now())
      expect(tracker.inboundCount).toBe(1)
      expect(tracker.hasInbound(1)).toBe(true)
    })

    it("completes inbound flow on PUBREL", () => {
      const tracker = new QoSFlowTracker()
      const packet = makePublish(1, 2)
      tracker.startQoS2Inbound(packet, Date.now())

      const pubrel: PubrelPacket = { type: PacketType.PUBREL, packetId: 1 }
      const flow = tracker.handlePubrel(pubrel)

      expect(flow).toBeDefined()
      expect(flow?.packetId).toBe(1)
      expect(tracker.inboundCount).toBe(0)
      expect(tracker.hasInbound(1)).toBe(false)
    })

    it("returns undefined for unknown PUBREL", () => {
      const tracker = new QoSFlowTracker()
      const pubrel: PubrelPacket = { type: PacketType.PUBREL, packetId: 99 }
      expect(tracker.handlePubrel(pubrel)).toBeUndefined()
    })

    it("throws for QoS 2 inbound packet without packetId", () => {
      const tracker = new QoSFlowTracker()
      const packet: PublishPacket = {
        ...makePublish(1, 2),
        packetId: undefined
      }
      expect(() => {
        tracker.startQoS2Inbound(packet, Date.now())
      }).toThrow("packetId")
    })
  })

  describe("receive maximum", () => {
    it("tracks outbound count against receive maximum", () => {
      const tracker = new QoSFlowTracker(2)

      expect(tracker.canSendOutbound()).toBe(true)
      tracker.startQoS1Outbound(makePublish(1, 1), Date.now())

      expect(tracker.canSendOutbound()).toBe(true)
      tracker.startQoS1Outbound(makePublish(2, 1), Date.now())

      expect(tracker.canSendOutbound()).toBe(false)
    })

    it("clamps receive maximum to valid range", () => {
      const tracker1 = new QoSFlowTracker(0)
      expect(tracker1.canSendOutbound()).toBe(true) // Clamped to 1

      const tracker2 = new QoSFlowTracker(100000)
      // Should be clamped to 65535, but we can test it allows at least 3
      tracker2.startQoS1Outbound(makePublish(1, 1), Date.now())
      tracker2.startQoS1Outbound(makePublish(2, 1), Date.now())
      tracker2.startQoS1Outbound(makePublish(3, 1), Date.now())
      expect(tracker2.canSendOutbound()).toBe(true)
    })
  })

  describe("retry support", () => {
    it("increments retry count", () => {
      const tracker = new QoSFlowTracker()
      const now = Date.now()
      tracker.startQoS1Outbound(makePublish(1, 1), now)

      const updated = tracker.incrementRetry(1, now + 5000)
      expect(updated?.retryCount).toBe(1)
      expect(updated?.sentAt).toBe(now + 5000)
    })

    it("gets flows needing retry", () => {
      const tracker = new QoSFlowTracker()
      const now = Date.now()

      tracker.startQoS1Outbound(makePublish(1, 1), now - 10000) // Old
      tracker.startQoS1Outbound(makePublish(2, 1), now) // Recent

      const needsRetry = tracker.getFlowsNeedingRetry(5000, now)
      expect(needsRetry).toHaveLength(1)
      expect(needsRetry[0].packetId).toBe(1)
    })
  })

  describe("session management", () => {
    it("restores flows from session state", () => {
      const tracker = new QoSFlowTracker()
      const packet1 = makePublish(1, 1)
      const packet2 = makePublish(2, 2)

      tracker.restore(
        [
          {
            type: "qos1-outbound",
            packetId: 1,
            packet: packet1,
            sentAt: Date.now(),
            retryCount: 2
          }
        ],
        [
          {
            type: "qos2-inbound",
            packetId: 2,
            packet: packet2,
            state: "awaiting-pubrel",
            receivedAt: Date.now()
          }
        ]
      )

      expect(tracker.outboundCount).toBe(1)
      expect(tracker.inboundCount).toBe(1)
      expect(tracker.getOutbound(1)?.retryCount).toBe(2)
    })

    it("clears all flows", () => {
      const tracker = new QoSFlowTracker()
      tracker.startQoS1Outbound(makePublish(1, 1), Date.now())
      tracker.startQoS2Inbound(makePublish(2, 2), Date.now())

      tracker.clear()

      expect(tracker.outboundCount).toBe(0)
      expect(tracker.inboundCount).toBe(0)
    })

    it("gets all outbound flows for persistence", () => {
      const tracker = new QoSFlowTracker()
      const now = Date.now()
      tracker.startQoS1Outbound(makePublish(1, 1), now)
      tracker.startQoS2Outbound(makePublish(2, 2), now)

      const allOutbound = tracker.getAllOutbound()

      expect(allOutbound.size).toBe(2)
      expect(allOutbound.get(1)?.type).toBe("qos1-outbound")
      expect(allOutbound.get(2)?.type).toBe("qos2-outbound")
    })

    it("gets all inbound flows for persistence", () => {
      const tracker = new QoSFlowTracker()
      const now = Date.now()
      tracker.startQoS2Inbound(makePublish(1, 2), now)
      tracker.startQoS2Inbound(makePublish(2, 2), now)

      const allInbound = tracker.getAllInbound()

      expect(allInbound.size).toBe(2)
      expect(allInbound.get(1)?.type).toBe("qos2-inbound")
      expect(allInbound.get(2)?.type).toBe("qos2-inbound")
    })
  })

  describe("flow retrieval", () => {
    it("gets inbound flow by packet ID", () => {
      const tracker = new QoSFlowTracker()
      const packet = makePublish(1, 2)
      tracker.startQoS2Inbound(packet, Date.now())

      const flow = tracker.getInbound(1)

      expect(flow).toBeDefined()
      expect(flow?.packetId).toBe(1)
      expect(flow?.packet.topic).toBe("test/topic")
    })

    it("returns undefined for unknown inbound packet ID", () => {
      const tracker = new QoSFlowTracker()
      expect(tracker.getInbound(99)).toBeUndefined()
    })

    it("returns undefined when incrementing retry for unknown flow", () => {
      const tracker = new QoSFlowTracker()
      const result = tracker.incrementRetry(99, Date.now())
      expect(result).toBeUndefined()
    })

    it("returns empty array when no flows need retry", () => {
      const tracker = new QoSFlowTracker()
      const now = Date.now()
      tracker.startQoS1Outbound(makePublish(1, 1), now)

      const needsRetry = tracker.getFlowsNeedingRetry(5000, now)
      expect(needsRetry).toHaveLength(0)
    })
  })
})
