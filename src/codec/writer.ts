/**
 * Binary writer for MQTT packet encoding.
 *
 * Provides a fluent API for building binary data with automatic
 * buffer management.
 *
 * @packageDocumentation
 */

import { encodeMqttBinary, encodeMqttString, encodeUtf8, utf8ByteLength } from "./utf8.js"
import { encodeVariableByteInteger, variableByteIntegerLength } from "./varint.js"

/**
 * Default initial buffer size.
 */
const DEFAULT_INITIAL_SIZE = 256

/**
 * A binary writer with automatic buffer growth.
 *
 * The writer maintains a position cursor and automatically grows the
 * internal buffer as needed. Use {@link toUint8Array} to get the final
 * bytes.
 *
 * @example
 * ```ts
 * const writer = new BinaryWriter()
 * writer
 *   .writeUint8(0x10)
 *   .writeVariableByteInteger(12)
 *   .writeMqttString("MQTT")
 *
 * const bytes = writer.toUint8Array()
 * ```
 */
export class BinaryWriter {
  private buffer: Uint8Array
  private position: number

  /**
   * Creates a new binary writer.
   *
   * @param initialSize - Initial buffer size (default: 256)
   */
  constructor(initialSize = DEFAULT_INITIAL_SIZE) {
    this.buffer = new Uint8Array(initialSize)
    this.position = 0
  }

  /**
   * Gets the current write position (number of bytes written).
   */
  get length(): number {
    return this.position
  }

  /**
   * Ensures the buffer has capacity for additional bytes.
   */
  private ensureCapacity(additionalBytes: number): void {
    const required = this.position + additionalBytes
    if (required <= this.buffer.length) {
      return
    }

    // Grow by doubling, or to required size if larger
    let newSize = this.buffer.length * 2
    while (newSize < required) {
      newSize *= 2
    }

    const newBuffer = new Uint8Array(newSize)
    newBuffer.set(this.buffer)
    this.buffer = newBuffer
  }

  /**
   * Writes a single unsigned 8-bit integer.
   */
  writeUint8(value: number): this {
    this.ensureCapacity(1)
    this.buffer[this.position++] = value & 0xff
    return this
  }

  /**
   * Writes an unsigned 16-bit integer (big-endian).
   */
  writeUint16(value: number): this {
    this.ensureCapacity(2)
    this.buffer[this.position++] = (value >> 8) & 0xff
    this.buffer[this.position++] = value & 0xff
    return this
  }

  /**
   * Writes an unsigned 32-bit integer (big-endian).
   */
  writeUint32(value: number): this {
    this.ensureCapacity(4)
    this.buffer[this.position++] = (value >> 24) & 0xff
    this.buffer[this.position++] = (value >> 16) & 0xff
    this.buffer[this.position++] = (value >> 8) & 0xff
    this.buffer[this.position++] = value & 0xff
    return this
  }

  /**
   * Writes a variable byte integer.
   *
   * @see MQTT 5.0 §2.2.3
   */
  writeVariableByteInteger(value: number): this {
    const length = variableByteIntegerLength(value)
    this.ensureCapacity(length)
    encodeVariableByteInteger(value, this.buffer, this.position)
    this.position += length
    return this
  }

  /**
   * Writes raw bytes.
   */
  writeBytes(bytes: Uint8Array): this {
    this.ensureCapacity(bytes.length)
    this.buffer.set(bytes, this.position)
    this.position += bytes.length
    return this
  }

  /**
   * Writes a UTF-8 string with MQTT length prefix.
   *
   * @see MQTT 5.0 §1.5.4
   */
  writeMqttString(str: string): this {
    const encoded = encodeMqttString(str)
    return this.writeBytes(encoded)
  }

  /**
   * Writes a raw UTF-8 string without length prefix.
   */
  writeUtf8(str: string): this {
    const encoded = encodeUtf8(str)
    return this.writeBytes(encoded)
  }

  /**
   * Writes binary data with MQTT length prefix.
   */
  writeMqttBinary(data: Uint8Array): this {
    const encoded = encodeMqttBinary(data)
    return this.writeBytes(encoded)
  }

  /**
   * Reserves space for bytes to be written later.
   *
   * Returns the offset where the reserved space starts.
   *
   * @param count - Number of bytes to reserve
   * @returns The offset where reserved space starts
   */
  reserve(count: number): number {
    this.ensureCapacity(count)
    const offset = this.position
    this.position += count
    return offset
  }

  /**
   * Writes bytes at a specific offset (for filling reserved space).
   *
   * Does not advance the write position.
   *
   * @param offset - The offset to write at
   * @param bytes - The bytes to write
   */
  writeAt(offset: number, bytes: Uint8Array): void {
    if (offset + bytes.length > this.position) {
      throw new RangeError("writeAt extends beyond written data")
    }
    this.buffer.set(bytes, offset)
  }

  /**
   * Writes a single byte at a specific offset.
   *
   * @param offset - The offset to write at
   * @param value - The byte value to write
   */
  writeUint8At(offset: number, value: number): void {
    if (offset >= this.position) {
      throw new RangeError("writeUint8At extends beyond written data")
    }
    this.buffer[offset] = value & 0xff
  }

  /**
   * Gets the final bytes as a new Uint8Array.
   *
   * Returns a trimmed copy of the internal buffer.
   */
  toUint8Array(): Uint8Array {
    return this.buffer.slice(0, this.position)
  }

  /**
   * Gets a view of the written data.
   *
   * Returns a view into the internal buffer (no copy).
   * The view is only valid until the next write operation.
   */
  toUint8ArrayView(): Uint8Array {
    return this.buffer.subarray(0, this.position)
  }

  /**
   * Resets the writer for reuse.
   */
  reset(): void {
    this.position = 0
  }
}

/**
 * Calculates the total byte length for an MQTT packet.
 *
 * This is useful for pre-calculating buffer sizes.
 */
export class PacketSizeCalculator {
  private size = 0

  /**
   * Gets the current calculated size.
   */
  get length(): number {
    return this.size
  }

  /**
   * Adds bytes for a uint8.
   */
  addUint8(): this {
    this.size += 1
    return this
  }

  /**
   * Adds bytes for a uint16.
   */
  addUint16(): this {
    this.size += 2
    return this
  }

  /**
   * Adds bytes for a uint32.
   */
  addUint32(): this {
    this.size += 4
    return this
  }

  /**
   * Adds bytes for a variable byte integer.
   */
  addVariableByteInteger(value: number): this {
    this.size += variableByteIntegerLength(value)
    return this
  }

  /**
   * Adds bytes for raw bytes.
   */
  addBytes(length: number): this {
    this.size += length
    return this
  }

  /**
   * Adds bytes for an MQTT string (2-byte length prefix + UTF-8 content).
   */
  addMqttString(str: string): this {
    this.size += 2 + utf8ByteLength(str)
    return this
  }

  /**
   * Adds bytes for MQTT binary data (2-byte length prefix + content).
   */
  addMqttBinary(length: number): this {
    this.size += 2 + length
    return this
  }

  /**
   * Resets the calculator.
   */
  reset(): void {
    this.size = 0
  }
}
