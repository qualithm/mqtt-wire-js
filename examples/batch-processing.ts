/**
 * Stream framing example.
 *
 * Demonstrates processing chunked MQTT data through the stream framer.
 *
 * @example
 * ```bash
 * bun run examples/batch-processing.ts
 * ```
 */

/* eslint-disable no-console */

import {
  PACKET_TYPE_NAME,
  type PacketType,
  parsePacketFrame,
  StreamFramer
} from "@qualithm/mqtt-wire"

/**
 * Simulates receiving data in chunks from a network connection.
 */
function simulateChunkedReceive(fullData: Uint8Array, chunkSizes: number[]): Uint8Array[] {
  const chunks: Uint8Array[] = []
  let offset = 0

  for (const size of chunkSizes) {
    if (offset >= fullData.length) {
      break
    }
    const end = Math.min(offset + size, fullData.length)
    chunks.push(fullData.slice(offset, end))
    offset = end
  }

  return chunks
}

function main(): void {
  console.log("=== Stream Framing Examples ===\n")

  // Build some sample MQTT packets
  // PINGREQ (2 bytes): 0xC0 0x00
  // PINGRESP (2 bytes): 0xD0 0x00
  // Simulated PUBLISH (7 bytes): 0x30 0x05 + 5 payload bytes
  const packets = new Uint8Array([
    0xc0,
    0x00, // PINGREQ
    0xd0,
    0x00, // PINGRESP
    0x30,
    0x05,
    0x01,
    0x02,
    0x03,
    0x04,
    0x05 // PUBLISH with 5-byte payload
  ])

  // Example 1: Process complete data
  console.log("--- Example 1: Complete Data ---")
  const framer1 = new StreamFramer()
  framer1.push(packets)

  let packetCount = 0
  let result = framer1.read()
  while (result.status === "complete") {
    packetCount++
    const frame = parsePacketFrame(result.packetData)
    if (frame.ok) {
      const typeName = PACKET_TYPE_NAME[frame.value.packetType as PacketType]
      console.log(
        `  Packet ${String(packetCount)}: ${typeName} (${String(result.bytesConsumed)} bytes)`
      )
    }
    result = framer1.read()
  }
  if (result.status === "error") {
    console.log(`  Error: ${result.error.message}`)
  }
  console.log()

  // Example 2: Process chunked data (simulating network)
  console.log("--- Example 2: Chunked Data ---")
  const chunkSizes = [1, 2, 3, 1, 4] // Arbitrary chunk boundaries
  const chunks = simulateChunkedReceive(packets, chunkSizes)
  console.log(`  Receiving ${String(chunks.length)} chunks: [${chunkSizes.join(", ")}] bytes`)

  const framer2 = new StreamFramer()
  let totalPackets = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    console.log(
      `  Chunk ${String(i + 1)}: ${String(chunk.length)} bytes, buffered: ${String(framer2.bufferedLength)}`
    )
    framer2.push(chunk)

    let result = framer2.read()
    while (result.status === "complete") {
      totalPackets++
      const frame = parsePacketFrame(result.packetData)
      if (frame.ok) {
        const typeName = PACKET_TYPE_NAME[frame.value.packetType as PacketType]
        console.log(`    → Extracted: ${typeName}`)
      }
      result = framer2.read()
    }
    if (result.status === "error") {
      console.log(`    Error: ${result.error.message}`)
    }
  }
  console.log(`  Total packets extracted: ${String(totalPackets)}`)
  console.log()

  // Example 3: Packet size limit
  console.log("--- Example 3: Packet Size Limit ---")
  const smallFramer = new StreamFramer(5) // Max 5 bytes
  smallFramer.push(new Uint8Array([0x30, 0x10])) // Claims 16-byte payload

  const limitResult = smallFramer.read()
  if (limitResult.status === "error") {
    console.log(`  Rejected: ${limitResult.error.message}`)
  }

  console.log("\nExamples complete.")
}

main()
