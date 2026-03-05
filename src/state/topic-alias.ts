/**
 * Topic alias manager for MQTT 5.0.
 *
 * Manages bidirectional topic alias mappings. Topic aliases allow publishers
 * to reduce packet sizes by substituting topic names with numeric aliases.
 *
 * @see MQTT 5.0 §3.3.2.3.4
 * @packageDocumentation
 */

/**
 * Error thrown when topic alias is invalid.
 */
export class TopicAliasError extends Error {
  /** The invalid topic alias value. */
  readonly alias: number

  constructor(alias: number, message: string) {
    super(message)
    this.name = "TopicAliasError"
    this.alias = alias
  }
}

/**
 * Manages topic aliases for one direction (either client→server or server→client).
 *
 * Each endpoint maintains its own alias mappings. The maximum alias value
 * is negotiated during connection.
 *
 * @example
 * ```ts
 * // Server advertises topicAliasMaximum: 10 in CONNACK
 * const outbound = new TopicAliasMap(10)
 *
 * // Client can assign aliases 1-10 when publishing
 * outbound.set(1, "sensor/temperature")
 * const topic = outbound.get(1) // "sensor/temperature"
 * ```
 */
export class TopicAliasMap {
  private readonly aliases = new Map<number, string>()
  private readonly maximum: number

  /**
   * Create a topic alias map.
   *
   * @param maximum - Maximum alias value (0 = aliases disabled)
   */
  constructor(maximum: number) {
    this.maximum = Math.max(0, Math.floor(maximum))
  }

  /**
   * Set a topic alias mapping.
   *
   * @param alias - Alias value (1 to maximum)
   * @param topic - Topic name to associate
   * @throws TopicAliasError if alias is out of range or aliases disabled
   */
  set(alias: number, topic: string): void {
    if (this.maximum === 0) {
      throw new TopicAliasError(alias, "topic aliases are disabled")
    }
    if (alias < 1 || alias > this.maximum) {
      throw new TopicAliasError(
        alias,
        `topic alias ${String(alias)} out of range [1, ${String(this.maximum)}]`
      )
    }
    this.aliases.set(alias, topic)
  }

  /**
   * Get the topic for an alias.
   *
   * @param alias - Alias value to look up
   * @returns Topic name or undefined if not set
   */
  get(alias: number): string | undefined {
    return this.aliases.get(alias)
  }

  /**
   * Check if an alias is valid (within range).
   *
   * @param alias - Alias value to check
   * @returns true if alias is valid
   */
  isValid(alias: number): boolean {
    return this.maximum > 0 && alias >= 1 && alias <= this.maximum
  }

  /**
   * Check if an alias has a mapping.
   *
   * @param alias - Alias value to check
   * @returns true if alias is mapped
   */
  has(alias: number): boolean {
    return this.aliases.has(alias)
  }

  /**
   * Delete a topic alias mapping.
   *
   * @param alias - Alias value to delete
   * @returns true if mapping existed
   */
  delete(alias: number): boolean {
    return this.aliases.delete(alias)
  }

  /**
   * Clear all alias mappings.
   */
  clear(): void {
    this.aliases.clear()
  }

  /**
   * Get the maximum alias value.
   */
  getMaximum(): number {
    return this.maximum
  }

  /**
   * Get the count of active aliases.
   */
  get size(): number {
    return this.aliases.size
  }
}

/**
 * Result of getting or assigning an outbound topic alias.
 */
export type OutboundAliasResult = {
  /** The topic alias (1 to maximum). */
  alias: number
  /** True if topic must be sent with the alias (first use). */
  sendTopic: boolean
}

/**
 * Manages topic aliases for both directions (outbound and inbound).
 *
 * - Outbound aliases: Client assigns aliases when publishing to server
 * - Inbound aliases: Server assigns aliases when publishing to client
 *
 * Maximum values are negotiated during connection:
 * - Client's topicAliasMaximum in CONNECT → server's outbound limit
 * - Server's topicAliasMaximum in CONNACK → client's outbound limit
 */
export class TopicAliasManager {
  /** Aliases for client → server (limited by CONNACK topicAliasMaximum) */
  readonly outbound: TopicAliasMap
  /** Aliases for server → client (limited by CONNECT topicAliasMaximum) */
  readonly inbound: TopicAliasMap

  private readonly topicToOutboundAlias = new Map<string, number>()
  private nextOutboundAlias = 1

  /**
   * Create a topic alias manager.
   *
   * @param outboundMaximum - Maximum outbound alias (from CONNACK)
   * @param inboundMaximum - Maximum inbound alias (from our CONNECT)
   */
  constructor(outboundMaximum = 0, inboundMaximum = 0) {
    this.outbound = new TopicAliasMap(outboundMaximum)
    this.inbound = new TopicAliasMap(inboundMaximum)
  }

  /**
   * Resolve an inbound PUBLISH's topic using aliases.
   *
   * According to MQTT 5.0 §3.3.2.3.4:
   * - If topic is non-empty and alias present: set alias → topic
   * - If topic is empty and alias present: lookup alias
   * - If topic is empty and no alias: protocol error
   *
   * @param topic - Topic from PUBLISH packet (may be empty)
   * @param alias - Topic alias from PUBLISH properties (optional)
   * @returns Resolved topic name
   * @throws TopicAliasError if resolution fails
   */
  resolveInbound(topic: string, alias?: number): string {
    if (alias !== undefined) {
      if (topic.length > 0) {
        // Topic present with alias: set the mapping
        this.inbound.set(alias, topic)
        return topic
      }
      // Empty topic with alias: lookup
      const resolved = this.inbound.get(alias)
      if (resolved === undefined) {
        throw new TopicAliasError(alias, `unknown topic alias ${String(alias)}`)
      }
      return resolved
    }

    // No alias
    if (topic.length === 0) {
      // This is a protocol error - should have been validated earlier
      throw new TopicAliasError(0, "empty topic without alias")
    }
    return topic
  }

  /**
   * Get or assign an outbound alias for a topic.
   *
   * Returns existing alias if topic is already mapped, or assigns a new
   * alias if slots are available. Returns undefined if aliases are disabled
   * or all slots are used.
   *
   * @param topic - Topic to get/assign alias for
   * @returns Object with alias and whether topic should be sent
   */
  getOrAssignOutbound(topic: string): OutboundAliasResult | undefined {
    const maximum = this.outbound.getMaximum()
    if (maximum === 0) {
      return undefined
    }

    // Check if topic already has an alias
    const existing = this.topicToOutboundAlias.get(topic)
    if (existing !== undefined) {
      // Alias exists, don't need to send topic
      return { alias: existing, sendTopic: false }
    }

    // Check if we have available slots
    if (this.nextOutboundAlias > maximum) {
      // All slots used, could implement LRU eviction here
      return undefined
    }

    // Assign new alias
    const alias = this.nextOutboundAlias++
    this.outbound.set(alias, topic)
    this.topicToOutboundAlias.set(topic, alias)

    // First use: must send topic with alias
    return { alias, sendTopic: true }
  }

  /**
   * Clear all mappings (on disconnect).
   */
  clear(): void {
    this.outbound.clear()
    this.inbound.clear()
    this.topicToOutboundAlias.clear()
    this.nextOutboundAlias = 1
  }
}
