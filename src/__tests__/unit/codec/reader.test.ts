/**
 * Binary reader tests.
 */

import { describe, expect, it } from "vitest"

import { BinaryReader } from "../../../codec/reader.js"

describe("BinaryReader", () => {
  describe("readUint8", () => {
    it("reads a single byte", () => {
      const reader = new BinaryReader(new Uint8Array([0x42]))
      const result = reader.readUint8()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(0x42)
      }
      expect(reader.offset).toBe(1)
    })

    it("returns error when no bytes available", () => {
      const reader = new BinaryReader(new Uint8Array([]))
      const result = reader.readUint8()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })
  })

  describe("readUint16", () => {
    it("reads big-endian uint16", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02]))
      const result = reader.readUint16()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(0x0102)
      }
    })

    it("returns error when not enough bytes", () => {
      const reader = new BinaryReader(new Uint8Array([0x01]))
      const result = reader.readUint16()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })
  })

  describe("readUint32", () => {
    it("reads big-endian uint32", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02, 0x03, 0x04]))
      const result = reader.readUint32()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(0x01020304)
      }
    })

    it("handles large values correctly", () => {
      const reader = new BinaryReader(new Uint8Array([0xff, 0xff, 0xff, 0xff]))
      const result = reader.readUint32()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(0xffffffff)
      }
    })
  })

  describe("readVariableByteInteger", () => {
    it("reads variable byte integers", () => {
      const reader = new BinaryReader(new Uint8Array([0x80, 0x01]))
      const result = reader.readVariableByteInteger()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(128)
      }
      expect(reader.offset).toBe(2)
    })

    it("returns error for incomplete variable byte integer", () => {
      // Continuation bit set but no more bytes
      const reader = new BinaryReader(new Uint8Array([0x80]))
      const result = reader.readVariableByteInteger()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })

    it("returns error for malformed variable byte integer", () => {
      // 5 continuation bytes (invalid)
      const reader = new BinaryReader(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80]))
      const result = reader.readVariableByteInteger()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("MALFORMED_VARINT")
      }
    })
  })

  describe("readBytes", () => {
    it("reads specified number of bytes", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]))
      const result = reader.readBytes(3)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(Array.from(result.value)).toEqual([0x01, 0x02, 0x03])
      }
      expect(reader.offset).toBe(3)
    })

    it("returns a copy, not a view", () => {
      const original = new Uint8Array([0x01, 0x02, 0x03])
      const reader = new BinaryReader(original)
      const result = reader.readBytes(3)

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Modify the copy
        result.value[0] = 0xff
        // Original should be unchanged
        expect(original[0]).toBe(0x01)
      }
    })
  })

  describe("readBytesView", () => {
    it("returns a view into the buffer", () => {
      const original = new Uint8Array([0x01, 0x02, 0x03])
      const reader = new BinaryReader(original)
      const result = reader.readBytesView(3)

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Modify the view
        result.value[0] = 0xff
        // Original should be changed
        expect(original[0]).toBe(0xff)
      }
    })
  })

  describe("readMqttString", () => {
    it("reads length-prefixed string", () => {
      const reader = new BinaryReader(new Uint8Array([0x00, 0x04, 0x4d, 0x51, 0x54, 0x54]))
      const result = reader.readMqttString()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe("MQTT")
      }
      expect(reader.offset).toBe(6)
    })

    it("returns error when not enough bytes for length prefix", () => {
      const reader = new BinaryReader(new Uint8Array([0x00]))
      const result = reader.readMqttString()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })

    it("returns error when not enough bytes for string content", () => {
      // Length says 4 bytes, but only 2 available
      const reader = new BinaryReader(new Uint8Array([0x00, 0x04, 0x4d, 0x51]))
      const result = reader.readMqttString()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })
  })

  describe("readMqttBinary", () => {
    it("reads length-prefixed binary data", () => {
      const reader = new BinaryReader(new Uint8Array([0x00, 0x03, 0x01, 0x02, 0x03]))
      const result = reader.readMqttBinary()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(Array.from(result.value)).toEqual([0x01, 0x02, 0x03])
      }
      expect(reader.offset).toBe(5)
    })

    it("returns error when not enough bytes for length prefix", () => {
      const reader = new BinaryReader(new Uint8Array([0x00]))
      const result = reader.readMqttBinary()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })

    it("returns error when not enough bytes for content", () => {
      // Length says 5 bytes, but only 2 available
      const reader = new BinaryReader(new Uint8Array([0x00, 0x05, 0x01, 0x02]))
      const result = reader.readMqttBinary()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })
  })

  describe("skip", () => {
    it("skips specified bytes", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02, 0x03, 0x04]))
      const result = reader.skip(2)

      expect(result.ok).toBe(true)
      expect(reader.offset).toBe(2)
    })

    it("returns error when not enough bytes", () => {
      const reader = new BinaryReader(new Uint8Array([0x01]))
      const result = reader.skip(5)

      expect(result.ok).toBe(false)
    })
  })

  describe("peek", () => {
    it("returns next byte without consuming", () => {
      const reader = new BinaryReader(new Uint8Array([0x42, 0x43]))
      const result = reader.peek()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(0x42)
      }
      expect(reader.offset).toBe(0) // Not consumed
    })
  })

  describe("subReader", () => {
    it("creates constrained sub-reader", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]))
      const subResult = reader.subReader(3)

      expect(subResult.ok).toBe(true)
      if (subResult.ok) {
        const sub = subResult.value
        expect(sub.remaining).toBe(3)

        // Read all from sub-reader
        sub.readBytes(3)
        expect(sub.isAtEnd).toBe(true)
      }

      // Main reader position advanced
      expect(reader.offset).toBe(3)
      expect(reader.remaining).toBe(2)
    })
  })

  describe("position tracking", () => {
    it("tracks remaining bytes correctly", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]))

      expect(reader.remaining).toBe(5)
      expect(reader.isAtEnd).toBe(false)

      reader.readBytes(3)
      expect(reader.remaining).toBe(2)
      expect(reader.isAtEnd).toBe(false)

      reader.readBytes(2)
      expect(reader.remaining).toBe(0)
      expect(reader.isAtEnd).toBe(true)
    })

    it("supports offset and length constraints", () => {
      const buffer = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04])
      const reader = new BinaryReader(buffer, 1, 3)

      expect(reader.offset).toBe(1)
      expect(reader.remaining).toBe(3)

      const result = reader.readBytes(3)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(Array.from(result.value)).toEqual([0x01, 0x02, 0x03])
      }

      expect(reader.isAtEnd).toBe(true)
    })
  })

  describe("readRemainingBytes", () => {
    it("reads all remaining bytes", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]))
      reader.skip(2)
      const remaining = reader.readRemainingBytes()

      expect(Array.from(remaining)).toEqual([0x03, 0x04, 0x05])
      expect(reader.isAtEnd).toBe(true)
    })
  })

  describe("readUtf8", () => {
    it("reads raw UTF-8 string of specified length", () => {
      const reader = new BinaryReader(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f])) // "hello"
      const result = reader.readUtf8(5)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe("hello")
      }
    })

    it("returns error when not enough bytes", () => {
      const reader = new BinaryReader(new Uint8Array([0x68, 0x65]))
      const result = reader.readUtf8(5)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })

    it("does not validate MQTT string restrictions", () => {
      // Null character is invalid in MQTT strings but valid UTF-8
      const reader = new BinaryReader(new Uint8Array([0x61, 0x00, 0x62])) // "a\0b"
      const result = reader.readUtf8(3)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe("a\0b")
      }
    })
  })

  describe("readMqttUtf8", () => {
    it("reads UTF-8 string with MQTT validation", () => {
      const reader = new BinaryReader(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f])) // "hello"
      const result = reader.readMqttUtf8(5)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe("hello")
      }
    })

    it("rejects null characters", () => {
      const reader = new BinaryReader(new Uint8Array([0x61, 0x00, 0x62])) // "a\0b"
      const result = reader.readMqttUtf8(3)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("MALFORMED_UTF8")
      }
    })

    it("returns error when not enough bytes", () => {
      const reader = new BinaryReader(new Uint8Array([0x68, 0x65]))
      const result = reader.readMqttUtf8(5)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })
  })

  describe("readBytes error paths", () => {
    it("returns error when not enough bytes", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02]))
      const result = reader.readBytes(5)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
        expect(result.error.message).toContain("5")
      }
    })
  })

  describe("readBytesView error paths", () => {
    it("returns error when not enough bytes", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02]))
      const result = reader.readBytesView(5)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
        expect(result.error.message).toContain("5")
      }
    })
  })

  describe("peek error paths", () => {
    it("returns error when no bytes available", () => {
      const reader = new BinaryReader(new Uint8Array([]))
      const result = reader.peek()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })
  })

  describe("subReader error paths", () => {
    it("returns error when not enough bytes", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02]))
      const result = reader.subReader(5)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
        expect(result.error.message).toContain("sub-reader")
      }
    })
  })

  describe("readUint32 error paths", () => {
    it("returns error when not enough bytes", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02]))
      const result = reader.readUint32()

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })
  })

  describe("hasRemaining", () => {
    it("returns true when enough bytes available", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02, 0x03]))
      expect(reader.hasRemaining(2)).toBe(true)
      expect(reader.hasRemaining(3)).toBe(true)
    })

    it("returns false when not enough bytes available", () => {
      const reader = new BinaryReader(new Uint8Array([0x01, 0x02]))
      expect(reader.hasRemaining(3)).toBe(false)
      expect(reader.hasRemaining(10)).toBe(false)
    })
  })
})
