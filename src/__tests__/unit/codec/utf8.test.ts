/**
 * UTF-8 encoding, decoding, and validation tests.
 *
 * Tests MQTT string restrictions per §1.5.4.
 */

import { describe, expect, it } from "vitest"

import {
  decodeMqttBinary,
  decodeMqttString,
  decodeUtf8,
  encodeMqttBinary,
  encodeMqttString,
  encodeUtf8,
  isValidMqttString,
  utf8ByteLength,
  validateMqttUtf8
} from "../../../codec/utf8.js"

describe("utf8", () => {
  describe("isValidMqttString [§1.5.4]", () => {
    it("accepts normal ASCII strings", () => {
      expect(isValidMqttString("hello world")).toBe(true)
      expect(isValidMqttString("test/topic")).toBe(true)
      expect(isValidMqttString("")).toBe(true)
    })

    it("accepts unicode strings", () => {
      expect(isValidMqttString("こんにちは")).toBe(true)
      expect(isValidMqttString("émoji 🎉")).toBe(true)
      expect(isValidMqttString("Ω≈ç√∫")).toBe(true)
    })

    it("rejects null character (U+0000)", () => {
      expect(isValidMqttString("hello\x00world")).toBe(false)
      expect(isValidMqttString("\x00")).toBe(false)
    })

    it("rejects control characters U+0001 to U+001F", () => {
      // Tab, newline, etc. are all invalid
      expect(isValidMqttString("hello\tworld")).toBe(false)
      expect(isValidMqttString("hello\nworld")).toBe(false)
      expect(isValidMqttString("hello\rworld")).toBe(false)
      expect(isValidMqttString("\x01")).toBe(false)
      expect(isValidMqttString("\x1F")).toBe(false)
    })

    it("rejects control characters U+007F to U+009F", () => {
      expect(isValidMqttString("\x7F")).toBe(false) // DEL
      expect(isValidMqttString("\x80")).toBe(false)
      expect(isValidMqttString("\x9F")).toBe(false)
    })

    it("accepts U+0020 (space) and U+00A0 (nbsp)", () => {
      expect(isValidMqttString(" ")).toBe(true) // Regular space
      expect(isValidMqttString("\u00A0")).toBe(true) // NBSP (after control range)
    })
  })

  describe("validateMqttUtf8 [§1.5.4]", () => {
    it("validates valid utf-8 bytes", () => {
      const bytes = new TextEncoder().encode("hello")
      const result = validateMqttUtf8(bytes)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe("hello")
      }
    })

    it("rejects invalid utf-8 sequences", () => {
      // Invalid UTF-8: continuation byte without start byte
      const invalidBytes = new Uint8Array([0x80, 0x81, 0x82])
      const result = validateMqttUtf8(invalidBytes)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("MALFORMED_UTF8")
      }
    })

    it("rejects truncated utf-8 sequences", () => {
      // Start of 2-byte sequence without second byte
      const truncated = new Uint8Array([0xc3])
      const result = validateMqttUtf8(truncated)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("MALFORMED_UTF8")
      }
    })

    it("rejects mqtt-prohibited characters in valid utf-8", () => {
      const withNull = new TextEncoder().encode("hello\x00world")
      const result = validateMqttUtf8(withNull)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("MALFORMED_UTF8")
        expect(result.error.message).toContain("prohibited")
      }
    })
  })

  describe("encodeUtf8 / decodeUtf8", () => {
    it("round-trips ASCII strings", () => {
      const str = "hello world"
      const encoded = encodeUtf8(str)
      const decoded = decodeUtf8(encoded)

      expect(decoded.ok).toBe(true)
      if (decoded.ok) {
        expect(decoded.value).toBe(str)
      }
    })

    it("round-trips unicode strings", () => {
      const str = "こんにちは 🎉"
      const encoded = encodeUtf8(str)
      const decoded = decodeUtf8(encoded)

      expect(decoded.ok).toBe(true)
      if (decoded.ok) {
        expect(decoded.value).toBe(str)
      }
    })

    it("handles empty string", () => {
      const encoded = encodeUtf8("")
      expect(encoded.length).toBe(0)

      const decoded = decodeUtf8(encoded)
      expect(decoded.ok).toBe(true)
      if (decoded.ok) {
        expect(decoded.value).toBe("")
      }
    })

    it("returns error for invalid UTF-8 bytes", () => {
      // Invalid UTF-8: continuation byte without start byte
      const invalidBytes = new Uint8Array([0x80, 0x81, 0x82])
      const result = decodeUtf8(invalidBytes)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("MALFORMED_UTF8")
      }
    })
  })

  describe("utf8ByteLength", () => {
    it("calculates ASCII length correctly", () => {
      expect(utf8ByteLength("hello")).toBe(5)
      expect(utf8ByteLength("")).toBe(0)
    })

    it("calculates 2-byte chars correctly", () => {
      // Latin extended characters: 2 bytes each
      expect(utf8ByteLength("é")).toBe(2)
      expect(utf8ByteLength("ñ")).toBe(2)
    })

    it("calculates 3-byte chars correctly", () => {
      // CJK characters: 3 bytes each
      expect(utf8ByteLength("日")).toBe(3)
      expect(utf8ByteLength("日本")).toBe(6)
    })

    it("calculates 4-byte chars (emoji) correctly", () => {
      // Emoji: 4 bytes each (surrogate pair in UTF-16)
      expect(utf8ByteLength("🎉")).toBe(4)
      expect(utf8ByteLength("👨‍👩‍👧‍👦")).toBe(25) // Family emoji with ZWJ
    })

    it("matches actual encoding length", () => {
      const testStrings = ["hello", "日本語", "🎉🎊🎈", "mixed 日本 🎉"]
      for (const str of testStrings) {
        expect(utf8ByteLength(str)).toBe(encodeUtf8(str).length)
      }
    })

    it("handles lone high surrogate", () => {
      // Create a string with lone high surrogate
      const loneHighSurrogate = String.fromCharCode(0xd800)
      // Lone surrogates encode as replacement character (3 bytes)
      expect(utf8ByteLength(loneHighSurrogate)).toBe(3)
    })

    it("handles lone low surrogate", () => {
      // Create a string with lone low surrogate
      const loneLowSurrogate = String.fromCharCode(0xdc00)
      // Lone surrogates encode as replacement character (3 bytes)
      expect(utf8ByteLength(loneLowSurrogate)).toBe(3)
    })
  })

  describe("encodeMqttString / decodeMqttString [§1.5.4]", () => {
    it("encodes with 2-byte length prefix", () => {
      const encoded = encodeMqttString("MQTT")

      expect(encoded.length).toBe(6) // 2 + 4
      expect(encoded[0]).toBe(0x00)
      expect(encoded[1]).toBe(0x04)
      expect(encoded[2]).toBe(0x4d) // M
      expect(encoded[3]).toBe(0x51) // Q
      expect(encoded[4]).toBe(0x54) // T
      expect(encoded[5]).toBe(0x54) // T
    })

    it("decodes length-prefixed string", () => {
      const buffer = new Uint8Array([0x00, 0x04, 0x4d, 0x51, 0x54, 0x54])
      const result = decodeMqttString(buffer, 0)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.value).toBe("MQTT")
        expect(result.value.bytesRead).toBe(6)
      }
    })

    it("round-trips strings", () => {
      const testStrings = ["", "hello", "日本語", "test/topic/path"]

      for (const str of testStrings) {
        const encoded = encodeMqttString(str)
        const decoded = decodeMqttString(encoded, 0)

        expect(decoded.ok).toBe(true)
        if (decoded.ok) {
          expect(decoded.value.value).toBe(str)
        }
      }
    })

    it("returns error for incomplete length prefix", () => {
      const buffer = new Uint8Array([0x00]) // Only 1 byte
      const result = decodeMqttString(buffer, 0)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })

    it("returns error for incomplete string content", () => {
      const buffer = new Uint8Array([0x00, 0x04, 0x4d, 0x51]) // Says 4 bytes, only has 2
      const result = decodeMqttString(buffer, 0)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })

    it("returns error for string with MQTT-prohibited characters", () => {
      // Create a buffer with length prefix and string containing null byte
      const buffer = new Uint8Array([0x00, 0x03, 0x41, 0x00, 0x42]) // "A\0B"
      const result = decodeMqttString(buffer, 0)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("MALFORMED_UTF8")
      }
    })

    it("throws for string exceeding 65535 bytes", () => {
      const longString = "a".repeat(65_536)
      expect(() => encodeMqttString(longString)).toThrow(RangeError)
    })

    it("handles maximum length string", () => {
      const maxString = "a".repeat(65_535)
      const encoded = encodeMqttString(maxString)

      expect(encoded.length).toBe(2 + 65_535)
      expect(encoded[0]).toBe(0xff)
      expect(encoded[1]).toBe(0xff)
    })
  })

  describe("encodeMqttBinary / decodeMqttBinary", () => {
    it("encodes binary data with length prefix", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03])
      const encoded = encodeMqttBinary(data)

      expect(encoded.length).toBe(5)
      expect(encoded[0]).toBe(0x00)
      expect(encoded[1]).toBe(0x03)
      expect(encoded[2]).toBe(0x01)
      expect(encoded[3]).toBe(0x02)
      expect(encoded[4]).toBe(0x03)
    })

    it("decodes length-prefixed binary data", () => {
      const buffer = new Uint8Array([0x00, 0x03, 0x01, 0x02, 0x03])
      const result = decodeMqttBinary(buffer, 0)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(Array.from(result.value.value)).toEqual([0x01, 0x02, 0x03])
        expect(result.value.bytesRead).toBe(5)
      }
    })

    it("round-trips binary data", () => {
      const data = new Uint8Array([0x00, 0xff, 0x80, 0x7f])
      const encoded = encodeMqttBinary(data)
      const decoded = decodeMqttBinary(encoded, 0)

      expect(decoded.ok).toBe(true)
      if (decoded.ok) {
        expect(Array.from(decoded.value.value)).toEqual(Array.from(data))
      }
    })

    it("handles empty binary data", () => {
      const data = new Uint8Array([])
      const encoded = encodeMqttBinary(data)
      const decoded = decodeMqttBinary(encoded, 0)

      expect(decoded.ok).toBe(true)
      if (decoded.ok) {
        expect(decoded.value.value.length).toBe(0)
        expect(decoded.value.bytesRead).toBe(2)
      }
    })

    it("returns error for incomplete length prefix", () => {
      const buffer = new Uint8Array([0x00]) // Only 1 byte
      const result = decodeMqttBinary(buffer, 0)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })

    it("returns error for incomplete binary content", () => {
      const buffer = new Uint8Array([0x00, 0x05, 0x01, 0x02]) // Says 5 bytes, only has 2
      const result = decodeMqttBinary(buffer, 0)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })

    it("throws for data exceeding 65535 bytes", () => {
      const largeData = new Uint8Array(65_536)
      expect(() => encodeMqttBinary(largeData)).toThrow(RangeError)
    })
  })
})
