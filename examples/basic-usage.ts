/**
 * Basic usage example.
 *
 * Demonstrates fundamental MQTT wire codec usage patterns.
 *
 * @example
 * ```bash
 * bun run examples/basic-usage.ts
 * ```
 */

/* eslint-disable no-console */

import {
  BinaryReader,
  BinaryWriter,
  decodeVariableByteInteger,
  encodeVariableByteIntegerToArray,
  PACKET_TYPE_NAME,
  PacketType
} from "@qualithm/mqtt-wire"

function main(): void {
  console.log("=== MQTT Wire Basic Usage ===\n")

  // Variable byte integer encoding
  console.log("--- Variable Byte Integer ---")
  const values = [0, 127, 128, 16383, 16384, 268_435_455]
  for (const value of values) {
    const encoded = encodeVariableByteIntegerToArray(value)
    const decoded = decodeVariableByteInteger(encoded, 0)
    console.log(
      `  ${String(value)} → [${Array.from(encoded)
        .map((b) => `0x${b.toString(16)}`)
        .join(", ")}]`
    )
    if (decoded.ok) {
      console.log(
        `    Decoded: ${String(decoded.value.value)} (${String(decoded.value.bytesRead)} bytes)`
      )
    }
  }

  // Packet type constants
  console.log("\n--- Packet Types ---")
  const packetTypes = [
    PacketType.CONNECT,
    PacketType.PUBLISH,
    PacketType.SUBSCRIBE,
    PacketType.PINGREQ
  ]
  for (const type of packetTypes) {
    console.log(`  Type ${String(type)}: ${PACKET_TYPE_NAME[type]}`)
  }

  // Binary writer/reader
  console.log("\n--- Binary Writer/Reader ---")
  const writer = new BinaryWriter()
  writer
    .writeUint8(0x10) // CONNECT packet type
    .writeVariableByteInteger(12) // Remaining length
    .writeMqttString("MQTT") // Protocol name
    .writeUint8(5) // Protocol version (5.0)
    .writeUint8(0x02) // Connect flags

  const packet = writer.toUint8Array()
  console.log(
    `  Packet bytes: [${Array.from(packet)
      .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
      .join(", ")}]`
  )

  const reader = new BinaryReader(packet)
  const header = reader.readUint8()
  const length = reader.readVariableByteInteger()
  const protocol = reader.readMqttString()

  if (header.ok && length.ok && protocol.ok) {
    console.log(`  Header: 0x${header.value.toString(16)}`)
    console.log(`  Remaining length: ${String(length.value)}`)
    console.log(`  Protocol: ${protocol.value}`)
  }

  console.log("\nDone.")
}

main()
