/**
 * UTF-8 string encoding, decoding, and validation.
 *
 * MQTT uses UTF-8 encoded strings with specific restrictions:
 * - No null characters (U+0000)
 * - No characters between U+0001 and U+001F (control characters)
 * - No characters between U+007F and U+009F (control characters)
 * - Must not include lone surrogates (U+D800 to U+DFFF)
 *
 * @see MQTT 5.0 §1.5.4
 * @packageDocumentation
 */

import { decodeError, type DecodeResult, err, ok } from "../types.js"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Result of decoding an MQTT string.
 */
export type MqttStringDecodeResult = {
  /** The decoded string value. */
  value: string
  /** Number of bytes consumed from the buffer. */
  bytesRead: number
}

/**
 * Result of decoding MQTT binary data.
 */
export type MqttBinaryDecodeResult = {
  /** The decoded binary data. */
  value: Uint8Array
  /** Number of bytes consumed from the buffer. */
  bytesRead: number
}

// -----------------------------------------------------------------------------
// Text Encoder/Decoder
// -----------------------------------------------------------------------------

// Use global TextEncoder/TextDecoder for performance
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder("utf-8", { fatal: true })

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/**
 * Validates that a string is valid for MQTT UTF-8 encoding.
 *
 * MQTT places restrictions on UTF-8 strings beyond standard UTF-8:
 * - No null characters (U+0000)
 * - No control characters U+0001 to U+001F
 * - No control characters U+007F to U+009F
 *
 * @param str - The string to validate
 * @returns true if the string is valid for MQTT
 *
 * @see MQTT 5.0 §1.5.4
 */
export function isValidMqttString(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)

    // Null character
    if (code === 0x0000) {
      return false
    }

    // Control characters U+0001 to U+001F
    if (code >= 0x0001 && code <= 0x001f) {
      return false
    }

    // Control characters U+007F to U+009F
    if (code >= 0x007f && code <= 0x009f) {
      return false
    }
  }

  return true
}

/**
 * Validates UTF-8 bytes for MQTT compliance.
 *
 * Checks that the bytes:
 * 1. Are valid UTF-8
 * 2. Don't contain MQTT-prohibited characters
 *
 * @param bytes - The UTF-8 bytes to validate
 * @returns DecodeResult with the decoded string or error
 *
 * @see MQTT 5.0 §1.5.4
 */
export function validateMqttUtf8(bytes: Uint8Array): DecodeResult<string> {
  let decoded: string
  try {
    decoded = textDecoder.decode(bytes)
  } catch {
    return err(decodeError("MALFORMED_UTF8", "invalid utf-8 encoding", "§1.5.4"))
  }

  if (!isValidMqttString(decoded)) {
    return err(
      decodeError("MALFORMED_UTF8", "string contains mqtt-prohibited characters", "§1.5.4")
    )
  }

  return ok(decoded)
}

// -----------------------------------------------------------------------------
// Encoding
// -----------------------------------------------------------------------------

/**
 * Encodes a string to UTF-8 bytes.
 *
 * Does not validate MQTT restrictions; use {@link isValidMqttString} first
 * if validation is needed.
 *
 * @param str - The string to encode
 * @returns UTF-8 encoded bytes
 */
export function encodeUtf8(str: string): Uint8Array {
  return textEncoder.encode(str)
}

/**
 * Calculates the byte length of a string when UTF-8 encoded.
 *
 * This is more efficient than encoding when you only need the length.
 *
 * @param str - The string to measure
 * @returns The byte length when UTF-8 encoded
 */
export function utf8ByteLength(str: string): number {
  let length = 0

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)

    if (code < 0x80) {
      length += 1
    } else if (code < 0x800) {
      length += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate - check for low surrogate
      if (i + 1 < str.length) {
        const nextCode = str.charCodeAt(i + 1)
        if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
          // Valid surrogate pair = 4 bytes
          length += 4
          i++ // Skip the low surrogate
          continue
        }
      }
      // Lone high surrogate - will be encoded as replacement character (3 bytes)
      length += 3
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Lone low surrogate - will be encoded as replacement character (3 bytes)
      length += 3
    } else {
      length += 3
    }
  }

  return length
}

// -----------------------------------------------------------------------------
// Decoding
// -----------------------------------------------------------------------------

/**
 * Decodes UTF-8 bytes to a string.
 *
 * Does not validate MQTT restrictions; use {@link validateMqttUtf8} if
 * validation is needed.
 *
 * @param bytes - The UTF-8 bytes to decode
 * @returns DecodeResult with the decoded string or error
 */
export function decodeUtf8(bytes: Uint8Array): DecodeResult<string> {
  try {
    return ok(textDecoder.decode(bytes))
  } catch {
    return err(decodeError("MALFORMED_UTF8", "invalid utf-8 encoding", "§1.5.4"))
  }
}

/**
 * Decodes a UTF-8 string with MQTT length prefix.
 *
 * MQTT strings are prefixed with a 2-byte big-endian length.
 *
 * @param buffer - The buffer containing the length-prefixed string
 * @param offset - The offset to start reading from
 * @returns DecodeResult with decoded string and bytes read, or error
 *
 * @see MQTT 5.0 §1.5.4
 */
export function decodeMqttString(
  buffer: Uint8Array,
  offset: number
): DecodeResult<MqttStringDecodeResult> {
  // Need at least 2 bytes for the length prefix
  if (offset + 2 > buffer.length) {
    return err(decodeError("INCOMPLETE", "not enough bytes for string length", "§1.5.4"))
  }

  // Read 2-byte big-endian length
  const length = (buffer[offset] << 8) | buffer[offset + 1]

  // Check if we have enough bytes for the string content
  if (offset + 2 + length > buffer.length) {
    return err(decodeError("INCOMPLETE", "not enough bytes for string content", "§1.5.4"))
  }

  // Extract and validate the UTF-8 bytes
  const stringBytes = buffer.subarray(offset + 2, offset + 2 + length)
  const validateResult = validateMqttUtf8(stringBytes)

  if (!validateResult.ok) {
    return validateResult
  }

  return ok({
    value: validateResult.value,
    bytesRead: 2 + length
  })
}

/**
 * Encodes a string with MQTT length prefix.
 *
 * MQTT strings are prefixed with a 2-byte big-endian length.
 * Maximum string length is 65,535 bytes.
 *
 * @param str - The string to encode
 * @returns The length-prefixed UTF-8 bytes
 * @throws RangeError if the encoded string exceeds 65,535 bytes
 *
 * @see MQTT 5.0 §1.5.4
 */
export function encodeMqttString(str: string): Uint8Array {
  const encoded = encodeUtf8(str)

  if (encoded.length > 65_535) {
    throw new RangeError(`mqtt string too long: ${String(encoded.length)} bytes (max 65535)`)
  }

  const result = new Uint8Array(2 + encoded.length)
  result[0] = (encoded.length >> 8) & 0xff
  result[1] = encoded.length & 0xff
  result.set(encoded, 2)

  return result
}

/**
 * Decodes binary data with MQTT length prefix.
 *
 * Binary data in MQTT is prefixed with a 2-byte big-endian length,
 * similar to strings but without UTF-8 validation.
 *
 * @param buffer - The buffer containing the length-prefixed binary data
 * @param offset - The offset to start reading from
 * @returns DecodeResult with decoded bytes and bytes read, or error
 */
export function decodeMqttBinary(
  buffer: Uint8Array,
  offset: number
): DecodeResult<MqttBinaryDecodeResult> {
  // Need at least 2 bytes for the length prefix
  if (offset + 2 > buffer.length) {
    return err(decodeError("INCOMPLETE", "not enough bytes for binary length"))
  }

  // Read 2-byte big-endian length
  const length = (buffer[offset] << 8) | buffer[offset + 1]

  // Check if we have enough bytes for the content
  if (offset + 2 + length > buffer.length) {
    return err(decodeError("INCOMPLETE", "not enough bytes for binary content"))
  }

  // Extract the binary data (copy to avoid aliasing issues)
  const data = buffer.slice(offset + 2, offset + 2 + length)

  return ok({
    value: data,
    bytesRead: 2 + length
  })
}

/**
 * Encodes binary data with MQTT length prefix.
 *
 * @param data - The binary data to encode
 * @returns The length-prefixed binary data
 * @throws RangeError if the data exceeds 65,535 bytes
 */
export function encodeMqttBinary(data: Uint8Array): Uint8Array {
  if (data.length > 65_535) {
    throw new RangeError(`mqtt binary too long: ${String(data.length)} bytes (max 65535)`)
  }

  const result = new Uint8Array(2 + data.length)
  result[0] = (data.length >> 8) & 0xff
  result[1] = data.length & 0xff
  result.set(data, 2)

  return result
}
