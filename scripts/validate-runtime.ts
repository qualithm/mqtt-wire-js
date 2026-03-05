#!/usr/bin/env bun
/**
 * Cross-runtime validation script.
 *
 * Tests that the library can be imported and used correctly across
 * different JavaScript runtimes (Bun, Node.js, Deno).
 *
 * Run with: bun run scripts/validate-runtime.ts
 */

import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ── Test Code ─────────────────────────────────────────────────────────

function getTestCode(importPath: string): string {
  return `
import {
  // Core types and utilities
  decodeError,
  err,
  ok,
  PROTOCOL_LEVEL,
  
  // Constants
  PacketType,
  PropertyId,
  PACKET_TYPE_NAME,
  MAX_PACKET_SIZE,
  
  // Codec utilities
  BinaryReader,
  BinaryWriter,
  StreamFramer,
  PacketSizeCalculator,
  encodeVariableByteInteger,
  decodeVariableByteInteger,
  
  // Packet codec
  encodePacket,
  decodePacket,
  
  // Topic utilities
  isValidTopicName,
  isValidTopicFilter,
  topicMatches,
  
  // State machine
  MqttWire,
  ProtocolError,
  StateError,
  PacketIdAllocator,
  QoSFlowTracker,
  TopicAliasManager,
} from "${importPath}";

// Verify exports exist
const checks = [
  // Types and utilities
  ["decodeError", typeof decodeError === "function"],
  ["err", typeof err === "function"],
  ["ok", typeof ok === "function"],
  ["PROTOCOL_LEVEL", typeof PROTOCOL_LEVEL === "object"],
  
  // Constants
  ["PacketType", typeof PacketType === "object"],
  ["PropertyId", typeof PropertyId === "object"],
  ["PACKET_TYPE_NAME", typeof PACKET_TYPE_NAME === "object"],
  ["MAX_PACKET_SIZE", typeof MAX_PACKET_SIZE === "number"],
  
  // Codec utilities
  ["BinaryReader", typeof BinaryReader === "function"],
  ["BinaryWriter", typeof BinaryWriter === "function"],
  ["StreamFramer", typeof StreamFramer === "function"],
  ["PacketSizeCalculator", typeof PacketSizeCalculator === "function"],
  ["encodeVariableByteInteger", typeof encodeVariableByteInteger === "function"],
  ["decodeVariableByteInteger", typeof decodeVariableByteInteger === "function"],
  
  // Packet codec
  ["encodePacket", typeof encodePacket === "function"],
  ["decodePacket", typeof decodePacket === "function"],
  
  // Topic utilities
  ["isValidTopicName", typeof isValidTopicName === "function"],
  ["isValidTopicFilter", typeof isValidTopicFilter === "function"],
  ["topicMatches", typeof topicMatches === "function"],
  
  // State machine
  ["MqttWire", typeof MqttWire === "function"],
  ["ProtocolError", typeof ProtocolError === "function"],
  ["StateError", typeof StateError === "function"],
  ["PacketIdAllocator", typeof PacketIdAllocator === "function"],
  ["QoSFlowTracker", typeof QoSFlowTracker === "function"],
  ["TopicAliasManager", typeof TopicAliasManager === "function"],
];

let passed = 0;
let failed = 0;

for (const [name, ok] of checks) {
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(\`FAIL: \${name} not exported correctly\`);
  }
}

// Test BinaryWriter/Reader round-trip
try {
  const writer = new BinaryWriter();
  writer.writeUint8(0x10);
  writer.writeVariableByteInteger(12);
  writer.writeMqttString("MQTT");
  const bytes = writer.toUint8Array();
  
  const reader = new BinaryReader(bytes);
  const byte1 = reader.readUint8();
  const varint = reader.readVariableByteInteger();
  const str = reader.readMqttString();
  
  if (byte1.ok && varint.ok && str.ok && str.value === "MQTT") {
    passed++;
  } else {
    throw new Error("BinaryWriter/Reader round-trip failed");
  }
} catch (error) {
  failed++;
  console.error("FAIL: BinaryWriter/Reader threw:", error);
}

// Test StreamFramer
try {
  const framer = new StreamFramer();
  // Build a minimal PINGREQ packet (0xC0 0x00)
  framer.push(new Uint8Array([0xC0, 0x00]));
  const result = framer.read();
  if (result.status === "complete") {
    passed++;
  } else {
    throw new Error("StreamFramer failed to frame PINGREQ");
  }
} catch (error) {
  failed++;
  console.error("FAIL: StreamFramer threw:", error);
}

// Test topic matching
try {
  if (
    topicMatches("sensors/temp", "sensors/#") &&
    topicMatches("sensors/1/data", "sensors/+/data") &&
    !topicMatches("other/topic", "sensors/temp")
  ) {
    passed++;
  } else {
    throw new Error("topicMatches returned incorrect results");
  }
} catch (error) {
  failed++;
  console.error("FAIL: topicMatches threw:", error);
}

// Test MqttWire creation
try {
  let sentData = null;
  const wire = new MqttWire({
    onSend: (data) => { sentData = data; },
    onConnect: (connect) => ({
      type: PacketType.CONNACK,
      sessionPresent: false,
      reasonCode: 0x00
    })
  });
  
  if (wire.connectionState === "awaiting-connect") {
    passed++;
  } else {
    throw new Error("MqttWire initial state incorrect");
  }
} catch (error) {
  failed++;
  console.error("FAIL: MqttWire threw:", error);
}

// Test error classes
try {
  const protoError = new ProtocolError("test error", 0x80);
  const stateError = new StateError("state error", "disconnected");
  
  if (protoError.reasonCode === 0x80 && stateError.state === "disconnected") {
    passed++;
  } else {
    throw new Error("Error classes have incorrect properties");
  }
} catch (error) {
  failed++;
  console.error("FAIL: Error classes threw:", error);
}

console.log(\`Passed: \${passed}, Failed: \${failed}\`);
process.exit(failed > 0 ? 1 : 0);
`.trim()
}

// ── Runtime Detection ─────────────────────────────────────────────────

type RuntimeInfo = {
  name: string
  command: string
  args: string[]
  available: boolean
  version?: string
}

async function checkRuntime(
  name: string,
  command: string,
  versionArg: string
): Promise<RuntimeInfo> {
  return new Promise((resolve) => {
    const proc = spawn(command, [versionArg], { stdio: ["ignore", "pipe", "ignore"] })
    let version = ""

    proc.stdout.on("data", (data: Buffer) => {
      version += data.toString()
    })

    proc.on("error", () => {
      resolve({ name, command, args: [], available: false })
    })

    proc.on("close", (code) => {
      resolve({
        name,
        command,
        args: [],
        available: code === 0,
        version: version.trim().split("\n")[0]
      })
    })
  })
}

// ── Test Runner ───────────────────────────────────────────────────────

async function runTest(
  runtime: RuntimeInfo,
  testFile: string,
  testDir: string,
  importMapPath: string
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    let args = [...runtime.args]
    // Add import map for Deno
    if (runtime.name === "Deno") {
      args = ["run", "--allow-read", "--allow-env", "--allow-net", `--import-map=${importMapPath}`]
    }
    args.push(testFile)

    const proc = spawn(runtime.command, args, { cwd: testDir, stdio: ["ignore", "pipe", "pipe"] })
    let output = ""

    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString()
    })
    proc.stderr.on("data", (data: Buffer) => {
      output += data.toString()
    })

    proc.on("error", (error) => {
      resolve({ success: false, output: error.message })
    })

    proc.on("close", (code) => {
      resolve({ success: code === 0, output: output.trim() })
    })
  })
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Cross-Runtime Validation")
  console.log("========================\n")

  // Check available runtimes
  const runtimes: RuntimeInfo[] = await Promise.all([
    checkRuntime("Bun", "bun", "--version").then((r) => ({ ...r, args: ["run"] })),
    checkRuntime("Node.js", "node", "--version").then((r) => ({
      ...r,
      args: ["--experimental-vm-modules"]
    })),
    checkRuntime("Deno", "deno", "--version").then((r) => ({
      ...r,
      args: ["run", "--allow-read", "--allow-env", "--allow-net", "--node-modules-dir=auto"]
    }))
  ])

  console.log("Available runtimes:")
  for (const runtime of runtimes) {
    const status = runtime.available ? `✓ ${runtime.version ?? "unknown"}` : "✗ not found"
    console.log(`  ${runtime.name}: ${status}`)
  }
  console.log()

  const available = runtimes.filter((r) => r.available)
  if (available.length === 0) {
    console.error("No runtimes available for testing")
    process.exit(1)
  }

  // Create temporary test directory
  const tmpDir = await mkdtemp(join(tmpdir(), "mqtt-wire-test-"))
  const distPath = join(process.cwd(), "dist", "index.js")

  try {
    // Write test file that imports directly from dist using absolute path
    const testFile = join(tmpDir, "test.mjs")
    await writeFile(testFile, getTestCode(distPath))

    // Create import map for Deno (no external dependencies needed)
    const importMapPath = join(tmpDir, "import_map.json")
    await writeFile(
      importMapPath,
      JSON.stringify({
        imports: {}
      })
    )

    // Run tests
    console.log("Running validation tests:")
    console.log("-".repeat(40))

    let passed = 0
    let failed = 0

    for (const runtime of available) {
      process.stdout.write(`${runtime.name}: `)
      const result = await runTest(runtime, testFile, tmpDir, importMapPath)

      if (result.success) {
        console.log("✓ PASS")
        passed++
      } else {
        console.log("✗ FAIL")
        console.log(`  Output: ${result.output}`)
        failed++
      }
    }

    console.log("-".repeat(40))
    console.log()
    console.log(`Results: ${String(passed)} passed, ${String(failed)} failed`)
    console.log()

    if (failed > 0) {
      process.exit(1)
    }
  } finally {
    // Cleanup
    await rm(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error("Validation failed:", error)
  process.exit(1)
})
