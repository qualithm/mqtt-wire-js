/**
 * Stream framing tests.
 */

import { describe, expect, it } from "vitest"

import { parsePacketFrame, readPacketFrame, StreamFramer } from "../../../codec/framing.js"

describe("readPacketFrame", () => {
  describe("complete packets", () => {
    it("reads a minimal packet (PINGREQ)", () => {
      // PINGREQ: type 12, flags 0, remaining length 0
      const buffer = new Uint8Array([0xc0, 0x00])
      const result = readPacketFrame(buffer, 0)

      expect(result.status).toBe("complete")
      if (result.status === "complete") {
        expect(Array.from(result.packetData)).toEqual([0xc0, 0x00])
        expect(result.bytesConsumed).toBe(2)
      }
    })

    it("reads a packet with payload", () => {
      // PUBLISH: type 3, remaining length 5, payload "hello"
      const buffer = new Uint8Array([0x30, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f])
      const result = readPacketFrame(buffer, 0)

      expect(result.status).toBe("complete")
      if (result.status === "complete") {
        expect(result.bytesConsumed).toBe(7)
      }
    })

    it("reads a packet with multi-byte remaining length", () => {
      // Create a packet with remaining length 128 (requires 2 bytes: 0x80 0x01)
      const payload = new Uint8Array(128)
      const buffer = new Uint8Array([0x30, 0x80, 0x01, ...payload])
      const result = readPacketFrame(buffer, 0)

      expect(result.status).toBe("complete")
      if (result.status === "complete") {
        expect(result.bytesConsumed).toBe(3 + 128) // header + remaining length + payload
      }
    })

    it("reads from offset", () => {
      const buffer = new Uint8Array([0x00, 0x00, 0xc0, 0x00])
      const result = readPacketFrame(buffer, 2)

      expect(result.status).toBe("complete")
      if (result.status === "complete") {
        expect(Array.from(result.packetData)).toEqual([0xc0, 0x00])
      }
    })
  })

  describe("incomplete packets", () => {
    it("returns incomplete for empty buffer", () => {
      const result = readPacketFrame(new Uint8Array([]), 0)
      expect(result.status).toBe("incomplete")
    })

    it("returns incomplete when remaining length is incomplete", () => {
      // First byte says continuation, but no second byte
      const buffer = new Uint8Array([0x30, 0x80])
      const result = readPacketFrame(buffer, 0)
      expect(result.status).toBe("incomplete")
    })

    it("returns incomplete when payload is incomplete", () => {
      // Says 5 bytes of payload, only has 3
      const buffer = new Uint8Array([0x30, 0x05, 0x01, 0x02, 0x03])
      const result = readPacketFrame(buffer, 0)
      expect(result.status).toBe("incomplete")
    })
  })

  describe("errors", () => {
    it("returns error for invalid packet type 0", () => {
      const buffer = new Uint8Array([0x00, 0x00])
      const result = readPacketFrame(buffer, 0)

      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error.code).toBe("MALFORMED_PACKET")
        expect(result.error.message).toContain("invalid packet type")
      }
    })

    it("returns error for malformed remaining length", () => {
      // All 4 bytes have continuation bit set
      const buffer = new Uint8Array([0x30, 0x80, 0x80, 0x80, 0x80])
      const result = readPacketFrame(buffer, 0)

      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error.code).toBe("MALFORMED_VARINT")
      }
    })

    it("returns error when packet exceeds max size", () => {
      // Remaining length = 268435455 (max varint), exceeds small max
      const buffer = new Uint8Array([0x30, 0xff, 0xff, 0xff, 0x7f])
      const result = readPacketFrame(buffer, 0, 1000)

      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error.code).toBe("PACKET_TOO_LARGE")
      }
    })
  })
})

describe("parsePacketFrame", () => {
  it("parses frame information from complete packet", () => {
    // CONNECT packet start: type 1, flags 0, remaining length 12
    const buffer = new Uint8Array([0x10, 0x0c])
    const result = parsePacketFrame(buffer)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.packetType).toBe(1)
      expect(result.value.flags).toBe(0)
      expect(result.value.remainingLength).toBe(12)
      expect(result.value.headerSize).toBe(2)
      expect(result.value.totalSize).toBe(14)
    }
  })

  it("extracts flags correctly", () => {
    // PUBLISH with DUP=1, QoS=2, RETAIN=1: 0x3D = 0011 1101
    const buffer = new Uint8Array([0x3d, 0x00])
    const result = parsePacketFrame(buffer)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.packetType).toBe(3)
      expect(result.value.flags).toBe(0x0d) // 1101
    }
  })

  it("returns error for empty buffer", () => {
    const result = parsePacketFrame(new Uint8Array([]))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("INCOMPLETE")
    }
  })

  it("returns error for invalid packet type 0", () => {
    const result = parsePacketFrame(new Uint8Array([0x00, 0x00])) // Type 0 is invalid

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("MALFORMED_PACKET")
    }
  })

  it("returns error for malformed remaining length", () => {
    // 5 continuation bytes (invalid per §2.2.3)
    const result = parsePacketFrame(new Uint8Array([0x10, 0x80, 0x80, 0x80, 0x80, 0x80]))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("MALFORMED_VARINT")
    }
  })
})

describe("StreamFramer", () => {
  describe("basic operation", () => {
    it("extracts complete packets", () => {
      const framer = new StreamFramer()
      framer.push(new Uint8Array([0xc0, 0x00])) // PINGREQ

      const result = framer.read()

      expect(result.status).toBe("complete")
      if (result.status === "complete") {
        expect(Array.from(result.packetData)).toEqual([0xc0, 0x00])
      }
    })

    it("buffers incomplete packets", () => {
      const framer = new StreamFramer()
      framer.push(new Uint8Array([0x30, 0x05, 0x01, 0x02])) // Incomplete

      let result = framer.read()
      expect(result.status).toBe("incomplete")

      // Complete the packet
      framer.push(new Uint8Array([0x03, 0x04, 0x05]))

      result = framer.read()
      expect(result.status).toBe("complete")
      if (result.status === "complete") {
        expect(result.packetData.length).toBe(7)
      }
    })

    it("handles multiple packets in one chunk", () => {
      const framer = new StreamFramer()
      // Two PINGREQ packets
      framer.push(new Uint8Array([0xc0, 0x00, 0xc0, 0x00]))

      const result1 = framer.read()
      expect(result1.status).toBe("complete")

      const result2 = framer.read()
      expect(result2.status).toBe("complete")

      const result3 = framer.read()
      expect(result3.status).toBe("incomplete")
    })

    it("handles packets split across multiple chunks", () => {
      const framer = new StreamFramer()

      // PUBLISH with 5-byte payload, split into single bytes
      const packet = [0x30, 0x05, 0x01, 0x02, 0x03, 0x04, 0x05]

      for (let i = 0; i < packet.length - 1; i++) {
        framer.push(new Uint8Array([packet[i]]))
        expect(framer.read().status).toBe("incomplete")
      }

      // Last byte completes the packet
      framer.push(new Uint8Array([packet[packet.length - 1]]))
      const result = framer.read()
      expect(result.status).toBe("complete")
    })
  })

  describe("bufferedLength", () => {
    it("tracks buffered bytes", () => {
      const framer = new StreamFramer()

      expect(framer.bufferedLength).toBe(0)

      framer.push(new Uint8Array([0x30, 0x05, 0x01]))
      expect(framer.bufferedLength).toBe(3)

      framer.push(new Uint8Array([0x02, 0x03, 0x04, 0x05]))
      expect(framer.bufferedLength).toBe(7)

      framer.read() // Consume the packet
      expect(framer.bufferedLength).toBe(0)
    })

    it("tracks buffered bytes before consolidation", () => {
      const framer = new StreamFramer()

      // Push multiple chunks without reading (no consolidation yet)
      framer.push(new Uint8Array([0x30]))
      framer.push(new Uint8Array([0x05]))

      // bufferedLength should return totalLength when buffer is null
      expect(framer.bufferedLength).toBe(2)
    })
  })

  describe("compaction", () => {
    it("compacts buffer when more than half consumed", () => {
      const framer = new StreamFramer()

      // Push a large buffer with multiple packets
      // First packet: PINGREQ (2 bytes), then more data
      framer.push(
        new Uint8Array([
          0xc0,
          0x00, // PINGREQ
          0xc0,
          0x00, // PINGREQ
          0xc0,
          0x00, // PINGREQ
          0xc0,
          0x00 // PINGREQ
        ])
      )

      // Read first packet (consumes 2 of 8 bytes = 25%)
      let result = framer.read()
      expect(result.status).toBe("complete")

      // Read second packet (consumes 4 of 8 bytes = 50%)
      result = framer.read()
      expect(result.status).toBe("complete")

      // Read third packet (consumes 6 of 8 bytes = 75% - triggers compaction)
      result = framer.read()
      expect(result.status).toBe("complete")

      // Read fourth packet (should still work after compaction)
      result = framer.read()
      expect(result.status).toBe("complete")

      // No more data
      result = framer.read()
      expect(result.status).toBe("incomplete")
    })
  })

  describe("clear", () => {
    it("clears all buffered data", () => {
      const framer = new StreamFramer()
      framer.push(new Uint8Array([0x30, 0x05, 0x01, 0x02]))

      framer.clear()

      expect(framer.bufferedLength).toBe(0)
      expect(framer.read().status).toBe("incomplete")
    })
  })

  describe("max packet size", () => {
    it("enforces max packet size", () => {
      const framer = new StreamFramer(10) // Max 10 bytes
      // Packet with remaining length 20
      framer.push(new Uint8Array([0x30, 0x14]))

      const result = framer.read()

      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error.code).toBe("PACKET_TOO_LARGE")
      }
    })
  })

  describe("empty chunks", () => {
    it("ignores empty chunks", () => {
      const framer = new StreamFramer()
      framer.push(new Uint8Array([]))
      expect(framer.bufferedLength).toBe(0)

      framer.push(new Uint8Array([0xc0, 0x00]))
      expect(framer.bufferedLength).toBe(2)
    })
  })

  describe("packet data isolation", () => {
    it("returns copies of packet data", () => {
      const framer = new StreamFramer()
      const original = new Uint8Array([0xc0, 0x00])
      framer.push(original)

      const result = framer.read()
      expect(result.status).toBe("complete")
      if (result.status === "complete") {
        // Modify returned data
        result.packetData[0] = 0xff

        // Push same packet again
        framer.push(new Uint8Array([0xc0, 0x00]))
        const result2 = framer.read()
        expect(result2.status).toBe("complete")
        if (result2.status === "complete") {
          // Should be unaffected
          expect(result2.packetData[0]).toBe(0xc0)
        }
      }
    })
  })
})
