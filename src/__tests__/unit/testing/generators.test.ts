import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { PacketType } from "../../../constants.js"
import {
  arbBinary,
  arbChunkSplits,
  arbClientId,
  arbConnectProperties,
  arbDeleteBytes,
  arbInsertBytes,
  arbMqttPacket,
  arbMqttString,
  arbMutateByte,
  arbMutation,
  arbMutations,
  arbPacketId,
  arbProtocolVersion,
  arbPublishPacket,
  arbQoS,
  arbTopicFilter,
  arbTruncate,
  arbWithChunkSplits,
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

    it("arbChunkSplits returns empty array for length 0 or 1", () => {
      // Length 0
      const arb0 = arbChunkSplits(0)
      fc.assert(
        fc.property(arb0, (positions) => {
          expect(positions).toEqual([])
        }),
        { numRuns: 5 }
      )

      // Length 1
      const arb1 = arbChunkSplits(1)
      fc.assert(
        fc.property(arb1, (positions) => {
          expect(positions).toEqual([])
        }),
        { numRuns: 5 }
      )
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

    it("arbMutations applies multiple mutations", () => {
      fc.assert(
        fc.property(arbMutations(3), (mutation) => {
          const data = new Uint8Array([1, 2, 3, 4, 5])
          const result = mutation(data)
          expect(result).toBeInstanceOf(Uint8Array)
        }),
        { numRuns: 20 }
      )
    })

    it("arbWithChunkSplits produces value, buffer and chunks", () => {
      const arb = arbWithChunkSplits(fc.uint8Array({ minLength: 3, maxLength: 10 }), (arr) => arr)

      fc.assert(
        fc.property(arb, ({ value, buffer, chunks }) => {
          expect(value).toBeInstanceOf(Uint8Array)
          expect(buffer).toBeInstanceOf(Uint8Array)
          expect(Array.isArray(chunks)).toBe(true)
          // Concatenated chunks should equal original buffer
          const concatenated = new Uint8Array(buffer.length)
          let offset = 0
          for (const chunk of chunks) {
            concatenated.set(chunk, offset)
            offset += chunk.length
          }
          expect(Array.from(concatenated)).toEqual(Array.from(buffer))
        }),
        { numRuns: 20 }
      )
    })
  })

  describe("mutation arbitraries", () => {
    it("arbMutateByte mutates a single byte", () => {
      fc.assert(
        fc.property(arbMutateByte, (mutation) => {
          const data = new Uint8Array([1, 2, 3, 4, 5])
          const result = mutation(data)
          expect(result).toBeInstanceOf(Uint8Array)
          expect(result.length).toBe(data.length)
        }),
        { numRuns: 20 }
      )
    })

    it("arbMutateByte handles empty buffer", () => {
      fc.assert(
        fc.property(arbMutateByte, (mutation) => {
          const data = new Uint8Array([])
          const result = mutation(data)
          expect(result).toBeInstanceOf(Uint8Array)
          expect(result.length).toBe(0)
        }),
        { numRuns: 10 }
      )
    })

    it("arbInsertBytes inserts bytes into buffer", () => {
      fc.assert(
        fc.property(arbInsertBytes, (mutation) => {
          const data = new Uint8Array([1, 2, 3])
          const result = mutation(data)
          expect(result).toBeInstanceOf(Uint8Array)
          // Result should be longer due to insertion
          expect(result.length).toBeGreaterThan(data.length)
        }),
        { numRuns: 20 }
      )
    })

    it("arbInsertBytes handles empty buffer", () => {
      fc.assert(
        fc.property(arbInsertBytes, (mutation) => {
          const data = new Uint8Array([])
          const result = mutation(data)
          expect(result).toBeInstanceOf(Uint8Array)
          // Inserted bytes into empty buffer
          expect(result.length).toBeGreaterThan(0)
        }),
        { numRuns: 10 }
      )
    })

    it("arbDeleteBytes removes bytes from buffer", () => {
      fc.assert(
        fc.property(arbDeleteBytes, (mutation) => {
          const data = new Uint8Array([1, 2, 3, 4, 5])
          const result = mutation(data)
          expect(result).toBeInstanceOf(Uint8Array)
          // Result should be shorter
          expect(result.length).toBeLessThanOrEqual(data.length)
        }),
        { numRuns: 20 }
      )
    })

    it("arbDeleteBytes handles empty buffer", () => {
      fc.assert(
        fc.property(arbDeleteBytes, (mutation) => {
          const data = new Uint8Array([])
          const result = mutation(data)
          expect(result).toBeInstanceOf(Uint8Array)
          expect(result.length).toBe(0)
        }),
        { numRuns: 10 }
      )
    })

    it("arbTruncate truncates buffer", () => {
      fc.assert(
        fc.property(arbTruncate, (mutation) => {
          const data = new Uint8Array([1, 2, 3, 4, 5])
          const result = mutation(data)
          expect(result).toBeInstanceOf(Uint8Array)
          // Result should be shorter or equal
          expect(result.length).toBeLessThanOrEqual(data.length)
        }),
        { numRuns: 20 }
      )
    })

    it("arbTruncate handles empty buffer", () => {
      fc.assert(
        fc.property(arbTruncate, (mutation) => {
          const data = new Uint8Array([])
          const result = mutation(data)
          expect(result).toBeInstanceOf(Uint8Array)
          expect(result.length).toBe(0)
        }),
        { numRuns: 10 }
      )
    })
  })

  describe("additional string arbitraries", () => {
    it("arbTopicFilter produces valid topic filters", () => {
      fc.assert(
        fc.property(arbTopicFilter, (filter) => {
          expect(typeof filter).toBe("string")
          expect(filter.length).toBeGreaterThan(0)
          // Topic filters can have + and # wildcards
          const parts = filter.split("/")
          expect(parts.length).toBeGreaterThan(0)
        }),
        { numRuns: 30 }
      )
    })

    it("arbClientId produces valid client IDs", () => {
      fc.assert(
        fc.property(arbClientId, (clientId) => {
          expect(typeof clientId).toBe("string")
          expect(clientId.length).toBeLessThanOrEqual(23)
          // Should only contain alphanumeric characters
          if (clientId.length > 0) {
            expect(/^[a-zA-Z0-9]*$/.test(clientId)).toBe(true)
          }
        }),
        { numRuns: 30 }
      )
    })
  })

  describe("property arbitraries", () => {
    it("arbConnectProperties produces valid properties or undefined", () => {
      fc.assert(
        fc.property(arbConnectProperties, (props) => {
          if (props === undefined) {
            return true
          }
          expect(typeof props).toBe("object")
          // Check optional properties have correct types when present
          if (props.sessionExpiryInterval !== undefined) {
            expect(typeof props.sessionExpiryInterval).toBe("number")
          }
          if (props.receiveMaximum !== undefined) {
            expect(props.receiveMaximum).toBeGreaterThanOrEqual(1)
          }
          if (props.topicAliasMaximum !== undefined) {
            expect(props.topicAliasMaximum).toBeGreaterThanOrEqual(0)
          }
        }),
        { numRuns: 30 }
      )
    })
  })
})
