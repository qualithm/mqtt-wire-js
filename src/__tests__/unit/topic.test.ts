/**
 * Topic utilities tests.
 *
 * Tests topic name/filter validation, matching, and shared subscriptions per §4.7, §4.8.
 */

import { describe, expect, it } from "vitest"

import {
  isSharedSubscription,
  isValidTopicFilter,
  isValidTopicName,
  joinTopicLevels,
  MAX_TOPIC_LENGTH,
  parseSharedSubscription,
  parseTopicLevels,
  SHARED_SUBSCRIPTION_PREFIX,
  topicMatches,
  validateTopicFilter,
  validateTopicName,
  WILDCARD_MULTI,
  WILDCARD_SINGLE
} from "../../topic.js"

describe("topic", () => {
  describe("constants", () => {
    it("defines correct wildcard characters", () => {
      expect(WILDCARD_SINGLE).toBe("+")
      expect(WILDCARD_MULTI).toBe("#")
    })

    it("defines correct shared subscription prefix", () => {
      expect(SHARED_SUBSCRIPTION_PREFIX).toBe("$share/")
    })

    it("defines maximum topic length", () => {
      expect(MAX_TOPIC_LENGTH).toBe(65535)
    })
  })

  describe("isValidTopicName [§4.7.1]", () => {
    it("accepts valid topic names", () => {
      expect(isValidTopicName("sport/tennis/player1")).toBe(true)
      expect(isValidTopicName("sport")).toBe(true)
      expect(isValidTopicName("/")).toBe(true)
      expect(isValidTopicName("sport/")).toBe(true)
      expect(isValidTopicName("/sport")).toBe(true)
      expect(isValidTopicName("a")).toBe(true)
    })

    it("accepts unicode topic names", () => {
      expect(isValidTopicName("日本語/トピック")).toBe(true)
      expect(isValidTopicName("émoji/🎾")).toBe(true)
    })

    it("accepts $-prefixed topics", () => {
      expect(isValidTopicName("$SYS/broker/clients")).toBe(true)
      expect(isValidTopicName("$share/group/topic")).toBe(true)
    })

    it("rejects empty topic names", () => {
      expect(isValidTopicName("")).toBe(false)
    })

    it("rejects topic names with + wildcard", () => {
      expect(isValidTopicName("sport/+/player1")).toBe(false)
      expect(isValidTopicName("+")).toBe(false)
      expect(isValidTopicName("sport+")).toBe(false)
    })

    it("rejects topic names with # wildcard", () => {
      expect(isValidTopicName("sport/#")).toBe(false)
      expect(isValidTopicName("#")).toBe(false)
      expect(isValidTopicName("sport#")).toBe(false)
    })

    it("rejects topic names exceeding max length", () => {
      const longTopic = "a".repeat(MAX_TOPIC_LENGTH + 1)
      expect(isValidTopicName(longTopic)).toBe(false)
    })

    it("accepts topic names at max length", () => {
      const maxTopic = "a".repeat(MAX_TOPIC_LENGTH)
      expect(isValidTopicName(maxTopic)).toBe(true)
    })
  })

  describe("validateTopicName [§4.7.1]", () => {
    it("returns ok for valid topics", () => {
      const result = validateTopicName("sport/tennis/player1")
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe("sport/tennis/player1")
      }
    })

    it("returns error for empty topic", () => {
      const result = validateTopicName("")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.message).toContain("empty")
      }
    })

    it("returns error for + wildcard", () => {
      const result = validateTopicName("sport/+")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.message).toContain("+")
      }
    })

    it("returns error for # wildcard", () => {
      const result = validateTopicName("sport/#")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.message).toContain("#")
      }
    })

    it("returns error for exceeding max length", () => {
      const result = validateTopicName("a".repeat(MAX_TOPIC_LENGTH + 1))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.message).toContain("length")
      }
    })
  })

  describe("isValidTopicFilter [§4.7.1]", () => {
    it("accepts valid topic filters without wildcards", () => {
      expect(isValidTopicFilter("sport/tennis/player1")).toBe(true)
      expect(isValidTopicFilter("sport")).toBe(true)
      expect(isValidTopicFilter("/")).toBe(true)
    })

    it("accepts + wildcard as entire level", () => {
      expect(isValidTopicFilter("+")).toBe(true)
      expect(isValidTopicFilter("sport/+")).toBe(true)
      expect(isValidTopicFilter("+/tennis")).toBe(true)
      expect(isValidTopicFilter("sport/+/player1")).toBe(true)
      expect(isValidTopicFilter("+/+/+")).toBe(true)
    })

    it("accepts # wildcard at end", () => {
      expect(isValidTopicFilter("#")).toBe(true)
      expect(isValidTopicFilter("sport/#")).toBe(true)
      expect(isValidTopicFilter("sport/tennis/#")).toBe(true)
      expect(isValidTopicFilter("+/#")).toBe(true)
    })

    it("rejects + wildcard mixed with other characters", () => {
      expect(isValidTopicFilter("sport+")).toBe(false)
      expect(isValidTopicFilter("+sport")).toBe(false)
      expect(isValidTopicFilter("sp+ort")).toBe(false)
      expect(isValidTopicFilter("sport/tennis+")).toBe(false)
    })

    it("rejects # wildcard not at end", () => {
      expect(isValidTopicFilter("#/sport")).toBe(false)
      expect(isValidTopicFilter("sport/#/player")).toBe(false)
    })

    it("rejects # wildcard mixed with other characters", () => {
      expect(isValidTopicFilter("sport#")).toBe(false)
      expect(isValidTopicFilter("#sport")).toBe(false)
      expect(isValidTopicFilter("sp#ort")).toBe(false)
    })

    it("rejects empty topic filters", () => {
      expect(isValidTopicFilter("")).toBe(false)
    })

    it("rejects filters exceeding max length", () => {
      const longFilter = "a".repeat(MAX_TOPIC_LENGTH + 1)
      expect(isValidTopicFilter(longFilter)).toBe(false)
    })
  })

  describe("validateTopicFilter [§4.7.1]", () => {
    it("returns ok for valid filters", () => {
      const result = validateTopicFilter("sport/+/player1")
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe("sport/+/player1")
      }
    })

    it("returns error with spec reference for invalid + placement", () => {
      const result = validateTopicFilter("sport+")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.specRef).toBe("§4.7.1.1")
      }
    })

    it("returns error with spec reference for invalid # placement", () => {
      const result = validateTopicFilter("#/sport")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.specRef).toBe("§4.7.1.2")
      }
    })

    it("returns error for # not standalone", () => {
      const result = validateTopicFilter("sport#")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.specRef).toBe("§4.7.1.2")
      }
    })

    it("returns error for empty filter", () => {
      const result = validateTopicFilter("")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.message).toContain("empty")
      }
    })

    it("returns error for filter exceeding max length", () => {
      const result = validateTopicFilter("a".repeat(MAX_TOPIC_LENGTH + 1))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.message).toContain("length")
      }
    })
  })

  describe("topicMatches [§4.7.2]", () => {
    describe("exact matching", () => {
      it("matches identical topics", () => {
        expect(topicMatches("sport/tennis/player1", "sport/tennis/player1")).toBe(true)
        expect(topicMatches("sport", "sport")).toBe(true)
        expect(topicMatches("/", "/")).toBe(true)
      })

      it("does not match different topics", () => {
        expect(topicMatches("sport/tennis", "sport/football")).toBe(false)
        expect(topicMatches("sport/tennis", "sport/tennis/player1")).toBe(false)
        expect(topicMatches("sport/tennis/player1", "sport/tennis")).toBe(false)
      })
    })

    describe("+ wildcard (single level) [§4.7.1.1]", () => {
      it("matches single level", () => {
        expect(topicMatches("sport/tennis/player1", "sport/tennis/+")).toBe(true)
        expect(topicMatches("sport/tennis/player2", "sport/tennis/+")).toBe(true)
      })

      it("matches at any position", () => {
        expect(topicMatches("sport/tennis/player1", "sport/+/player1")).toBe(true)
        expect(topicMatches("sport/tennis/player1", "+/tennis/player1")).toBe(true)
      })

      it("matches multiple + wildcards", () => {
        expect(topicMatches("sport/tennis/player1", "+/+/+")).toBe(true)
        expect(topicMatches("a/b/c", "+/+/+")).toBe(true)
      })

      it("does not match zero levels", () => {
        expect(topicMatches("sport/tennis", "sport/+/player1")).toBe(false)
      })

      it("does not match multiple levels", () => {
        expect(topicMatches("sport/tennis/player1/score", "sport/+/player1")).toBe(false)
      })

      it("matches empty level", () => {
        expect(topicMatches("sport//player1", "sport/+/player1")).toBe(true)
      })
    })

    describe("# wildcard (multi-level) [§4.7.1.2]", () => {
      it("matches all remaining levels", () => {
        expect(topicMatches("sport/tennis/player1", "sport/#")).toBe(true)
        expect(topicMatches("sport/tennis/player1/ranking", "sport/#")).toBe(true)
      })

      it("matches zero levels", () => {
        expect(topicMatches("sport", "sport/#")).toBe(true)
        expect(topicMatches("sport/", "sport/#")).toBe(true)
      })

      it("matches everything when standalone", () => {
        expect(topicMatches("sport", "#")).toBe(true)
        expect(topicMatches("sport/tennis", "#")).toBe(true)
        expect(topicMatches("sport/tennis/player1", "#")).toBe(true)
      })

      it("works with + and #", () => {
        expect(topicMatches("sport/tennis/player1", "+/tennis/#")).toBe(true)
        expect(topicMatches("sport/tennis", "+/tennis/#")).toBe(true)
      })
    })

    describe("$-prefixed topics [§4.7.2]", () => {
      it("does not match $ topics with # at root", () => {
        expect(topicMatches("$SYS/broker/clients", "#")).toBe(false)
        expect(topicMatches("$SYS/broker", "#")).toBe(false)
      })

      it("does not match $ topics with + at root", () => {
        expect(topicMatches("$SYS/broker/clients", "+/broker/clients")).toBe(false)
      })

      it("matches $ topics with explicit $ prefix in filter", () => {
        expect(topicMatches("$SYS/broker/clients", "$SYS/#")).toBe(true)
        expect(topicMatches("$SYS/broker/clients", "$SYS/broker/+")).toBe(true)
        expect(topicMatches("$SYS/broker/clients", "$SYS/broker/clients")).toBe(true)
      })

      it("matches non-$ topics starting with wildcard", () => {
        expect(topicMatches("sport/tennis", "#")).toBe(true)
        expect(topicMatches("sport/tennis", "+/tennis")).toBe(true)
      })
    })

    describe("spec examples [§4.7.2 non-normative examples]", () => {
      it("sport/tennis/player1/# matches spec examples", () => {
        const filter = "sport/tennis/player1/#"
        expect(topicMatches("sport/tennis/player1", filter)).toBe(true)
        expect(topicMatches("sport/tennis/player1/ranking", filter)).toBe(true)
        expect(topicMatches("sport/tennis/player1/score/wimbledon", filter)).toBe(true)
      })

      it("sport/# matches spec examples", () => {
        const filter = "sport/#"
        expect(topicMatches("sport", filter)).toBe(true)
      })

      it("sport/tennis/+ matches spec examples", () => {
        const filter = "sport/tennis/+"
        expect(topicMatches("sport/tennis/player1", filter)).toBe(true)
        expect(topicMatches("sport/tennis/player2", filter)).toBe(true)
        expect(topicMatches("sport/tennis/player1/ranking", filter)).toBe(false)
      })

      it("sport/+ matches spec examples", () => {
        const filter = "sport/+"
        expect(topicMatches("sport/", filter)).toBe(true)
        expect(topicMatches("sport", filter)).toBe(false)
      })

      it("+/+ matches spec examples", () => {
        const filter = "+/+"
        expect(topicMatches("/finance", filter)).toBe(true)
      })

      it("/+ matches spec examples", () => {
        const filter = "/+"
        expect(topicMatches("/finance", filter)).toBe(true)
      })

      it("+/monitor/Clients matches spec examples", () => {
        const filter = "+/monitor/Clients"
        expect(topicMatches("$SYS/monitor/Clients", filter)).toBe(false)
      })
    })
  })

  describe("isSharedSubscription [§4.8.2]", () => {
    it("returns true for shared subscriptions", () => {
      expect(isSharedSubscription("$share/consumer1/sport/tennis")).toBe(true)
      expect(isSharedSubscription("$share/group/+")).toBe(true)
      expect(isSharedSubscription("$share/group/#")).toBe(true)
    })

    it("returns false for regular subscriptions", () => {
      expect(isSharedSubscription("sport/tennis")).toBe(false)
      expect(isSharedSubscription("$SYS/broker")).toBe(false)
      expect(isSharedSubscription("share/group/topic")).toBe(false)
    })
  })

  describe("parseSharedSubscription [§4.8.2]", () => {
    it("parses valid shared subscriptions", () => {
      const result = parseSharedSubscription("$share/consumer1/sport/tennis")
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.shareGroup).toBe("consumer1")
        expect(result.value.topicFilter).toBe("sport/tennis")
      }
    })

    it("parses shared subscriptions with wildcards", () => {
      const result = parseSharedSubscription("$share/group/sport/+/player/#")
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.shareGroup).toBe("group")
        expect(result.value.topicFilter).toBe("sport/+/player/#")
      }
    })

    it("parses shared subscriptions with simple filters", () => {
      const result = parseSharedSubscription("$share/mygroup/topic")
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.shareGroup).toBe("mygroup")
        expect(result.value.topicFilter).toBe("topic")
      }
    })

    it("returns error for non-shared subscription", () => {
      const result = parseSharedSubscription("sport/tennis")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.specRef).toBe("§4.8.2")
      }
    })

    it("returns error for missing topic filter", () => {
      const result = parseSharedSubscription("$share/group")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.message).toContain("missing")
      }
    })

    it("returns error for empty group name", () => {
      const result = parseSharedSubscription("$share//topic")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.message).toContain("empty")
      }
    })

    it("returns error for group name with +", () => {
      const result = parseSharedSubscription("$share/group+/topic")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.message).toContain("invalid characters")
      }
    })

    it("returns error for group name with #", () => {
      const result = parseSharedSubscription("$share/group#/topic")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
        expect(result.error.message).toContain("invalid characters")
      }
    })

    it("returns error for invalid topic filter", () => {
      const result = parseSharedSubscription("$share/group/topic#invalid")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TOPIC")
      }
    })
  })

  describe("parseTopicLevels", () => {
    it("splits topic into levels", () => {
      expect(parseTopicLevels("sport/tennis/player1")).toEqual(["sport", "tennis", "player1"])
      expect(parseTopicLevels("sport")).toEqual(["sport"])
      expect(parseTopicLevels("/")).toEqual(["", ""])
      expect(parseTopicLevels("sport/")).toEqual(["sport", ""])
      expect(parseTopicLevels("/sport")).toEqual(["", "sport"])
    })

    it("preserves wildcards", () => {
      expect(parseTopicLevels("sport/+/player/#")).toEqual(["sport", "+", "player", "#"])
    })
  })

  describe("joinTopicLevels", () => {
    it("joins levels into topic", () => {
      expect(joinTopicLevels(["sport", "tennis", "player1"])).toBe("sport/tennis/player1")
      expect(joinTopicLevels(["sport"])).toBe("sport")
      expect(joinTopicLevels(["", ""])).toBe("/")
    })

    it("is inverse of parseTopicLevels", () => {
      const topics = ["sport/tennis", "sport/+/player/#", "/", "a/b/c/d"]
      for (const topic of topics) {
        expect(joinTopicLevels(parseTopicLevels(topic))).toBe(topic)
      }
    })
  })
})
