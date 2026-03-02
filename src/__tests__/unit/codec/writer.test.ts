/**
 * Binary writer tests.
 */

import { describe, expect, it } from "vitest"

import { BinaryWriter, PacketSizeCalculator } from "../../../codec/writer.js"

describe("BinaryWriter", () => {
  describe("writeUint8", () => {
    it("writes a single byte", () => {
      const writer = new BinaryWriter()
      writer.writeUint8(0x42)

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x42])
    })

    it("supports method chaining", () => {
      const writer = new BinaryWriter()
      writer.writeUint8(0x01).writeUint8(0x02).writeUint8(0x03)

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x01, 0x02, 0x03])
    })
  })

  describe("writeUint16", () => {
    it("writes big-endian uint16", () => {
      const writer = new BinaryWriter()
      writer.writeUint16(0x0102)

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x01, 0x02])
    })

    it("handles maximum value", () => {
      const writer = new BinaryWriter()
      writer.writeUint16(0xffff)

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0xff, 0xff])
    })
  })

  describe("writeUint32", () => {
    it("writes big-endian uint32", () => {
      const writer = new BinaryWriter()
      writer.writeUint32(0x01020304)

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x01, 0x02, 0x03, 0x04])
    })

    it("handles maximum value", () => {
      const writer = new BinaryWriter()
      writer.writeUint32(0xffffffff)

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0xff, 0xff, 0xff, 0xff])
    })
  })

  describe("writeVariableByteInteger", () => {
    it("writes single-byte integers", () => {
      const writer = new BinaryWriter()
      writer.writeVariableByteInteger(127)

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x7f])
    })

    it("writes multi-byte integers", () => {
      const writer = new BinaryWriter()
      writer.writeVariableByteInteger(128)

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x80, 0x01])
    })

    it("writes maximum value", () => {
      const writer = new BinaryWriter()
      writer.writeVariableByteInteger(268_435_455)

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0xff, 0xff, 0xff, 0x7f])
    })
  })

  describe("writeBytes", () => {
    it("writes raw bytes", () => {
      const writer = new BinaryWriter()
      writer.writeBytes(new Uint8Array([0x01, 0x02, 0x03]))

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x01, 0x02, 0x03])
    })

    it("handles empty bytes", () => {
      const writer = new BinaryWriter()
      writer.writeBytes(new Uint8Array([]))

      const result = writer.toUint8Array()
      expect(result.length).toBe(0)
    })
  })

  describe("writeMqttString", () => {
    it("writes length-prefixed string", () => {
      const writer = new BinaryWriter()
      writer.writeMqttString("MQTT")

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x00, 0x04, 0x4d, 0x51, 0x54, 0x54])
    })

    it("handles empty string", () => {
      const writer = new BinaryWriter()
      writer.writeMqttString("")

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x00, 0x00])
    })
  })

  describe("writeUtf8", () => {
    it("writes raw utf-8 without length prefix", () => {
      const writer = new BinaryWriter()
      writer.writeUtf8("MQTT")

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x4d, 0x51, 0x54, 0x54])
    })
  })

  describe("writeMqttBinary", () => {
    it("writes length-prefixed binary", () => {
      const writer = new BinaryWriter()
      writer.writeMqttBinary(new Uint8Array([0x01, 0x02, 0x03]))

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x00, 0x03, 0x01, 0x02, 0x03])
    })
  })

  describe("buffer growth", () => {
    it("grows buffer automatically", () => {
      const writer = new BinaryWriter(4) // Small initial size
      writer.writeBytes(new Uint8Array(100).fill(0x42))

      const result = writer.toUint8Array()
      expect(result.length).toBe(100)
      expect(result.every((b) => b === 0x42)).toBe(true)
    })
  })

  describe("reserve and writeAt", () => {
    it("reserves space and writes later", () => {
      const writer = new BinaryWriter()

      // Reserve space for a uint16
      const offset = writer.reserve(2)
      expect(offset).toBe(0)

      // Write more data
      writer.writeUint8(0x03)
      writer.writeUint8(0x04)

      // Fill in the reserved space
      writer.writeAt(offset, new Uint8Array([0x01, 0x02]))

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x01, 0x02, 0x03, 0x04])
    })

    it("writeUint8At writes single byte at offset", () => {
      const writer = new BinaryWriter()
      writer.reserve(2)
      writer.writeUint8(0x03)

      writer.writeUint8At(0, 0x01)
      writer.writeUint8At(1, 0x02)

      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x01, 0x02, 0x03])
    })

    it("throws when writeAt extends beyond written data", () => {
      const writer = new BinaryWriter()
      writer.writeUint8(0x01)

      expect(() => {
        writer.writeAt(1, new Uint8Array([0x02]))
      }).toThrow(RangeError)
    })

    it("throws when writeUint8At extends beyond written data", () => {
      const writer = new BinaryWriter()
      writer.writeUint8(0x01)

      expect(() => {
        writer.writeUint8At(1, 0x02)
      }).toThrow(RangeError)
    })
  })

  describe("toUint8ArrayView", () => {
    it("returns view into internal buffer", () => {
      const writer = new BinaryWriter()
      writer.writeUint8(0x01).writeUint8(0x02)

      const view = writer.toUint8ArrayView()
      expect(Array.from(view)).toEqual([0x01, 0x02])

      // It's a view, so length should match written data
      expect(view.length).toBe(2)
    })
  })

  describe("reset", () => {
    it("resets writer for reuse", () => {
      const writer = new BinaryWriter()
      writer.writeUint8(0x01).writeUint8(0x02)

      writer.reset()
      expect(writer.length).toBe(0)

      writer.writeUint8(0x03)
      const result = writer.toUint8Array()
      expect(Array.from(result)).toEqual([0x03])
    })
  })

  describe("length", () => {
    it("tracks written length", () => {
      const writer = new BinaryWriter()
      expect(writer.length).toBe(0)

      writer.writeUint8(0x01)
      expect(writer.length).toBe(1)

      writer.writeUint16(0x0203)
      expect(writer.length).toBe(3)

      writer.writeUint32(0x04050607)
      expect(writer.length).toBe(7)
    })
  })
})

describe("PacketSizeCalculator", () => {
  it("calculates uint8 size", () => {
    const calc = new PacketSizeCalculator()
    calc.addUint8()
    expect(calc.length).toBe(1)
  })

  it("calculates uint16 size", () => {
    const calc = new PacketSizeCalculator()
    calc.addUint16()
    expect(calc.length).toBe(2)
  })

  it("calculates uint32 size", () => {
    const calc = new PacketSizeCalculator()
    calc.addUint32()
    expect(calc.length).toBe(4)
  })

  it("calculates variable byte integer size", () => {
    const calc = new PacketSizeCalculator()
    calc.addVariableByteInteger(127)
    expect(calc.length).toBe(1)

    calc.reset()
    calc.addVariableByteInteger(128)
    expect(calc.length).toBe(2)

    calc.reset()
    calc.addVariableByteInteger(268_435_455)
    expect(calc.length).toBe(4)
  })

  it("calculates mqtt string size", () => {
    const calc = new PacketSizeCalculator()
    calc.addMqttString("MQTT")
    expect(calc.length).toBe(6) // 2 + 4
  })

  it("calculates mqtt binary size", () => {
    const calc = new PacketSizeCalculator()
    calc.addMqttBinary(10)
    expect(calc.length).toBe(12) // 2 + 10
  })

  it("supports method chaining", () => {
    const calc = new PacketSizeCalculator()
    calc.addUint8().addUint16().addBytes(5)
    expect(calc.length).toBe(8) // 1 + 2 + 5
  })

  it("resets correctly", () => {
    const calc = new PacketSizeCalculator()
    calc.addUint32()
    expect(calc.length).toBe(4)

    calc.reset()
    expect(calc.length).toBe(0)
  })
})
