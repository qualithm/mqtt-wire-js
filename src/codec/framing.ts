/**
 * Stream framing for MQTT packet reassembly.
 *
 * Handles accumulation of bytes from a transport stream and extraction
 * of complete MQTT packets. Supports arbitrary chunk boundaries.
 *
 * @packageDocumentation
 */

import { MAX_PACKET_SIZE } from "../constants.js"
import { decodeError, type DecodeResult, err, ok } from "../types.js"
import { decodeVariableByteInteger, hasCompleteVariableByteInteger } from "./varint.js"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Result of attempting to read a packet frame from the buffer.
 */
export type FrameResult =
  | { status: "complete"; packetData: Uint8Array; bytesConsumed: number }
  | { status: "incomplete" }
  | { status: "error"; error: ReturnType<typeof decodeError> }

/**
 * Packet frame information extracted from the fixed header.
 */
export type PacketFrame = {
  /** Packet type (1-15) from fixed header */
  packetType: number
  /** Flags from fixed header (lower 4 bits) */
  flags: number
  /** Remaining length from fixed header */
  remainingLength: number
  /** Total header size (1 byte + variable length integer) */
  headerSize: number
  /** Total packet size (header + remaining length) */
  totalSize: number
}

// -----------------------------------------------------------------------------
// Frame Parsing
// -----------------------------------------------------------------------------

/**
 * Attempts to read a packet frame from a buffer.
 *
 * Returns frame information if a complete packet is available,
 * or indicates if more data is needed or an error occurred.
 *
 * @param buffer - The buffer to read from
 * @param offset - Starting offset in the buffer
 * @param maxPacketSize - Maximum allowed packet size (default: spec max)
 * @returns Frame result indicating complete, incomplete, or error
 */
export function readPacketFrame(
  buffer: Uint8Array,
  offset: number,
  maxPacketSize = MAX_PACKET_SIZE
): FrameResult {
  // Need at least 2 bytes (fixed header byte + at least 1 remaining length byte)
  if (offset >= buffer.length) {
    return { status: "incomplete" }
  }

  // Check if we have a complete variable byte integer for remaining length
  if (!hasCompleteVariableByteInteger(buffer, offset + 1)) {
    return { status: "incomplete" }
  }

  // Parse fixed header byte
  const firstByte = buffer[offset]
  const packetType = (firstByte >> 4) & 0x0f

  // Validate packet type
  if (packetType < 1 || packetType > 15) {
    return {
      status: "error",
      error: decodeError(
        "MALFORMED_PACKET",
        `invalid packet type: ${String(packetType)}`,
        "§2.1.2",
        offset
      )
    }
  }

  // Parse remaining length
  const remainingLengthResult = decodeVariableByteInteger(buffer, offset + 1)
  if (!remainingLengthResult.ok) {
    return {
      status: "error",
      error: remainingLengthResult.error
    }
  }

  const { value: remainingLength, bytesRead: remainingLengthSize } = remainingLengthResult.value
  const headerSize = 1 + remainingLengthSize
  const totalSize = headerSize + remainingLength

  // Check packet size limit
  if (totalSize > maxPacketSize) {
    return {
      status: "error",
      error: decodeError(
        "PACKET_TOO_LARGE",
        `packet size ${String(totalSize)} exceeds maximum ${String(maxPacketSize)}`,
        "§3.1.2.11.4",
        offset
      )
    }
  }

  // Check if we have the complete packet
  if (offset + totalSize > buffer.length) {
    return { status: "incomplete" }
  }

  // Extract the complete packet data
  const packetData = buffer.subarray(offset, offset + totalSize)

  return {
    status: "complete",
    packetData,
    bytesConsumed: totalSize
  }
}

/**
 * Parses packet frame information from a complete packet.
 *
 * Unlike {@link readPacketFrame}, this assumes the packet is complete
 * and returns structured frame information.
 *
 * @param buffer - Buffer containing a complete packet
 * @param offset - Starting offset
 * @returns Decoded frame information or error
 */
export function parsePacketFrame(buffer: Uint8Array, offset = 0): DecodeResult<PacketFrame> {
  if (offset >= buffer.length) {
    return err(decodeError("INCOMPLETE", "no bytes for packet frame"))
  }

  const firstByte = buffer[offset]
  const packetType = (firstByte >> 4) & 0x0f
  const flags = firstByte & 0x0f

  if (packetType < 1 || packetType > 15) {
    return err(
      decodeError(
        "MALFORMED_PACKET",
        `invalid packet type: ${String(packetType)}`,
        "§2.1.2",
        offset
      )
    )
  }

  const remainingLengthResult = decodeVariableByteInteger(buffer, offset + 1)
  if (!remainingLengthResult.ok) {
    return remainingLengthResult
  }

  const { value: remainingLength, bytesRead: remainingLengthSize } = remainingLengthResult.value
  const headerSize = 1 + remainingLengthSize
  const totalSize = headerSize + remainingLength

  return ok({
    packetType,
    flags,
    remainingLength,
    headerSize,
    totalSize
  })
}

// -----------------------------------------------------------------------------
// Stream Buffer
// -----------------------------------------------------------------------------

/**
 * A buffer that accumulates chunks and extracts complete packets.
 *
 * This class handles the complexity of MQTT framing over a byte stream:
 * - Accumulates incoming chunks
 * - Extracts complete packets
 * - Manages partial packet state
 *
 * @example
 * ```ts
 * const framer = new StreamFramer()
 *
 * // Receive chunks from transport
 * for (const chunk of chunks) {
 *   framer.push(chunk)
 *
 *   // Extract all complete packets
 *   while (true) {
 *     const result = framer.read()
 *     if (result.status === 'incomplete') break
 *     if (result.status === 'error') throw new Error(result.error.message)
 *
 *     handlePacket(result.packetData)
 *   }
 * }
 * ```
 */
export class StreamFramer {
  private chunks: Uint8Array[] = []
  private totalLength = 0
  private buffer: Uint8Array | null = null
  private bufferOffset = 0
  private readonly maxPacketSize: number

  /**
   * Creates a new stream framer.
   *
   * @param maxPacketSize - Maximum allowed packet size
   */
  constructor(maxPacketSize = MAX_PACKET_SIZE) {
    this.maxPacketSize = maxPacketSize
  }

  /**
   * Gets the number of buffered bytes.
   */
  get bufferedLength(): number {
    if (this.buffer !== null) {
      return this.buffer.length - this.bufferOffset
    }
    return this.totalLength
  }

  /**
   * Pushes a chunk of data into the buffer.
   *
   * @param chunk - The data chunk to add
   */
  push(chunk: Uint8Array): void {
    if (chunk.length === 0) {
      return
    }

    // If we have an existing buffer with unconsumed data, move it back to chunks
    if (this.buffer !== null && this.bufferOffset < this.buffer.length) {
      this.chunks.push(this.buffer.subarray(this.bufferOffset))
      this.totalLength = this.buffer.length - this.bufferOffset
    }

    this.chunks.push(chunk)
    this.totalLength += chunk.length
    this.buffer = null
    this.bufferOffset = 0
  }

  /**
   * Attempts to read a complete packet from the buffer.
   *
   * If a complete packet is available, it is removed from the buffer
   * and returned. If not enough data is available, returns incomplete.
   * If the data is malformed, returns an error.
   *
   * @returns Frame result
   */
  read(): FrameResult {
    this.consolidate()

    if (this.buffer === null || this.bufferOffset >= this.buffer.length) {
      return { status: "incomplete" }
    }

    const result = readPacketFrame(this.buffer, this.bufferOffset, this.maxPacketSize)

    if (result.status === "complete") {
      // Copy the packet data (since we'll modify bufferOffset)
      const packetData = this.buffer.slice(
        this.bufferOffset,
        this.bufferOffset + result.bytesConsumed
      )
      this.bufferOffset += result.bytesConsumed
      this.compact()

      return {
        status: "complete",
        packetData,
        bytesConsumed: result.bytesConsumed
      }
    }

    return result
  }

  /**
   * Consolidates all chunks into a single buffer.
   */
  private consolidate(): void {
    if (this.buffer !== null) {
      return // Already consolidated
    }

    if (this.chunks.length === 0) {
      return
    }

    if (this.chunks.length === 1) {
      this.buffer = this.chunks[0]
      this.chunks = []
      this.totalLength = 0
      this.bufferOffset = 0
      return
    }

    // Merge all chunks
    const merged = new Uint8Array(this.totalLength)
    let offset = 0
    for (const chunk of this.chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    this.buffer = merged
    this.chunks = []
    this.totalLength = 0
    this.bufferOffset = 0
  }

  /**
   * Compacts the buffer by removing consumed data.
   *
   * Only compacts when a significant portion has been consumed.
   */
  private compact(): void {
    if (this.buffer === null) {
      return
    }

    const remaining = this.buffer.length - this.bufferOffset

    // Compact if we've consumed more than half the buffer
    if (this.bufferOffset > this.buffer.length / 2 && remaining > 0) {
      this.buffer = this.buffer.slice(this.bufferOffset)
      this.bufferOffset = 0
    } else if (remaining === 0) {
      this.buffer = null
      this.bufferOffset = 0
    }
  }

  /**
   * Clears all buffered data.
   */
  clear(): void {
    this.chunks = []
    this.totalLength = 0
    this.buffer = null
    this.bufferOffset = 0
  }
}
