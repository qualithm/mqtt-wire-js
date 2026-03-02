#!/usr/bin/env bun
/**
 * Demo script showcasing the mqtt-wire package.
 *
 * Run with: bun run demo
 */

import {
  BinaryWriter,
  PACKET_TYPE_NAME,
  PacketType,
  parsePacketFrame,
  StreamFramer
} from "../src/index.js"

console.log("mqtt-wire Demo")
console.log("==============\n")

// Build a simple CONNECT packet fixed header
const writer = new BinaryWriter()
writer
  .writeUint8((PacketType.CONNECT << 4) | 0x00) // CONNECT, flags=0
  .writeVariableByteInteger(10) // Remaining length
  .writeMqttString("MQTT") // Protocol name
  .writeUint8(5) // Protocol level (5.0)
  .writeUint8(0x02) // Connect flags (clean start)
  .writeUint16(60) // Keep alive (60 seconds)

const packet = writer.toUint8Array()
console.log("Built CONNECT packet:")
console.log(
  `  Bytes: [${Array.from(packet)
    .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
    .join(", ")}]`
)
console.log(`  Length: ${String(packet.length)} bytes`)

// Parse the frame
const frame = parsePacketFrame(packet)
if (frame.ok) {
  console.log(
    `  Type: ${PACKET_TYPE_NAME[frame.value.packetType as (typeof PacketType)[keyof typeof PacketType]]}`
  )
  console.log(`  Remaining length: ${String(frame.value.remainingLength)}`)
}

// Demo stream framer
console.log("\nStream framing demo:")
const framer = new StreamFramer()
framer.push(packet)

const result = framer.read()
if (result.status === "complete") {
  console.log(`  Extracted ${String(result.bytesConsumed)}-byte packet`)
}

console.log("\nDemo complete.")
