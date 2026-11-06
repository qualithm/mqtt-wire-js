import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { decodePacket } from "../../../packets/decode"
import { encodePacket } from "../../../packets/encode"
import { arbMqttPacket, arbMutations, arbProtocolVersion } from "../../../testing/generators"
import type { DecodeErrorCode, DecodeResult } from "../../../types"

const CODES: ReadonlySet<DecodeErrorCode> = new Set([
  "INCOMPLETE",
  "MALFORMED_VARINT",
  "MALFORMED_UTF8",
  "MALFORMED_PACKET",
  "PACKET_TOO_LARGE",
  "PROTOCOL_ERROR",
  "INVALID_PROPERTY_ID",
  "INVALID_TOPIC",
  "INVALID_CLIENT_ID"
])

/**
 * Replays a failure: fast-check prints `seed` and `path` with the counterexample, and
 * `FC_SEED=<seed> FC_PATH=<path> bun run test` runs exactly that case again.
 */
function replay(): fc.Parameters<unknown> {
  const seed = process.env.FC_SEED
  const path = process.env.FC_PATH
  return seed === undefined ? {} : { seed: Number(seed), path }
}

function expectTypedOutcome(result: DecodeResult<unknown>): void {
  if (!result.ok) {
    expect(CODES.has(result.error.code)).toBe(true)
    expect(typeof result.error.message).toBe("string")
  }
}

describe("packet decoder properties", () => {
  it("decodes what it encodes", () => {
    fc.assert(
      fc.property(arbMqttPacket, (packet) => {
        const bytes = encodePacket(packet, "5.0")
        const decoded = decodePacket(bytes, "5.0")
        expect(decoded.ok).toBe(true)
        if (decoded.ok) {
          expect(decoded.value.bytesRead).toBe(bytes.length)
          expect(encodePacket(decoded.value.packet, "5.0")).toEqual(bytes)
        }
      }),
      replay()
    )
  })

  it("answers arbitrary bytes with a packet or a typed decode error, never a throw", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), arbProtocolVersion, (bytes, version) => {
        expectTypedOutcome(decodePacket(bytes, version))
      }),
      replay()
    )
  })

  it("answers a mutated valid packet with a packet or a typed decode error, never a throw", () => {
    fc.assert(
      fc.property(arbMqttPacket, arbMutations(4), (packet, mutate) => {
        expectTypedOutcome(decodePacket(mutate(encodePacket(packet, "5.0")), "5.0"))
      }),
      replay()
    )
  })
})
