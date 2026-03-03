import { describe, expect, it } from "vitest"

import { PacketIdAllocator, PacketIdExhaustedError } from "../../../state/packet-id.js"

describe("PacketIdAllocator", () => {
  describe("allocate", () => {
    it("allocates sequential IDs starting from 1", () => {
      const allocator = new PacketIdAllocator()
      expect(allocator.allocate()).toBe(1)
      expect(allocator.allocate()).toBe(2)
      expect(allocator.allocate()).toBe(3)
    })

    it("wraps around at 65535", () => {
      const allocator = new PacketIdAllocator()
      // Manually set up state near max
      for (let i = 1; i <= 65534; i++) {
        allocator.allocate()
      }
      expect(allocator.allocate()).toBe(65535)
      allocator.release(1) // Free up ID 1
      expect(allocator.allocate()).toBe(1) // Wraps to 1
    })

    it("skips IDs that are in use", () => {
      const allocator = new PacketIdAllocator()
      const id1 = allocator.allocate()
      allocator.allocate() // id2 - just allocate, don't use
      allocator.release(id1)
      const id3 = allocator.allocate() // Should get 3, not 1
      expect(id3).toBe(3)
      const id4 = allocator.allocate() // Now wrap to find 1
      // id4 could be 1 or 4 depending on wraparound
      expect(allocator.isInUse(id4)).toBe(true)
    })
  })

  describe("release", () => {
    it("frees an ID for reuse", () => {
      const allocator = new PacketIdAllocator()
      const id = allocator.allocate()
      expect(allocator.isInUse(id)).toBe(true)
      allocator.release(id)
      expect(allocator.isInUse(id)).toBe(false)
    })

    it("is idempotent", () => {
      const allocator = new PacketIdAllocator()
      const id = allocator.allocate()
      allocator.release(id)
      allocator.release(id) // Should not throw
      expect(allocator.isInUse(id)).toBe(false)
    })
  })

  describe("count", () => {
    it("tracks the number of in-use IDs", () => {
      const allocator = new PacketIdAllocator()
      expect(allocator.count).toBe(0)
      allocator.allocate()
      expect(allocator.count).toBe(1)
      allocator.allocate()
      expect(allocator.count).toBe(2)
      allocator.release(1)
      expect(allocator.count).toBe(1)
    })
  })

  describe("restore", () => {
    it("restores in-use IDs from set", () => {
      const allocator = new PacketIdAllocator()
      allocator.restore([1, 5, 100])
      expect(allocator.isInUse(1)).toBe(true)
      expect(allocator.isInUse(5)).toBe(true)
      expect(allocator.isInUse(100)).toBe(true)
      expect(allocator.isInUse(2)).toBe(false)
      expect(allocator.count).toBe(3)
    })

    it("ignores invalid IDs", () => {
      const allocator = new PacketIdAllocator()
      allocator.restore([0, -1, 65536, 100])
      expect(allocator.count).toBe(1) // Only 100 is valid
      expect(allocator.isInUse(100)).toBe(true)
    })
  })

  describe("reset", () => {
    it("clears all state", () => {
      const allocator = new PacketIdAllocator()
      allocator.allocate()
      allocator.allocate()
      allocator.reset()
      expect(allocator.count).toBe(0)
      expect(allocator.allocate()).toBe(1)
    })
  })

  describe("getInUse", () => {
    it("returns set of in-use IDs", () => {
      const allocator = new PacketIdAllocator()
      allocator.allocate()
      allocator.allocate()
      allocator.allocate()

      const inUse = allocator.getInUse()
      expect(inUse.size).toBe(3)
      expect(inUse.has(1)).toBe(true)
      expect(inUse.has(2)).toBe(true)
      expect(inUse.has(3)).toBe(true)
    })

    it("returns empty set when no IDs allocated", () => {
      const allocator = new PacketIdAllocator()
      const inUse = allocator.getInUse()
      expect(inUse.size).toBe(0)
    })

    it("reflects releases", () => {
      const allocator = new PacketIdAllocator()
      allocator.allocate()
      const id2 = allocator.allocate()
      allocator.release(id2)

      const inUse = allocator.getInUse()
      expect(inUse.size).toBe(1)
      expect(inUse.has(1)).toBe(true)
      expect(inUse.has(2)).toBe(false)
    })
  })

  describe("exhaustion", () => {
    it("throws PacketIdExhaustedError when all IDs are in use", () => {
      const allocator = new PacketIdAllocator()
      // Allocate all 65535 IDs
      for (let i = 1; i <= 65535; i++) {
        allocator.allocate()
      }
      expect(allocator.count).toBe(65535)
      expect(() => allocator.allocate()).toThrow(PacketIdExhaustedError)
    })
  })
})
