import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { PacketType } from "../../../constants.js"
import {
  arbBinary,
  arbChunkSplits,
  arbMqttPacket,
  arbMqttString,
  arbMutation,
  arbPacketId,
  arbProtocolVersion,
  arbPublishPacket,
  arbQoS,
  splitAtPositions
} from "../../../testing/index.js"

describe("testing/generators", () => {
  describe("primitive arbitraries", () => {
    it("arbQoS produces 0, 1, or 2", () => {
      fc.assert(
        fc.property(arbQoS, (qos) => {
          expect([0, 1, 2]).toContain(qos)
        })
      )
    })

    it("arbPacketId produces values 1-65535", () => {
      fc.assert(
        fc.property(arbPacketId, (value) => {
          expect(value).toBeGreaterThanOrEqual(1)
          expect(value).toBeLessThanOrEqual(65535)
        })
      )
    })

    it("arbProtocolVersion produces 3.1.1 or 5.0", () => {
      fc.assert(
        fc.property(arbProtocolVersion, (version) => {
          expect(["3.1.1", "5.0"]).toContain(version)
        })
      )
    })
  })

  describe("string arbitraries", () => {
    it("arbMqttString produces valid strings", () => {
      fc.assert(
        fc.property(arbMqttString, (str) => {
          expect(typeof str).toBe("string")
          expect(str.length).toBeLessThanOrEqual(65535)
        })
      )
    })

    it("arbBinary produces Uint8Array", () => {
      fc.assert(
        fc.property(arbBinary, (data) => {
          expect(data).toBeInstanceOf(Uint8Array)
          expect(data.length).toBeLessThanOrEqual(65535)
        })
      )
    })
  })

  describe("packet arbitraries", () => {
    it("arbPublishPacket produces valid PUBLISH packets", () => {
      fc.assert(
        fc.property(arbPublishPacket, (packet) => {
          expect(packet.type).toBe(PacketType.PUBLISH)
          expect(typeof packet.topic).toBe("string")
          expect([0, 1, 2]).toContain(packet.qos)
        }),
        { numRuns: 50 }
      )
    })

    it("arbMqttPacket produces packets with valid types", () => {
      const validTypes = Object.values(PacketType).filter(
        (v) => typeof v === "number"
      ) as PacketType[]

      fc.assert(
        fc.property(arbMqttPacket, (packet) => {
          expect(validTypes).toContain(packet.type)
        }),
        { numRuns: 100 }
      )
    })
  })

  describe("testing utilities", () => {
    it("arbChunkSplits produces valid split positions", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (length) => {
          const arb = arbChunkSplits(length)
          const result = fc.check(
            fc.property(arb, (positions) => {
              // Positions should be sorted and within bounds
              for (let i = 0; i < positions.length; i++) {
                if (positions[i] < 0 || positions[i] >= length) {
                  return false
                }
                if (i > 0 && positions[i] <= positions[i - 1]) {
                  return false
                }
              }
              return true
            }),
            { numRuns: 10 }
          )
          expect(result.failed).toBe(false)
        }),
        { numRuns: 20 }
      )
    })

    it("splitAtPositions splits correctly", () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5])
      const chunks = splitAtPositions(buffer, [2, 4])

      expect(chunks).toHaveLength(3)
      expect(Array.from(chunks[0])).toEqual([1, 2])
      expect(Array.from(chunks[1])).toEqual([3, 4])
      expect(Array.from(chunks[2])).toEqual([5])
    })

    it("splitAtPositions handles empty positions", () => {
      const buffer = new Uint8Array([1, 2, 3])
      const chunks = splitAtPositions(buffer, [])

      expect(chunks).toHaveLength(1)
      expect(Array.from(chunks[0])).toEqual([1, 2, 3])
    })

    it("arbMutation produces mutation functions", () => {
      fc.assert(
        fc.property(arbMutation, (mutation) => {
          const data = new Uint8Array([1, 2, 3, 4, 5])
          const result = mutation(data)
          // Mutation should return a Uint8Array
          expect(result).toBeInstanceOf(Uint8Array)
        }),
        { numRuns: 50 }
      )
    })
  })
})
