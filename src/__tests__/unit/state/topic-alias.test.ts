import { describe, expect, it } from "vitest"

import { TopicAliasError, TopicAliasManager, TopicAliasMap } from "../../../state/topic-alias.js"

describe("TopicAliasMap", () => {
  describe("constructor", () => {
    it("sets maximum to 0 for disabled aliases", () => {
      const map = new TopicAliasMap(0)
      expect(map.getMaximum()).toBe(0)
    })

    it("floors fractional maximum", () => {
      const map = new TopicAliasMap(10.7)
      expect(map.getMaximum()).toBe(10)
    })

    it("clamps negative maximum to 0", () => {
      const map = new TopicAliasMap(-5)
      expect(map.getMaximum()).toBe(0)
    })
  })

  describe("set", () => {
    it("stores alias to topic mapping", () => {
      const map = new TopicAliasMap(10)
      map.set(1, "sensor/temperature")
      expect(map.get(1)).toBe("sensor/temperature")
    })

    it("overwrites existing mapping", () => {
      const map = new TopicAliasMap(10)
      map.set(1, "topic1")
      map.set(1, "topic2")
      expect(map.get(1)).toBe("topic2")
    })

    it("throws if aliases are disabled", () => {
      const map = new TopicAliasMap(0)
      expect(() => {
        map.set(1, "topic")
      }).toThrow(TopicAliasError)
      expect(() => {
        map.set(1, "topic")
      }).toThrow("topic aliases are disabled")
    })

    it("throws if alias is out of range", () => {
      const map = new TopicAliasMap(10)
      expect(() => {
        map.set(0, "topic")
      }).toThrow(TopicAliasError)
      expect(() => {
        map.set(11, "topic")
      }).toThrow(TopicAliasError)
      expect(() => {
        map.set(11, "topic")
      }).toThrow("out of range")
    })
  })

  describe("get", () => {
    it("returns undefined for unknown alias", () => {
      const map = new TopicAliasMap(10)
      expect(map.get(1)).toBeUndefined()
    })
  })

  describe("isValid", () => {
    it("returns false if aliases disabled", () => {
      const map = new TopicAliasMap(0)
      expect(map.isValid(1)).toBe(false)
    })

    it("returns false for out-of-range aliases", () => {
      const map = new TopicAliasMap(10)
      expect(map.isValid(0)).toBe(false)
      expect(map.isValid(11)).toBe(false)
    })

    it("returns true for valid aliases", () => {
      const map = new TopicAliasMap(10)
      expect(map.isValid(1)).toBe(true)
      expect(map.isValid(10)).toBe(true)
    })
  })

  describe("delete", () => {
    it("removes mapping", () => {
      const map = new TopicAliasMap(10)
      map.set(1, "topic")
      expect(map.delete(1)).toBe(true)
      expect(map.get(1)).toBeUndefined()
    })

    it("returns false if no mapping exists", () => {
      const map = new TopicAliasMap(10)
      expect(map.delete(1)).toBe(false)
    })
  })

  describe("clear", () => {
    it("removes all mappings", () => {
      const map = new TopicAliasMap(10)
      map.set(1, "topic1")
      map.set(2, "topic2")
      map.clear()
      expect(map.size).toBe(0)
      expect(map.get(1)).toBeUndefined()
    })
  })
})

describe("TopicAliasManager", () => {
  describe("resolveInbound", () => {
    it("sets mapping when topic and alias both present", () => {
      const manager = new TopicAliasManager(0, 10)
      const result = manager.resolveInbound("sensor/temp", 1)
      expect(result).toBe("sensor/temp")
      // Now can resolve with alias only
      expect(manager.resolveInbound("", 1)).toBe("sensor/temp")
    })

    it("throws for unknown alias with empty topic", () => {
      const manager = new TopicAliasManager(0, 10)
      expect(() => manager.resolveInbound("", 5)).toThrow(TopicAliasError)
      expect(() => manager.resolveInbound("", 5)).toThrow("unknown topic alias")
    })

    it("throws for empty topic without alias", () => {
      const manager = new TopicAliasManager(0, 10)
      expect(() => manager.resolveInbound("", undefined)).toThrow(TopicAliasError)
      expect(() => manager.resolveInbound("", undefined)).toThrow("empty topic without alias")
    })

    it("returns topic when no alias provided", () => {
      const manager = new TopicAliasManager(0, 10)
      expect(manager.resolveInbound("normal/topic", undefined)).toBe("normal/topic")
    })
  })

  describe("getOrAssignOutbound", () => {
    it("returns undefined when aliases disabled", () => {
      const manager = new TopicAliasManager(0, 0)
      expect(manager.getOrAssignOutbound("topic")).toBeUndefined()
    })

    it("assigns new alias on first use", () => {
      const manager = new TopicAliasManager(10, 0)
      const result = manager.getOrAssignOutbound("sensor/temp")
      expect(result).toEqual({ alias: 1, sendTopic: true })
    })

    it("returns existing alias without sendTopic on reuse", () => {
      const manager = new TopicAliasManager(10, 0)
      manager.getOrAssignOutbound("sensor/temp") // First use
      const result = manager.getOrAssignOutbound("sensor/temp")
      expect(result).toEqual({ alias: 1, sendTopic: false })
    })

    it("assigns sequential aliases", () => {
      const manager = new TopicAliasManager(10, 0)
      expect(manager.getOrAssignOutbound("topic1")).toEqual({ alias: 1, sendTopic: true })
      expect(manager.getOrAssignOutbound("topic2")).toEqual({ alias: 2, sendTopic: true })
      expect(manager.getOrAssignOutbound("topic3")).toEqual({ alias: 3, sendTopic: true })
    })

    it("returns undefined when all slots used", () => {
      const manager = new TopicAliasManager(2, 0)
      manager.getOrAssignOutbound("topic1")
      manager.getOrAssignOutbound("topic2")
      expect(manager.getOrAssignOutbound("topic3")).toBeUndefined()
    })
  })

  describe("clear", () => {
    it("resets all state", () => {
      const manager = new TopicAliasManager(10, 10)
      manager.getOrAssignOutbound("topic1")
      manager.resolveInbound("topic2", 1)
      manager.clear()

      // Outbound should start fresh
      const result = manager.getOrAssignOutbound("topic1")
      expect(result).toEqual({ alias: 1, sendTopic: true })

      // Inbound should be unknown
      expect(() => manager.resolveInbound("", 1)).toThrow(TopicAliasError)
    })
  })
})
