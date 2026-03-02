/**
 * Core types tests.
 */

import { describe, expect, it } from "vitest"

import {
  decodeError,
  err,
  isErrorReasonCode,
  isSuccessReasonCode,
  ok,
  PROTOCOL_LEVEL
} from "../../types.js"

describe("types", () => {
  describe("DecodeResult helpers", () => {
    it("ok creates success result", () => {
      const result = ok(42)

      expect(result.ok).toBe(true)
      expect(result).toHaveProperty("value", 42)
    })

    it("err creates failure result", () => {
      const error = decodeError("MALFORMED_PACKET", "test error")
      const result = err(error)

      expect(result.ok).toBe(false)
      expect(result).toHaveProperty("error")
      expect((result as { error: typeof error }).error.code).toBe("MALFORMED_PACKET")
      expect((result as { error: typeof error }).error.message).toBe("test error")
    })
  })

  describe("decodeError", () => {
    it("creates error with required fields", () => {
      const error = decodeError("INCOMPLETE", "not enough bytes")

      expect(error.code).toBe("INCOMPLETE")
      expect(error.message).toBe("not enough bytes")
      expect(error.specRef).toBeUndefined()
      expect(error.offset).toBeUndefined()
    })

    it("creates error with spec reference", () => {
      const error = decodeError("MALFORMED_VARINT", "varint too long", "§2.2.3")

      expect(error.code).toBe("MALFORMED_VARINT")
      expect(error.specRef).toBe("§2.2.3")
    })

    it("creates error with offset", () => {
      const error = decodeError("MALFORMED_PACKET", "invalid header", undefined, 42)

      expect(error.code).toBe("MALFORMED_PACKET")
      expect(error.offset).toBe(42)
    })

    it("creates error with all fields", () => {
      const error = decodeError("MALFORMED_UTF8", "invalid encoding", "§1.5.4", 100)

      expect(error.code).toBe("MALFORMED_UTF8")
      expect(error.message).toBe("invalid encoding")
      expect(error.specRef).toBe("§1.5.4")
      expect(error.offset).toBe(100)
    })
  })

  describe("PROTOCOL_LEVEL", () => {
    it("maps 3.1.1 to level 4", () => {
      expect(PROTOCOL_LEVEL["3.1.1"]).toBe(4)
    })

    it("maps 5.0 to level 5", () => {
      expect(PROTOCOL_LEVEL["5.0"]).toBe(5)
    })
  })

  describe("reason code helpers", () => {
    it("isSuccessReasonCode identifies success codes", () => {
      expect(isSuccessReasonCode(0x00)).toBe(true) // Success
      expect(isSuccessReasonCode(0x01)).toBe(true) // Granted QoS 1
      expect(isSuccessReasonCode(0x02)).toBe(true) // Granted QoS 2
      expect(isSuccessReasonCode(0x10)).toBe(true) // No matching subscribers
      expect(isSuccessReasonCode(0x19)).toBe(true) // Re-authenticate
    })

    it("isSuccessReasonCode rejects error codes", () => {
      expect(isSuccessReasonCode(0x80)).toBe(false) // Unspecified error
      expect(isSuccessReasonCode(0x81)).toBe(false) // Malformed packet
      expect(isSuccessReasonCode(0x87)).toBe(false) // Not authorised
    })

    it("isErrorReasonCode identifies error codes", () => {
      expect(isErrorReasonCode(0x80)).toBe(true) // Unspecified error
      expect(isErrorReasonCode(0x81)).toBe(true) // Malformed packet
      expect(isErrorReasonCode(0x87)).toBe(true) // Not authorised
      expect(isErrorReasonCode(0xa2)).toBe(true) // Wildcard subscriptions not supported
    })

    it("isErrorReasonCode rejects success codes", () => {
      expect(isErrorReasonCode(0x00)).toBe(false)
      expect(isErrorReasonCode(0x01)).toBe(false)
      expect(isErrorReasonCode(0x19)).toBe(false) // Re-authenticate
    })
  })
})
