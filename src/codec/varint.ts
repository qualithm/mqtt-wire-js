/**
 * Variable byte integer encoding and decoding.
 *
 * MQTT uses a variable length encoding scheme for integers. The encoding
 * uses up to 4 bytes to represent values from 0 to 268,435,455.
 *
 * @see MQTT 5.0 §2.2.3
 * @packageDocumentation
 */

import { MAX_VARIABLE_BYTE_INTEGER, MAX_VARIABLE_BYTE_INTEGER_LENGTH } from "../constants.js"
import { decodeError, type DecodeResult, err, ok } from "../types.js"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Result of decoding a variable byte integer.
 */
export type VarintDecodeValue = {
  /** The decoded integer value */
  value: number
  /** Number of bytes consumed */
  bytesRead: number
}

// -----------------------------------------------------------------------------
// Encoding
// -----------------------------------------------------------------------------

/**
 * Calculates the number of bytes needed to encode a variable byte integer.
 *
 * @param value - The integer value to encode (0 to 268,435,455)
 * @returns Number of bytes needed (1-4)
 * @throws RangeError if value is out of range
 *
 * @example
 * ```ts
 * variableByteIntegerLength(0)       // 1
 * variableByteIntegerLength(127)     // 1
 * variableByteIntegerLength(128)     // 2
 * variableByteIntegerLength(16383)   // 2
 * variableByteIntegerLength(16384)   // 3
 * ```
 */
export function variableByteIntegerLength(value: number): number {
  if (value < 0 || value > MAX_VARIABLE_BYTE_INTEGER) {
    throw new RangeError(
      `variable byte integer out of range: ${String(value)} (max ${String(MAX_VARIABLE_BYTE_INTEGER)})`
    )
  }

  if (value < 128) {
    return 1
  }
  if (value < 16_384) {
    return 2
  }
  if (value < 2_097_152) {
    return 3
  }
  return 4
}

/**
 * Encodes a variable byte integer into a buffer at the specified offset.
 *
 * The encoding scheme uses the high bit of each byte as a continuation
 * flag. If the high bit is 1, there are more bytes to follow.
 *
 * @param value - The integer value to encode (0 to 268,435,455)
 * @param buffer - The buffer to write to
 * @param offset - The offset in the buffer to start writing
 * @returns Number of bytes written (1-4)
 * @throws RangeError if value is out of range or buffer is too small
 *
 * @see MQTT 5.0 §2.2.3
 *
 * @example
 * ```ts
 * const buffer = new Uint8Array(4)
 * encodeVariableByteInteger(321, buffer, 0)
 * // buffer is now [0xc1, 0x02, 0x00, 0x00]
 * ```
 */
export function encodeVariableByteInteger(
  value: number,
  buffer: Uint8Array,
  offset: number
): number {
  if (value < 0 || value > MAX_VARIABLE_BYTE_INTEGER) {
    throw new RangeError(
      `variable byte integer out of range: ${String(value)} (max ${String(MAX_VARIABLE_BYTE_INTEGER)})`
    )
  }

  let x = value
  let bytesWritten = 0

  do {
    let encodedByte = x & 0x7f
    x = x >> 7

    if (x > 0) {
      encodedByte |= 0x80 // Set continuation bit
    }

    if (offset + bytesWritten >= buffer.length) {
      throw new RangeError("buffer too small for variable byte integer encoding")
    }

    buffer[offset + bytesWritten] = encodedByte
    bytesWritten++
  } while (x > 0)

  return bytesWritten
}

/**
 * Creates a new Uint8Array containing the encoded variable byte integer.
 *
 * @param value - The integer value to encode (0 to 268,435,455)
 * @returns A new Uint8Array containing the encoded bytes
 * @throws RangeError if value is out of range
 *
 * @example
 * ```ts
 * encodeVariableByteIntegerToArray(321)  // Uint8Array([0xc1, 0x02])
 * ```
 */
export function encodeVariableByteIntegerToArray(value: number): Uint8Array {
  const length = variableByteIntegerLength(value)
  const buffer = new Uint8Array(length)
  encodeVariableByteInteger(value, buffer, 0)
  return buffer
}

// -----------------------------------------------------------------------------
// Decoding
// -----------------------------------------------------------------------------

/**
 * Decodes a variable byte integer from a buffer.
 *
 * Returns a result type to avoid exceptions in hot paths. The result
 * includes both the decoded value and the number of bytes consumed.
 *
 * @param buffer - The buffer to read from
 * @param offset - The offset in the buffer to start reading
 * @returns DecodeResult containing value and bytesRead, or error
 *
 * @see MQTT 5.0 §2.2.3
 *
 * @example
 * ```ts
 * const buffer = new Uint8Array([0xc1, 0x02])
 * const result = decodeVariableByteInteger(buffer, 0)
 * if (result.ok) {
 *   console.log(result.value.value)      // 321
 *   console.log(result.value.bytesRead)  // 2
 * }
 * ```
 */
export function decodeVariableByteInteger(
  buffer: Uint8Array,
  offset: number
): DecodeResult<VarintDecodeValue> {
  let value = 0
  let multiplier = 1
  let bytesRead = 0

  while (bytesRead < MAX_VARIABLE_BYTE_INTEGER_LENGTH) {
    if (offset + bytesRead >= buffer.length) {
      return err(decodeError("INCOMPLETE", "not enough bytes for variable byte integer", "§2.2.3"))
    }

    const encodedByte = buffer[offset + bytesRead]
    bytesRead++

    value += (encodedByte & 0x7f) * multiplier

    if ((encodedByte & 0x80) === 0) {
      // No continuation bit, we're done
      return ok({ value, bytesRead })
    }

    multiplier *= 128
  }

  // If we get here, we've read 4 bytes and all had continuation bits
  return err(
    decodeError(
      "MALFORMED_VARINT",
      "variable byte integer exceeds maximum length",
      "§2.2.3",
      offset
    )
  )
}

/**
 * Checks if a buffer contains a complete variable byte integer at the given offset.
 *
 * This is useful for determining if enough data has been buffered before
 * attempting to decode.
 *
 * @param buffer - The buffer to check
 * @param offset - The offset to start checking from
 * @returns true if a complete variable byte integer is available
 */
export function hasCompleteVariableByteInteger(buffer: Uint8Array, offset: number): boolean {
  for (let i = 0; i < MAX_VARIABLE_BYTE_INTEGER_LENGTH; i++) {
    if (offset + i >= buffer.length) {
      return false
    }

    if ((buffer[offset + i] & 0x80) === 0) {
      return true
    }
  }

  // 4 bytes with all continuation bits is malformed, but "complete" for parsing
  return true
}
