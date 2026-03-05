/**
 * MQTT Wire Codec Benchmarks.
 *
 * Run with: bun run bench
 *
 * Example with configuration:
 *   WARMUP_ITERATIONS=20 BENCH_ITERATIONS=1000 bun run bench
 */

/* eslint-disable no-console */

import {
  type ConnectPacket,
  decodePacket,
  decodeVariableByteInteger,
  encodePacket,
  encodeVariableByteInteger,
  isValidMqttString,
  type PublishPacket,
  StreamFramer,
  type SubscribePacket,
  topicMatches
} from "../src/index.js"

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const config = {
  warmupIterations: parseInt(process.env.WARMUP_ITERATIONS ?? "15", 10),
  benchmarkIterations: parseInt(process.env.BENCH_ITERATIONS ?? "100000", 10)
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type BenchmarkResult = {
  name: string
  iterations: number
  totalMs: number
  avgMs: number
  minMs: number
  maxMs: number
  stdDev: number
  cv: number // coefficient of variation (%)
  opsPerSec: number
}

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

const CONNECT_PACKET: ConnectPacket = {
  type: 1, // PacketType.CONNECT
  protocolVersion: "5.0",
  clientId: "benchmark-client-12345",
  cleanStart: true,
  keepAlive: 60,
  username: "testuser",
  password: new TextEncoder().encode("testpassword")
}

const PUBLISH_PACKET_SMALL: PublishPacket = {
  type: 3, // PacketType.PUBLISH
  topic: "sensors/temperature/living-room",
  payload: new TextEncoder().encode('{"temp":21.5,"unit":"C"}'),
  qos: 1,
  retain: false,
  dup: false,
  packetId: 1234
}

const PUBLISH_PACKET_LARGE: PublishPacket = {
  type: 3, // PacketType.PUBLISH
  topic: "data/bulk/upload",
  payload: new Uint8Array(16384).fill(0x42), // 16KB payload
  qos: 0,
  retain: false,
  dup: false
}

const SUBSCRIBE_PACKET: SubscribePacket = {
  type: 8, // PacketType.SUBSCRIBE
  packetId: 5678,
  subscriptions: [
    { topicFilter: "sensors/+/temperature", options: { qos: 1 } },
    { topicFilter: "alerts/#", options: { qos: 2 } },
    { topicFilter: "home/+/+/status", options: { qos: 0 } }
  ]
}

// Pre-encoded packets for decode benchmarks
const ENCODED_CONNECT = encodePacket(CONNECT_PACKET, "5.0")
const ENCODED_PUBLISH_SMALL = encodePacket(PUBLISH_PACKET_SMALL, "5.0")
const ENCODED_PUBLISH_LARGE = encodePacket(PUBLISH_PACKET_LARGE, "5.0")
const ENCODED_SUBSCRIBE = encodePacket(SUBSCRIBE_PACKET, "5.0")

// Topic matching test cases
const TOPIC_TESTS = [
  { topic: "sensors/temperature/kitchen", filter: "sensors/temperature/kitchen" }, // exact
  { topic: "sensors/temperature/kitchen", filter: "sensors/+/kitchen" }, // single wildcard
  { topic: "sensors/temperature/kitchen", filter: "sensors/#" }, // multi wildcard
  { topic: "home/floor1/room2/light/status", filter: "home/+/+/+/status" } // multiple +
]

// UTF-8 test strings
const VALID_UTF8_SHORT = "hello world"
const VALID_UTF8_LONG = "A".repeat(1000)
const VALID_UTF8_UNICODE = "Hello 世界 🌍 مرحبا"

// Variable byte integer test values
const VARINT_VALUES = [0, 127, 128, 16383, 16384, 2097151, 2097152, 268435455]

// -----------------------------------------------------------------------------
// Stats Calculation
// -----------------------------------------------------------------------------

function calculateStats(times: number[]): {
  avg: number
  min: number
  max: number
  stdDev: number
  cv: number
} {
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const min = Math.min(...times)
  const max = Math.max(...times)
  const variance = times.reduce((sum, t) => sum + (t - avg) ** 2, 0) / times.length
  const stdDev = Math.sqrt(variance)
  const cv = avg > 0 ? (stdDev / avg) * 100 : 0

  return { avg, min, max, stdDev, cv }
}

// -----------------------------------------------------------------------------
// Benchmark Runner
// -----------------------------------------------------------------------------

function runBenchmark(
  name: string,
  fn: () => void,
  iterations: number,
  warmupIterations: number
): BenchmarkResult {
  // Warmup phase
  for (let i = 0; i < warmupIterations; i++) {
    fn()
  }

  // Execute benchmark in batches for timing
  const batchSize = Math.max(1, Math.floor(iterations / 100))
  const batchTimes: number[] = []

  let remaining = iterations
  while (remaining > 0) {
    const batch = Math.min(batchSize, remaining)
    const start = performance.now()
    for (let i = 0; i < batch; i++) {
      fn()
    }
    const end = performance.now()
    batchTimes.push((end - start) / batch)
    remaining -= batch
  }

  const stats = calculateStats(batchTimes)
  const totalMs = batchTimes.reduce((a, b) => a + b, 0) * batchSize
  const opsPerSec = stats.avg > 0 ? 1000 / stats.avg : 0

  return {
    name,
    iterations,
    totalMs,
    avgMs: stats.avg,
    minMs: stats.min,
    maxMs: stats.max,
    stdDev: stats.stdDev,
    cv: stats.cv,
    opsPerSec
  }
}

function formatResult(result: BenchmarkResult): void {
  console.log(`${result.name}:`)
  console.log(`  Iterations: ${result.iterations.toLocaleString()}`)
  console.log(`  Total time: ${result.totalMs.toFixed(2)}ms`)
  console.log(`  Per call:   ${(result.avgMs * 1000).toFixed(3)}μs`)
  console.log(
    `  Ops/sec:    ${result.opsPerSec.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  )
  console.log(`  Min:        ${(result.minMs * 1000).toFixed(3)}μs`)
  console.log(`  Max:        ${(result.maxMs * 1000).toFixed(3)}μs`)
  console.log(`  Std Dev:    ${(result.stdDev * 1000).toFixed(3)}μs`)
  console.log(`  CV:         ${result.cv.toFixed(2)}%`)
  console.log()
}

function formatSummary(results: BenchmarkResult[]): void {
  console.log("=== Summary ===")
  console.log(
    "Benchmark".padEnd(35) +
      "Avg (μs)".padStart(12) +
      "Ops/sec".padStart(14) +
      "CV (%)".padStart(10)
  )
  console.log("-".repeat(71))
  for (const r of results) {
    console.log(
      r.name.padEnd(35) +
        (r.avgMs * 1000).toFixed(3).padStart(12) +
        r.opsPerSec.toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(14) +
        r.cv.toFixed(2).padStart(10)
    )
  }
}

// -----------------------------------------------------------------------------
// Benchmark Suites
// -----------------------------------------------------------------------------

function benchmarkVarint(): BenchmarkResult[] {
  console.log("=== Variable Byte Integer ===\n")
  const results: BenchmarkResult[] = []
  const buffer = new Uint8Array(4)

  // Encode benchmarks
  for (const value of VARINT_VALUES) {
    const result = runBenchmark(
      `varint encode (${String(value)})`,
      () => encodeVariableByteInteger(value, buffer, 0),
      config.benchmarkIterations,
      config.warmupIterations
    )
    results.push(result)
    formatResult(result)
  }

  // Decode benchmarks - encode first then decode
  for (const value of VARINT_VALUES) {
    encodeVariableByteInteger(value, buffer, 0)
    const result = runBenchmark(
      `varint decode (${String(value)})`,
      () => decodeVariableByteInteger(buffer, 0),
      config.benchmarkIterations,
      config.warmupIterations
    )
    results.push(result)
    formatResult(result)
  }

  return results
}

function benchmarkPacketEncode(): BenchmarkResult[] {
  console.log("=== Packet Encoding ===\n")
  const results: BenchmarkResult[] = []

  const encodeBenchmarks = [
    { name: "encode CONNECT", packet: CONNECT_PACKET },
    { name: "encode PUBLISH (small)", packet: PUBLISH_PACKET_SMALL },
    { name: "encode PUBLISH (16KB)", packet: PUBLISH_PACKET_LARGE },
    { name: "encode SUBSCRIBE (3 filters)", packet: SUBSCRIBE_PACKET }
  ]

  for (const { name, packet } of encodeBenchmarks) {
    const result = runBenchmark(
      name,
      () => encodePacket(packet, "5.0"),
      config.benchmarkIterations,
      config.warmupIterations
    )
    results.push(result)
    formatResult(result)
  }

  return results
}

function benchmarkPacketDecode(): BenchmarkResult[] {
  console.log("=== Packet Decoding ===\n")
  const results: BenchmarkResult[] = []

  const decodeBenchmarks = [
    { name: "decode CONNECT", data: ENCODED_CONNECT },
    { name: "decode PUBLISH (small)", data: ENCODED_PUBLISH_SMALL },
    { name: "decode PUBLISH (16KB)", data: ENCODED_PUBLISH_LARGE },
    { name: "decode SUBSCRIBE (3 filters)", data: ENCODED_SUBSCRIBE }
  ]

  for (const { name, data } of decodeBenchmarks) {
    const result = runBenchmark(
      name,
      () => decodePacket(data, "5.0"),
      config.benchmarkIterations,
      config.warmupIterations
    )
    results.push(result)
    formatResult(result)
  }

  return results
}

function benchmarkTopicMatching(): BenchmarkResult[] {
  console.log("=== Topic Matching ===\n")
  const results: BenchmarkResult[] = []

  const descriptions = [
    "exact match",
    "single wildcard (+)",
    "multi wildcard (#)",
    "multiple wildcards"
  ]

  for (let i = 0; i < TOPIC_TESTS.length; i++) {
    const { topic, filter } = TOPIC_TESTS[i]
    const result = runBenchmark(
      `topic match (${descriptions[i]})`,
      () => topicMatches(topic, filter),
      config.benchmarkIterations,
      config.warmupIterations
    )
    results.push(result)
    formatResult(result)
  }

  return results
}

function benchmarkUtf8Validation(): BenchmarkResult[] {
  console.log("=== UTF-8 Validation ===\n")
  const results: BenchmarkResult[] = []

  const validationBenchmarks = [
    { name: "UTF-8 validate (short)", str: VALID_UTF8_SHORT },
    { name: "UTF-8 validate (1KB)", str: VALID_UTF8_LONG },
    { name: "UTF-8 validate (unicode)", str: VALID_UTF8_UNICODE }
  ]

  for (const { name, str } of validationBenchmarks) {
    const result = runBenchmark(
      name,
      () => isValidMqttString(str),
      config.benchmarkIterations,
      config.warmupIterations
    )
    results.push(result)
    formatResult(result)
  }

  return results
}

function benchmarkStreamFraming(): BenchmarkResult[] {
  console.log("=== Stream Framing ===\n")
  const results: BenchmarkResult[] = []

  // Benchmark receiving complete packets
  const completeResult = runBenchmark(
    "framer (complete packet)",
    () => {
      const framer = new StreamFramer()
      framer.push(ENCODED_PUBLISH_SMALL)
      framer.read()
    },
    config.benchmarkIterations,
    config.warmupIterations
  )
  results.push(completeResult)
  formatResult(completeResult)

  // Benchmark receiving chunked packets (simulate TCP fragmentation)
  const chunks = [
    ENCODED_PUBLISH_SMALL.slice(0, 5),
    ENCODED_PUBLISH_SMALL.slice(5, 20),
    ENCODED_PUBLISH_SMALL.slice(20)
  ]

  const chunkedResult = runBenchmark(
    "framer (3 chunks)",
    () => {
      const framer = new StreamFramer()
      for (const chunk of chunks) {
        framer.push(chunk)
      }
      framer.read()
    },
    config.benchmarkIterations,
    config.warmupIterations
  )
  results.push(chunkedResult)
  formatResult(chunkedResult)

  return results
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function main(): void {
  console.log("=== MQTT Wire Codec Benchmarks ===\n")
  console.log(`Warmup iterations: ${String(config.warmupIterations)}`)
  console.log(`Benchmark iterations: ${config.benchmarkIterations.toLocaleString()}\n`)

  const allResults: BenchmarkResult[] = []

  // Run all benchmark suites
  allResults.push(...benchmarkVarint())
  allResults.push(...benchmarkPacketEncode())
  allResults.push(...benchmarkPacketDecode())
  allResults.push(...benchmarkTopicMatching())
  allResults.push(...benchmarkUtf8Validation())
  allResults.push(...benchmarkStreamFraming())

  // Print summary of key benchmarks
  console.log()
  const keyBenchmarks = allResults.filter((r) =>
    [
      "encode CONNECT",
      "decode CONNECT",
      "encode PUBLISH (small)",
      "decode PUBLISH (small)",
      "topic match (single wildcard (+))",
      "framer (complete packet)"
    ].includes(r.name)
  )
  formatSummary(keyBenchmarks)

  console.log("\nBenchmarks complete.")
}

main()
