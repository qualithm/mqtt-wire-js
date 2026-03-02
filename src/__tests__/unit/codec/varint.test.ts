/**
 * Variable byte integer codec tests.
 *
 * Test vectors from MQTT 5.0 §2.2.3.
 */

import { describe, expect, it } from "vitest"

import {
  decodeVariableByteInteger,
  encodeVariableByteInteger,
  encodeVariableByteIntegerToArray,
  hasCompleteVariableByteInteger,
  variableByteIntegerLength
} from "../../../codec/varint.js"

describe("variableByteInteger", () => {
  /**
   * [§2.2.3] Test vectors from MQTT 5.0 specification Table 2-1.
   *
   * | Decimal    | Hex Bytes          |
   * |------------|--------------------|
   * | 0          | 0x00               |
   * | 127        | 0x7F               |
   * | 128        | 0x80 0x01          |
   * | 16383      | 0xFF 0x7F          |
   * | 16384      | 0x80 0x80 0x01     |
   * | 2097151    | 0xFF 0xFF 0x7F     |
   * | 2097152    | 0x80 0x80 0x80 0x01|
   * | 268435455  | 0xFF 0xFF 0xFF 0x7F|
   */
  const specVectors: [number, number[]][] = [
    [0, [0x00]],
    [127, [0x7f]],
    [128, [0x80, 0x01]],
    [16_383, [0xff, 0x7f]],
    [16_384, [0x80, 0x80, 0x01]],
    [2_097_151, [0xff, 0xff, 0x7f]],
    [2_097_152, [0x80, 0x80, 0x80, 0x01]],
    [268_435_455, [0xff, 0xff, 0xff, 0x7f]]
  ]

  describe("encode [§2.2.3]", () => {
    it.each(specVectors)("encodes %d correctly", (value, expectedBytes) => {
      const result = encodeVariableByteIntegerToArray(value)
      expect(Array.from(result)).toEqual(expectedBytes)
    })

    it("encodes into a buffer at offset", () => {
      const buffer = new Uint8Array(10)
      const bytesWritten = encodeVariableByteInteger(321, buffer, 2)

      expect(bytesWritten).toBe(2)
      expect(buffer[2]).toBe(0xc1)
      expect(buffer[3]).toBe(0x02)
    })

    it("throws for negative values", () => {
      expect(() => encodeVariableByteIntegerToArray(-1)).toThrow(RangeError)
    })

    it("throws for values exceeding maximum", () => {
      expect(() => encodeVariableByteIntegerToArray(268_435_456)).toThrow(RangeError)
    })

    it("throws when buffer is too small", () => {
      const buffer = new Uint8Array(1)
      expect(() => encodeVariableByteInteger(128, buffer, 0)).toThrow(RangeError)
    })
  })

  describe("decode [§2.2.3]", () => {
    it.each(specVectors)("decodes %d correctly", (expectedValue, bytes) => {
      const buffer = new Uint8Array(bytes)
      const result = decodeVariableByteInteger(buffer, 0)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.value).toBe(expectedValue)
        expect(result.value.bytesRead).toBe(bytes.length)
      }
    })

    it("decodes from offset", () => {
      const buffer = new Uint8Array([0x00, 0x00, 0xc1, 0x02])
      const result = decodeVariableByteInteger(buffer, 2)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.value).toBe(321)
        expect(result.value.bytesRead).toBe(2)
      }
    })

    it("returns error for incomplete data", () => {
      const buffer = new Uint8Array([0x80]) // Continuation bit set, no more bytes
      const result = decodeVariableByteInteger(buffer, 0)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })

    it("returns error for malformed (5+ continuation bytes) [§2.2.3]", () => {
      // All 4 bytes have continuation bit set
      const buffer = new Uint8Array([0x80, 0x80, 0x80, 0x80])
      const result = decodeVariableByteInteger(buffer, 0)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("MALFORMED_VARINT")
        expect(result.error.specRef).toBe("§2.2.3")
      }
    })

    it("returns error for empty buffer", () => {
      const buffer = new Uint8Array([])
      const result = decodeVariableByteInteger(buffer, 0)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })
  })

  describe("variableByteIntegerLength", () => {
    it.each([
      [0, 1],
      [127, 1],
      [128, 2],
      [16_383, 2],
      [16_384, 3],
      [2_097_151, 3],
      [2_097_152, 4],
      [268_435_455, 4]
    ])("returns %d bytes for value %d", (value, expectedLength) => {
      expect(variableByteIntegerLength(value)).toBe(expectedLength)
    })

    it("throws for out of range values", () => {
      expect(() => variableByteIntegerLength(-1)).toThrow(RangeError)
      expect(() => variableByteIntegerLength(268_435_456)).toThrow(RangeError)
    })
  })

  describe("hasCompleteVariableByteInteger", () => {
    it("returns true for complete single-byte integer", () => {
      expect(hasCompleteVariableByteInteger(new Uint8Array([0x7f]), 0)).toBe(true)
    })

    it("returns true for complete multi-byte integer", () => {
      expect(hasCompleteVariableByteInteger(new Uint8Array([0x80, 0x01]), 0)).toBe(true)
    })

    it("returns false for incomplete integer", () => {
      expect(hasCompleteVariableByteInteger(new Uint8Array([0x80]), 0)).toBe(false)
    })

    it("returns false for empty buffer", () => {
      expect(hasCompleteVariableByteInteger(new Uint8Array([]), 0)).toBe(false)
    })

    it("handles offset correctly", () => {
      const buffer = new Uint8Array([0x00, 0x80, 0x01])
      expect(hasCompleteVariableByteInteger(buffer, 1)).toBe(true)
    })

    it("returns true for malformed (4 continuation bytes)", () => {
      // Malformed but "complete" for parsing purposes
      expect(hasCompleteVariableByteInteger(new Uint8Array([0x80, 0x80, 0x80, 0x80]), 0)).toBe(true)
    })
  })

  describe("encode/decode symmetry", () => {
    it.each([0, 1, 63, 64, 127, 128, 255, 1000, 16383, 16384, 100000, 268_435_455])(
      "round-trips value %d",
      (value) => {
        const encoded = encodeVariableByteIntegerToArray(value)
        const decoded = decodeVariableByteInteger(encoded, 0)

        expect(decoded.ok).toBe(true)
        if (decoded.ok) {
          expect(decoded.value.value).toBe(value)
        }
      }
    )
  })
})
