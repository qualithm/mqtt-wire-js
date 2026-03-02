/**
 * Binary reader with bounds checking for MQTT packet parsing.
 *
 * Provides a cursor-based API for reading binary data with automatic
 * bounds checking and result types for error handling.
 *
 * @packageDocumentation
 */

import { decodeError, type DecodeResult, err, ok } from "../types.js"
import { decodeMqttBinary, decodeMqttString, decodeUtf8, validateMqttUtf8 } from "./utf8.js"
import { decodeVariableByteInteger } from "./varint.js"

/**
 * A binary reader that provides cursor-based reading with bounds checking.
 *
 * The reader maintains a position cursor and provides methods for reading
 * various data types. All read operations return DecodeResult to handle
 * errors without exceptions.
 *
 * @example
 * ```ts
 * const reader = new BinaryReader(buffer)
 *
 * const byte = reader.readUint8()
 * if (!byte.ok) return byte
 *
 * const str = reader.readMqttString()
 * if (!str.ok) return str
 *
 * console.log(byte.value, str.value)
 * ```
 */
export class BinaryReader {
  private readonly buffer: Uint8Array
  private position: number
  private readonly end: number

  /**
   * Creates a new binary reader.
   *
   * @param buffer - The buffer to read from
   * @param offset - Starting offset (default: 0)
   * @param length - Length to read (default: rest of buffer)
   */
  constructor(buffer: Uint8Array, offset = 0, length?: number) {
    this.buffer = buffer
    this.position = offset
    this.end = length !== undefined ? offset + length : buffer.length
  }

  /**
   * Gets the current read position.
   */
  get offset(): number {
    return this.position
  }

  /**
   * Gets the number of bytes remaining to read.
   */
  get remaining(): number {
    return this.end - this.position
  }

  /**
   * Checks if there are enough bytes remaining to read.
   */
  hasRemaining(count: number): boolean {
    return this.remaining >= count
  }

  /**
   * Checks if the reader has reached the end.
   */
  get isAtEnd(): boolean {
    return this.position >= this.end
  }

  /**
   * Reads a single unsigned 8-bit integer.
   */
  readUint8(): DecodeResult<number> {
    if (!this.hasRemaining(1)) {
      return err(decodeError("INCOMPLETE", "not enough bytes for uint8", undefined, this.position))
    }

    const value = this.buffer[this.position]
    this.position++
    return ok(value)
  }

  /**
   * Reads an unsigned 16-bit integer (big-endian).
   */
  readUint16(): DecodeResult<number> {
    if (!this.hasRemaining(2)) {
      return err(decodeError("INCOMPLETE", "not enough bytes for uint16", undefined, this.position))
    }

    const value = (this.buffer[this.position] << 8) | this.buffer[this.position + 1]
    this.position += 2
    return ok(value)
  }

  /**
   * Reads an unsigned 32-bit integer (big-endian).
   */
  readUint32(): DecodeResult<number> {
    if (!this.hasRemaining(4)) {
      return err(decodeError("INCOMPLETE", "not enough bytes for uint32", undefined, this.position))
    }

    const value =
      ((this.buffer[this.position] << 24) |
        (this.buffer[this.position + 1] << 16) |
        (this.buffer[this.position + 2] << 8) |
        this.buffer[this.position + 3]) >>>
      0

    this.position += 4
    return ok(value)
  }

  /**
   * Reads a variable byte integer.
   *
   * @see MQTT 5.0 §2.2.3
   */
  readVariableByteInteger(): DecodeResult<number> {
    const result = decodeVariableByteInteger(this.buffer, this.position)
    if (!result.ok) {
      return result
    }

    this.position += result.value.bytesRead
    return ok(result.value.value)
  }

  /**
   * Reads a fixed number of bytes.
   *
   * @param count - Number of bytes to read
   * @returns A new Uint8Array containing the bytes (copy)
   */
  readBytes(count: number): DecodeResult<Uint8Array> {
    if (!this.hasRemaining(count)) {
      return err(
        decodeError(
          "INCOMPLETE",
          `not enough bytes: need ${String(count)}`,
          undefined,
          this.position
        )
      )
    }

    // Return a copy to avoid aliasing issues
    const bytes = this.buffer.slice(this.position, this.position + count)
    this.position += count
    return ok(bytes)
  }

  /**
   * Reads remaining bytes.
   *
   * @returns A new Uint8Array containing all remaining bytes (copy)
   */
  readRemainingBytes(): Uint8Array {
    const bytes = this.buffer.slice(this.position, this.end)
    this.position = this.end
    return bytes
  }

  /**
   * Reads a view of bytes without copying.
   *
   * Use this for performance when you know the bytes won't be mutated
   * and don't need to outlive the buffer.
   *
   * @param count - Number of bytes to read
   * @returns A view into the original buffer (no copy)
   */
  readBytesView(count: number): DecodeResult<Uint8Array> {
    if (!this.hasRemaining(count)) {
      return err(
        decodeError(
          "INCOMPLETE",
          `not enough bytes: need ${String(count)}`,
          undefined,
          this.position
        )
      )
    }

    const view = this.buffer.subarray(this.position, this.position + count)
    this.position += count
    return ok(view)
  }

  /**
   * Reads a UTF-8 string with MQTT length prefix.
   *
   * @see MQTT 5.0 §1.5.4
   */
  readMqttString(): DecodeResult<string> {
    const result = decodeMqttString(this.buffer, this.position)
    if (!result.ok) {
      return result
    }

    this.position += result.value.bytesRead
    return ok(result.value.value)
  }

  /**
   * Reads a raw UTF-8 string of specified length.
   *
   * Does not validate MQTT string restrictions.
   */
  readUtf8(length: number): DecodeResult<string> {
    const bytes = this.readBytesView(length)
    if (!bytes.ok) {
      return bytes
    }

    return decodeUtf8(bytes.value)
  }

  /**
   * Reads a raw UTF-8 string of specified length with MQTT validation.
   */
  readMqttUtf8(length: number): DecodeResult<string> {
    const bytes = this.readBytesView(length)
    if (!bytes.ok) {
      return bytes
    }

    return validateMqttUtf8(bytes.value)
  }

  /**
   * Reads binary data with MQTT length prefix.
   */
  readMqttBinary(): DecodeResult<Uint8Array> {
    const result = decodeMqttBinary(this.buffer, this.position)
    if (!result.ok) {
      return result
    }

    this.position += result.value.bytesRead
    return ok(result.value.value)
  }

  /**
   * Skips a number of bytes.
   */
  skip(count: number): DecodeResult<void> {
    if (!this.hasRemaining(count)) {
      return err(
        decodeError("INCOMPLETE", `cannot skip ${String(count)} bytes`, undefined, this.position)
      )
    }

    this.position += count
    return ok(undefined)
  }

  /**
   * Peeks at the next byte without consuming it.
   */
  peek(): DecodeResult<number> {
    if (!this.hasRemaining(1)) {
      return err(decodeError("INCOMPLETE", "no bytes to peek", undefined, this.position))
    }

    return ok(this.buffer[this.position])
  }

  /**
   * Creates a sub-reader for a portion of the remaining data.
   *
   * Useful for reading length-prefixed sections where you want to
   * constrain the reader to that section.
   *
   * @param length - Length of the sub-section
   */
  subReader(length: number): DecodeResult<BinaryReader> {
    if (!this.hasRemaining(length)) {
      return err(
        decodeError(
          "INCOMPLETE",
          `not enough bytes for sub-reader: need ${String(length)}`,
          undefined,
          this.position
        )
      )
    }

    const reader = new BinaryReader(this.buffer, this.position, length)
    this.position += length
    return ok(reader)
  }
}
