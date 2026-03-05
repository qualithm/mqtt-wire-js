/**
 * Core primitive types for MQTT protocol handling.
 *
 * @packageDocumentation
 */

// -----------------------------------------------------------------------------
// Protocol Version
// -----------------------------------------------------------------------------

/**
 * MQTT protocol versions supported by this library.
 *
 * - `3.1.1` — MQTT 3.1.1 (protocol level 4)
 * - `5.0` — MQTT 5.0 (protocol level 5)
 */
export type ProtocolVersion = "3.1.1" | "5.0"

/**
 * Protocol level byte values for CONNECT packet.
 *
 * @see MQTT 3.1.1 §3.1.2.2, MQTT 5.0 §3.1.2.2
 */
export const PROTOCOL_LEVEL = {
  /** MQTT 3.1.1 uses protocol level 4. */
  "3.1.1": 4,
  /** MQTT 5.0 uses protocol level 5. */
  "5.0": 5
} as const satisfies Record<ProtocolVersion, number>

// -----------------------------------------------------------------------------
// QoS Levels
// -----------------------------------------------------------------------------

/**
 * Quality of Service levels.
 *
 * - `0` — At most once delivery
 * - `1` — At least once delivery
 * - `2` — Exactly once delivery
 *
 * @see MQTT 5.0 §4.3
 */
export type QoS = 0 | 1 | 2

// -----------------------------------------------------------------------------
// Decode Result (Result Type Pattern)
// -----------------------------------------------------------------------------

/**
 * Successful decode result containing the decoded value.
 */
export type DecodeSuccess<T> = {
  /** Discriminator indicating success. */
  readonly ok: true
  /** The decoded value. */
  readonly value: T
}

/**
 * Failed decode result containing the error.
 */
export type DecodeFailure = {
  /** Discriminator indicating failure. */
  readonly ok: false
  /** The decode error with details. */
  readonly error: DecodeError
}

/**
 * Result type for decode operations.
 *
 * Uses discriminated union pattern to avoid exceptions in hot paths.
 * Check `ok` property to determine success/failure before accessing
 * `value` or `error`.
 *
 * @example
 * ```ts
 * const result = decodeVariableByteInteger(bytes, 0)
 * if (result.ok) {
 *   console.log(result.value)
 * } else {
 *   console.error(result.error.message)
 * }
 * ```
 */
export type DecodeResult<T> = DecodeSuccess<T> | DecodeFailure

// -----------------------------------------------------------------------------
// Decode Error
// -----------------------------------------------------------------------------

/**
 * Error codes for decode failures.
 *
 * Each code maps to a specific failure condition with a corresponding
 * MQTT spec section reference where applicable.
 */
export type DecodeErrorCode =
  | "INCOMPLETE" // Not enough bytes available
  | "MALFORMED_VARINT" // Variable byte integer exceeds 4 bytes (§2.2.3)
  | "MALFORMED_UTF8" // Invalid UTF-8 encoding (§1.5.4)
  | "MALFORMED_PACKET" // General packet structure error
  | "PACKET_TOO_LARGE" // Exceeds maximum packet size
  | "PROTOCOL_ERROR" // Protocol-level violation
  | "INVALID_PROPERTY_ID" // Unknown or invalid property ID (§2.2.2.2)
  | "INVALID_TOPIC" // Topic validation failure
  | "INVALID_CLIENT_ID" // Client identifier validation failure

/**
 * Decode error with contextual information.
 *
 * Includes error code, human-readable message, and optional spec reference.
 */
export type DecodeError = {
  /** Error classification code */
  readonly code: DecodeErrorCode
  /** Human-readable error message (lowercase, no trailing punctuation) */
  readonly message: string
  /** MQTT spec section reference (e.g., "§2.2.3") */
  readonly specRef?: string
  /** Byte offset where error occurred */
  readonly offset?: number
}

/**
 * Creates a successful decode result.
 */
export function ok<T>(value: T): DecodeSuccess<T> {
  return { ok: true, value }
}

/**
 * Creates a failed decode result.
 */
export function err(error: DecodeError): DecodeFailure {
  return { ok: false, error }
}

/**
 * Creates a decode error.
 */
export function decodeError(
  code: DecodeErrorCode,
  message: string,
  specRef?: string,
  offset?: number
): DecodeError {
  const error: DecodeError = { code, message }
  if (specRef !== undefined) {
    ;(error as { specRef: string }).specRef = specRef
  }
  if (offset !== undefined) {
    ;(error as { offset: number }).offset = offset
  }
  return error
}

// -----------------------------------------------------------------------------
// Reason Codes
// -----------------------------------------------------------------------------

/**
 * MQTT 5.0 reason codes used across multiple packet types.
 *
 * Reason codes indicate the result of an operation. Values 0x00-0x7F
 * indicate success or normal conditions; 0x80+ indicate errors.
 *
 * @see MQTT 5.0 §2.4
 */
export type ReasonCode =
  // Success codes (0x00-0x7F)
  | 0x00 // Success / Normal disconnection / Granted QoS 0
  | 0x01 // Granted QoS 1
  | 0x02 // Granted QoS 2
  | 0x04 // Disconnect with will message
  | 0x10 // No matching subscribers
  | 0x11 // No subscription existed
  | 0x18 // Continue authentication
  | 0x19 // Re-authenticate
  // Error codes (0x80+)
  | 0x80 // Unspecified error
  | 0x81 // Malformed packet
  | 0x82 // Protocol error
  | 0x83 // Implementation specific error
  | 0x84 // Unsupported protocol version
  | 0x85 // Client identifier not valid
  | 0x86 // Bad user name or password
  | 0x87 // Not authorised
  | 0x88 // Server unavailable
  | 0x89 // Server busy
  | 0x8a // Banned
  | 0x8b // Server shutting down
  | 0x8c // Bad authentication method
  | 0x8d // Keep alive timeout
  | 0x8e // Session taken over
  | 0x8f // Topic filter invalid
  | 0x90 // Topic name invalid
  | 0x91 // Packet identifier in use
  | 0x92 // Packet identifier not found
  | 0x93 // Receive maximum exceeded
  | 0x94 // Topic alias invalid
  | 0x95 // Packet too large
  | 0x96 // Message rate too high
  | 0x97 // Quota exceeded
  | 0x98 // Administrative action
  | 0x99 // Payload format invalid
  | 0x9a // Retain not supported
  | 0x9b // QoS not supported
  | 0x9c // Use another server
  | 0x9d // Server moved
  | 0x9e // Shared subscriptions not supported
  | 0x9f // Connection rate exceeded
  | 0xa0 // Maximum connect time
  | 0xa1 // Subscription identifiers not supported
  | 0xa2 // Wildcard subscriptions not supported

/**
 * Check if a reason code indicates success (0x00-0x7F).
 */
export function isSuccessReasonCode(code: ReasonCode): boolean {
  return code < 0x80
}

/**
 * Check if a reason code indicates an error (0x80+).
 */
export function isErrorReasonCode(code: ReasonCode): boolean {
  return code >= 0x80
}
