/**
 * Error handling example.
 *
 * Demonstrates the Result type pattern for error handling without exceptions.
 *
 * @example
 * ```bash
 * bun run examples/error-handling.ts
 * ```
 */

/* eslint-disable no-console */

import {
  BinaryReader,
  type DecodeResult,
  decodeVariableByteInteger,
  encodeVariableByteIntegerToArray,
  REASON_CODE_NAME,
  type ReasonCode,
  validateMqttUtf8
} from "../src/index"

/**
 * Demonstrates handling DecodeResult without exceptions.
 */
function demonstrateResultPattern<T>(operation: string, result: DecodeResult<T>): void {
  if (result.ok) {
    console.log(`  ✓ ${operation}: ${JSON.stringify(result.value)}`)
  } else {
    console.log(`  ✗ ${operation}: [${result.error.code}] ${result.error.message}`)
    if (result.error.specRef !== undefined) {
      console.log(`    Spec reference: ${result.error.specRef}`)
    }
  }
}

function main(): void {
  console.log("=== Error Handling Examples ===\n")

  // Example 1: Successful decode
  console.log("--- Example 1: Successful Decode ---")
  const validVarint = encodeVariableByteIntegerToArray(16384)
  demonstrateResultPattern("Decode 16384", decodeVariableByteInteger(validVarint, 0))
  console.log()

  // Example 2: Incomplete data
  console.log("--- Example 2: Incomplete Data ---")
  const incomplete = new Uint8Array([0x80]) // Continuation bit, no more data
  demonstrateResultPattern("Decode incomplete varint", decodeVariableByteInteger(incomplete, 0))
  console.log()

  // Example 3: Malformed variable byte integer
  console.log("--- Example 3: Malformed Varint ---")
  const malformed = new Uint8Array([0x80, 0x80, 0x80, 0x80]) // 4 continuation bits
  demonstrateResultPattern("Decode malformed varint", decodeVariableByteInteger(malformed, 0))
  console.log()

  // Example 4: Invalid UTF-8
  console.log("--- Example 4: Invalid UTF-8 ---")
  const invalidUtf8 = new Uint8Array([0x80, 0x81, 0x82]) // Invalid continuation bytes
  demonstrateResultPattern("Validate invalid UTF-8", validateMqttUtf8(invalidUtf8))
  console.log()

  // Example 5: MQTT-prohibited characters
  console.log("--- Example 5: Prohibited Characters ---")
  const withNull = new TextEncoder().encode("hello\x00world")
  demonstrateResultPattern("Validate string with null", validateMqttUtf8(withNull))
  console.log()

  // Example 6: Chaining results with early exit
  console.log("--- Example 6: Chaining Results ---")
  const packet = new Uint8Array([0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x05])
  const reader = new BinaryReader(packet)

  // Read protocol name length and string
  const protocol = reader.readMqttString()
  if (!protocol.ok) {
    console.log(`  Failed to read protocol: ${protocol.error.message}`)
  } else {
    console.log(`  Protocol: ${protocol.value}`)

    const version = reader.readUint8()
    if (!version.ok) {
      console.log(`  Failed to read version: ${version.error.message}`)
    } else {
      console.log(`  Version: ${String(version.value)}`)
    }
  }
  console.log()

  // Example 7: Reason codes
  console.log("--- Example 7: Reason Codes ---")
  const reasonCodes: ReasonCode[] = [0x00, 0x80, 0x87, 0x91]
  for (const code of reasonCodes) {
    const name = REASON_CODE_NAME[code]
    const category = code < 0x80 ? "Success" : "Error"
    console.log(`  0x${code.toString(16).padStart(2, "0")}: ${name} (${category})`)
  }

  console.log("\nExamples complete.")
}

main()
