/**
 * Packet ID allocator with wraparound and recycling.
 *
 * Manages packet identifiers for QoS > 0 PUBLISH, SUBSCRIBE, and UNSUBSCRIBE
 * operations. IDs range from 1 to 65535 (0 is reserved).
 *
 * @see MQTT 5.0 §2.2.1
 * @packageDocumentation
 */

import { MAX_PACKET_ID, MIN_PACKET_ID } from "../constants.js"

/**
 * Error thrown when no packet IDs are available.
 */
export class PacketIdExhaustedError extends Error {
  constructor() {
    super("no packet IDs available")
    this.name = "PacketIdExhaustedError"
  }
}

/**
 * Allocates and recycles packet identifiers.
 *
 * Uses sequential allocation with wraparound at 65535. Freed IDs are
 * immediately available for reuse. When all IDs are exhausted, throws
 * PacketIdExhaustedError (should not happen with proper flow control).
 *
 * @example
 * ```ts
 * const allocator = new PacketIdAllocator()
 * const id1 = allocator.allocate() // 1
 * const id2 = allocator.allocate() // 2
 * allocator.release(id1)           // 1 is now available
 * const id3 = allocator.allocate() // 3 (sequential continues)
 * ```
 */
export class PacketIdAllocator {
  private nextId: number = MIN_PACKET_ID
  private readonly inUse = new Set<number>()

  /**
   * Allocate the next available packet ID.
   *
   * @returns The allocated packet ID (1-65535)
   * @throws PacketIdExhaustedError if all IDs are in use
   */
  allocate(): number {
    // Check if all IDs are exhausted
    if (this.inUse.size >= MAX_PACKET_ID) {
      throw new PacketIdExhaustedError()
    }

    // Find next available ID with wraparound
    let attempts = 0
    while (this.inUse.has(this.nextId)) {
      this.nextId = this.nextId >= MAX_PACKET_ID ? MIN_PACKET_ID : this.nextId + 1
      attempts++
      // Safety check (should never reach this with size check above)
      if (attempts > MAX_PACKET_ID) {
        throw new PacketIdExhaustedError()
      }
    }

    const id = this.nextId
    this.inUse.add(id)
    this.nextId = this.nextId >= MAX_PACKET_ID ? MIN_PACKET_ID : this.nextId + 1

    return id
  }

  /**
   * Release a packet ID for reuse.
   *
   * @param id - The packet ID to release
   */
  release(id: number): void {
    this.inUse.delete(id)
  }

  /**
   * Check if a packet ID is currently in use.
   *
   * @param id - The packet ID to check
   * @returns true if the ID is in use
   */
  isInUse(id: number): boolean {
    return this.inUse.has(id)
  }

  /**
   * Get the count of currently in-use packet IDs.
   */
  get count(): number {
    return this.inUse.size
  }

  /**
   * Get all in-use packet IDs (for session persistence).
   */
  getInUse(): ReadonlySet<number> {
    return this.inUse
  }

  /**
   * Restore in-use IDs (for session restoration).
   *
   * @param ids - Set of packet IDs to mark as in-use
   */
  restore(ids: Iterable<number>): void {
    for (const id of ids) {
      if (id >= MIN_PACKET_ID && id <= MAX_PACKET_ID) {
        this.inUse.add(id)
      }
    }
  }

  /**
   * Reset the allocator, releasing all IDs.
   */
  reset(): void {
    this.inUse.clear()
    this.nextId = MIN_PACKET_ID
  }
}
