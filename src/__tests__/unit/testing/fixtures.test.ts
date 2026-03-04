import { describe, expect, it } from "vitest"

import { PacketType } from "../../../constants.js"
import { allValidFixtures, fixtures, fromAscii, fromHex } from "../../../testing/index.js"

describe("testing/fixtures", () => {
  describe("fromHex", () => {
    it("converts hex string to Uint8Array", () => {
      const result = fromHex("01 02 03")
      expect(Array.from(result)).toEqual([1, 2, 3])
    })

    it("handles uppercase hex", () => {
      const result = fromHex("FF AB CD")
      expect(Array.from(result)).toEqual([255, 171, 205])
    })

    it("handles no spaces", () => {
      const result = fromHex("010203")
      expect(Array.from(result)).toEqual([1, 2, 3])
    })
  })

  describe("fromAscii", () => {
    it("converts ASCII string to Uint8Array", () => {
      const result = fromAscii("ABC")
      expect(Array.from(result)).toEqual([65, 66, 67])
    })
  })

  describe("fixtures", () => {
    describe("CONNECT fixtures", () => {
      it("has CONNECT fixtures as array", () => {
        expect(fixtures.connect).toBeInstanceOf(Array)
        expect(fixtures.connect.length).toBeGreaterThan(0)
      })

      it("all CONNECT fixtures have correct type", () => {
        for (const fixture of fixtures.connect) {
          expect(fixture.packet.type).toBe(PacketType.CONNECT)
          expect(fixture.bytes).toBeInstanceOf(Uint8Array)
        }
      })

      it("includes v3.1.1 and v5 fixtures", () => {
        const versions = fixtures.connect.map((f) => f.version)
        expect(versions).toContain("3.1.1")
        expect(versions).toContain("5.0")
      })
    })

    describe("CONNACK fixtures", () => {
      it("has CONNACK fixtures as array", () => {
        expect(fixtures.connack).toBeInstanceOf(Array)
        expect(fixtures.connack.length).toBeGreaterThan(0)
      })

      it("all CONNACK fixtures have correct type", () => {
        for (const fixture of fixtures.connack) {
          expect(fixture.packet.type).toBe(PacketType.CONNACK)
        }
      })

      it("includes session present fixture", () => {
        const sessionPresentFixture = fixtures.connack.find((f) => f.packet.sessionPresent)
        expect(sessionPresentFixture).toBeDefined()
      })
    })

    describe("PUBLISH fixtures", () => {
      it("has PUBLISH fixtures as array", () => {
        expect(fixtures.publish).toBeInstanceOf(Array)
        expect(fixtures.publish.length).toBeGreaterThan(0)
      })

      it("includes QoS 0, 1, and 2 fixtures", () => {
        const qosValues = fixtures.publish.map((f) => f.packet.qos)
        expect(qosValues).toContain(0)
        expect(qosValues).toContain(1)
        expect(qosValues).toContain(2)
      })

      it("QoS 1+ fixtures have packet IDs", () => {
        const qos1Plus = fixtures.publish.filter((f) => f.packet.qos > 0)
        for (const fixture of qos1Plus) {
          expect(fixture.packet.packetId).toBeDefined()
        }
      })
    })

    describe("SUBSCRIBE fixtures", () => {
      it("has SUBSCRIBE fixtures as array", () => {
        expect(fixtures.subscribe).toBeInstanceOf(Array)
        expect(fixtures.subscribe.length).toBeGreaterThan(0)
      })

      it("includes single and multiple topic fixtures", () => {
        const singleTopic = fixtures.subscribe.find((f) => f.packet.subscriptions.length === 1)
        const multiTopic = fixtures.subscribe.find((f) => f.packet.subscriptions.length > 1)
        expect(singleTopic).toBeDefined()
        expect(multiTopic).toBeDefined()
      })
    })

    describe("SUBACK fixtures", () => {
      it("has SUBACK fixtures as array", () => {
        expect(fixtures.suback).toBeInstanceOf(Array)
        expect(fixtures.suback.length).toBeGreaterThan(0)
      })

      it("includes failure reason code fixture", () => {
        const failureFixture = fixtures.suback.find((f) =>
          f.packet.reasonCodes.some((c: number) => c >= 0x80)
        )
        expect(failureFixture).toBeDefined()
      })
    })

    describe("PING fixtures", () => {
      it("has PINGREQ fixture", () => {
        expect(fixtures.pingreq).toBeInstanceOf(Array)
        expect(fixtures.pingreq[0].packet.type).toBe(PacketType.PINGREQ)
        expect(fixtures.pingreq[0].bytes.length).toBe(2)
      })

      it("has PINGRESP fixture", () => {
        expect(fixtures.pingresp).toBeInstanceOf(Array)
        expect(fixtures.pingresp[0].packet.type).toBe(PacketType.PINGRESP)
        expect(fixtures.pingresp[0].bytes.length).toBe(2)
      })
    })

    describe("DISCONNECT fixtures", () => {
      it("has DISCONNECT fixtures as array", () => {
        expect(fixtures.disconnect).toBeInstanceOf(Array)
        expect(fixtures.disconnect.length).toBeGreaterThan(0)
        expect(fixtures.disconnect[0].packet.type).toBe(PacketType.DISCONNECT)
      })
    })
  })

  describe("allValidFixtures", () => {
    it("contains all valid fixtures as flat array", () => {
      expect(allValidFixtures.length).toBeGreaterThan(10)
    })

    it("all fixtures have packet and bytes", () => {
      for (const fixture of allValidFixtures) {
        expect(fixture.packet).toBeDefined()
        expect(fixture.bytes).toBeInstanceOf(Uint8Array)
      }
    })

    it("all fixture packets have valid type", () => {
      const validTypes = Object.values(PacketType).filter((v) => typeof v === "number")

      for (const fixture of allValidFixtures) {
        expect(validTypes).toContain(fixture.packet.type)
      }
    })
  })

  describe("malformed fixtures", () => {
    it("has malformed fixtures as array", () => {
      expect(fixtures.malformed).toBeInstanceOf(Array)
      expect(fixtures.malformed.length).toBeGreaterThan(0)
    })

    it("includes truncated header", () => {
      const truncated = fixtures.malformed.find((f) => f.name.includes("truncated"))
      expect(truncated).toBeDefined()
      expect(truncated?.bytes.length).toBe(1)
    })

    it("includes invalid remaining length", () => {
      const invalid = fixtures.malformed.find((f) => f.name.includes("remaining length"))
      expect(invalid).toBeDefined()
    })

    it("includes invalid packet type", () => {
      const invalid = fixtures.malformed.find((f) => f.name.includes("packet type"))
      expect(invalid).toBeDefined()
    })

    it("all malformed fixtures have expected error", () => {
      for (const fixture of fixtures.malformed) {
        expect(fixture.expectedError).toBeDefined()
      }
    })
  })

  describe("edge cases", () => {
    it("has edgeCases object", () => {
      expect(fixtures.edgeCases).toBeDefined()
      expect(typeof fixtures.edgeCases).toBe("object")
    })

    it("has maxPacketId edge case", () => {
      expect(fixtures.edgeCases.maxPacketId).toBeDefined()
      expect(fixtures.edgeCases.maxPacketId.packet.packetId).toBe(65535)
    })

    it("has minPacketId edge case", () => {
      expect(fixtures.edgeCases.minPacketId).toBeDefined()
      expect(fixtures.edgeCases.minPacketId.packet.packetId).toBe(1)
    })

    it("has emptyClientId edge case", () => {
      expect(fixtures.edgeCases.emptyClientId).toBeDefined()
      expect(fixtures.edgeCases.emptyClientId.packet.clientId).toBe("")
    })

    it("has wildcard subscription edge cases", () => {
      expect(fixtures.edgeCases.multiLevelWildcard).toBeDefined()
      expect(fixtures.edgeCases.singleLevelWildcard).toBeDefined()
    })
  })
})
