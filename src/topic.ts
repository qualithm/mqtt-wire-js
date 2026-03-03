/**
 * Topic name and filter utilities.
 *
 * Provides validation, matching, and parsing for MQTT topics:
 * - Topic name validation (for PUBLISH)
 * - Topic filter validation (for SUBSCRIBE)
 * - Wildcard matching (+ single-level, # multi-level)
 * - Shared subscription parsing ($share/{group}/{filter})
 *
 * @see MQTT 5.0 §4.7
 * @packageDocumentation
 */

import { decodeError, type DecodeResult, err, ok } from "./types.js"

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Maximum topic length in bytes (UTF-8 encoded) */
export const MAX_TOPIC_LENGTH = 65535

/** Single-level wildcard character */
export const WILDCARD_SINGLE = "+"

/** Multi-level wildcard character */
export const WILDCARD_MULTI = "#"

/** Shared subscription prefix */
export const SHARED_SUBSCRIPTION_PREFIX = "$share/"

// -----------------------------------------------------------------------------
// Topic Name Validation
// -----------------------------------------------------------------------------

/**
 * Validates a topic name (used in PUBLISH packets).
 *
 * Topic names:
 * - Must be at least 1 character
 * - Must not exceed 65535 UTF-8 bytes
 * - Must not contain wildcards (+ or #)
 * - Must not contain null characters (validated separately via UTF-8)
 *
 * @param topic - The topic name to validate
 * @returns true if valid, false otherwise
 *
 * @see MQTT 5.0 §4.7.1
 */
export function isValidTopicName(topic: string): boolean {
  // Must have at least 1 character
  if (topic.length === 0) {
    return false
  }

  // Check UTF-8 byte length
  const byteLength = new TextEncoder().encode(topic).length
  if (byteLength > MAX_TOPIC_LENGTH) {
    return false
  }

  // Must not contain wildcards
  if (topic.includes(WILDCARD_SINGLE) || topic.includes(WILDCARD_MULTI)) {
    return false
  }

  return true
}

/**
 * Validates a topic name with detailed error reporting.
 *
 * @param topic - The topic name to validate
 * @returns DecodeResult with the topic or validation error
 *
 * @see MQTT 5.0 §4.7.1
 */
export function validateTopicName(topic: string): DecodeResult<string> {
  if (topic.length === 0) {
    return err(decodeError("INVALID_TOPIC", "topic name must not be empty", "§4.7.1"))
  }

  const byteLength = new TextEncoder().encode(topic).length
  if (byteLength > MAX_TOPIC_LENGTH) {
    return err(decodeError("INVALID_TOPIC", "topic name exceeds maximum length", "§4.7.1"))
  }

  if (topic.includes(WILDCARD_SINGLE)) {
    return err(decodeError("INVALID_TOPIC", "topic name must not contain '+' wildcard", "§4.7.1"))
  }

  if (topic.includes(WILDCARD_MULTI)) {
    return err(decodeError("INVALID_TOPIC", "topic name must not contain '#' wildcard", "§4.7.1"))
  }

  return ok(topic)
}

// -----------------------------------------------------------------------------
// Topic Filter Validation
// -----------------------------------------------------------------------------

/**
 * Validates a topic filter (used in SUBSCRIBE packets).
 *
 * Topic filters:
 * - Must be at least 1 character
 * - Must not exceed 65535 UTF-8 bytes
 * - Single-level wildcard (+) must occupy entire level
 * - Multi-level wildcard (#) must be last character and preceded by /
 *
 * @param filter - The topic filter to validate
 * @returns true if valid, false otherwise
 *
 * @see MQTT 5.0 §4.7.1
 */
export function isValidTopicFilter(filter: string): boolean {
  // Must have at least 1 character
  if (filter.length === 0) {
    return false
  }

  // Check UTF-8 byte length
  const byteLength = new TextEncoder().encode(filter).length
  if (byteLength > MAX_TOPIC_LENGTH) {
    return false
  }

  const levels = filter.split("/")

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]

    // Check for # wildcard
    if (level.includes(WILDCARD_MULTI)) {
      // # must be standalone (whole level)
      if (level !== WILDCARD_MULTI) {
        return false
      }
      // # must be the last level
      if (i !== levels.length - 1) {
        return false
      }
    }

    // Check for + wildcard - must occupy entire level
    if (level.includes(WILDCARD_SINGLE) && level !== WILDCARD_SINGLE) {
      return false
    }
  }

  return true
}

/**
 * Validates a topic filter with detailed error reporting.
 *
 * @param filter - The topic filter to validate
 * @returns DecodeResult with the filter or validation error
 *
 * @see MQTT 5.0 §4.7.1
 */
export function validateTopicFilter(filter: string): DecodeResult<string> {
  if (filter.length === 0) {
    return err(decodeError("INVALID_TOPIC", "topic filter must not be empty", "§4.7.1"))
  }

  const byteLength = new TextEncoder().encode(filter).length
  if (byteLength > MAX_TOPIC_LENGTH) {
    return err(decodeError("INVALID_TOPIC", "topic filter exceeds maximum length", "§4.7.1"))
  }

  const levels = filter.split("/")

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]

    if (level.includes(WILDCARD_MULTI)) {
      if (level !== WILDCARD_MULTI) {
        return err(
          decodeError("INVALID_TOPIC", "'#' wildcard must occupy entire level", "§4.7.1.2")
        )
      }
      if (i !== levels.length - 1) {
        return err(
          decodeError("INVALID_TOPIC", "'#' wildcard must be the last character", "§4.7.1.2")
        )
      }
    }

    if (level.includes(WILDCARD_SINGLE) && level !== WILDCARD_SINGLE) {
      return err(decodeError("INVALID_TOPIC", "'+' wildcard must occupy entire level", "§4.7.1.1"))
    }
  }

  return ok(filter)
}

// -----------------------------------------------------------------------------
// Topic Matching
// -----------------------------------------------------------------------------

/**
 * Matches a topic name against a topic filter.
 *
 * Supports MQTT wildcards:
 * - `+` matches exactly one level
 * - `#` matches zero or more levels (must be last)
 *
 * @param topicName - The topic name (from PUBLISH)
 * @param topicFilter - The topic filter (from SUBSCRIBE)
 * @returns true if the topic matches the filter
 *
 * @example
 * ```ts
 * topicMatches("sport/tennis/player1", "sport/tennis/+") // true
 * topicMatches("sport/tennis/player1", "sport/#") // true
 * topicMatches("sport/tennis", "sport/tennis/#") // true
 * topicMatches("sport", "sport/#") // true
 * ```
 *
 * @see MQTT 5.0 §4.7.2
 */
export function topicMatches(topicName: string, topicFilter: string): boolean {
  // $-prefixed topics don't match wildcards at root level
  // e.g., $SYS/broker/clients doesn't match +/broker/clients or #
  if (topicName.startsWith("$")) {
    if (topicFilter.startsWith(WILDCARD_SINGLE) || topicFilter.startsWith(WILDCARD_MULTI)) {
      return false
    }
  }

  const topicLevels = topicName.split("/")
  const filterLevels = topicFilter.split("/")

  for (let i = 0; i < filterLevels.length; i++) {
    const filterLevel = filterLevels[i]

    // Multi-level wildcard matches everything remaining
    if (filterLevel === WILDCARD_MULTI) {
      return true
    }

    // No more topic levels but filter has more (without #)
    if (i >= topicLevels.length) {
      return false
    }

    const topicLevel = topicLevels[i]

    // Single-level wildcard matches exactly one level
    if (filterLevel === WILDCARD_SINGLE) {
      continue
    }

    // Exact match required
    if (filterLevel !== topicLevel) {
      return false
    }
  }

  // Filter exhausted - topic must also be exhausted
  return topicLevels.length === filterLevels.length
}

// -----------------------------------------------------------------------------
// Shared Subscription
// -----------------------------------------------------------------------------

/**
 * Parsed shared subscription.
 */
export type SharedSubscription = {
  /** The share group name */
  readonly shareGroup: string
  /** The underlying topic filter (after $share/{group}/) */
  readonly topicFilter: string
}

/**
 * Checks if a topic filter is a shared subscription.
 *
 * Shared subscriptions have the format: `$share/{ShareName}/{filter}`
 *
 * @param filter - The topic filter to check
 * @returns true if this is a shared subscription
 *
 * @see MQTT 5.0 §4.8.2
 */
export function isSharedSubscription(filter: string): boolean {
  return filter.startsWith(SHARED_SUBSCRIPTION_PREFIX)
}

/**
 * Parses a shared subscription filter.
 *
 * Format: `$share/{ShareName}/{filter}`
 *
 * @param filter - The shared subscription filter to parse
 * @returns DecodeResult with parsed subscription or error
 *
 * @example
 * ```ts
 * parseSharedSubscription("$share/consumer1/sport/tennis/#")
 * // { ok: true, value: { shareGroup: "consumer1", topicFilter: "sport/tennis/#" } }
 * ```
 *
 * @see MQTT 5.0 §4.8.2
 */
export function parseSharedSubscription(filter: string): DecodeResult<SharedSubscription> {
  if (!filter.startsWith(SHARED_SUBSCRIPTION_PREFIX)) {
    return err(decodeError("INVALID_TOPIC", "not a shared subscription", "§4.8.2"))
  }

  const afterPrefix = filter.slice(SHARED_SUBSCRIPTION_PREFIX.length)

  // Find the next / which separates share name from topic filter
  const slashIndex = afterPrefix.indexOf("/")

  if (slashIndex === -1) {
    return err(decodeError("INVALID_TOPIC", "shared subscription missing topic filter", "§4.8.2"))
  }

  if (slashIndex === 0) {
    return err(decodeError("INVALID_TOPIC", "shared subscription group name is empty", "§4.8.2"))
  }

  const shareGroup = afterPrefix.slice(0, slashIndex)
  const topicFilter = afterPrefix.slice(slashIndex + 1)

  // Share group must not contain +, #, or /
  if (
    shareGroup.includes(WILDCARD_SINGLE) ||
    shareGroup.includes(WILDCARD_MULTI) ||
    shareGroup.includes("/")
  ) {
    return err(
      decodeError(
        "INVALID_TOPIC",
        "shared subscription group name contains invalid characters",
        "§4.8.2"
      )
    )
  }

  // Topic filter must be valid
  const filterResult = validateTopicFilter(topicFilter)
  if (!filterResult.ok) {
    return filterResult as DecodeResult<SharedSubscription>
  }

  return ok({ shareGroup, topicFilter })
}

// -----------------------------------------------------------------------------
// Topic Parsing
// -----------------------------------------------------------------------------

/**
 * Splits a topic into levels.
 *
 * @param topic - The topic name or filter
 * @returns Array of topic levels
 *
 * @example
 * ```ts
 * parseTopicLevels("sport/tennis/player1") // ["sport", "tennis", "player1"]
 * parseTopicLevels("sport/+/player1") // ["sport", "+", "player1"]
 * ```
 */
export function parseTopicLevels(topic: string): string[] {
  return topic.split("/")
}

/**
 * Joins topic levels into a topic string.
 *
 * @param levels - Array of topic levels
 * @returns The joined topic string
 */
export function joinTopicLevels(levels: string[]): string {
  return levels.join("/")
}
