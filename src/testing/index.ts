/**
 * Testing utilities for MQTT Wire.
 *
 * This subpath export (`@qualithm/mqtt-wire/testing`) provides:
 *
 * - **Packet builders** — Fluent API for constructing test packets
 * - **Fast-check generators** — Arbitraries for property-based testing
 * - **Test harness** — Mock MqttWire for testing client code
 * - **Fixtures** — Spec-compliant packet examples
 *
 * @example
 * ```ts
 * import {
 *   // Builders
 *   connect, connack, publish, subscribe,
 *   // Harness
 *   TestHarness, createTestHarness,
 *   // Generators
 *   arbPublishPacket, arbChunkSplits,
 *   // Fixtures
 *   fixtures, fromHex
 * } from "@qualithm/mqtt-wire/testing"
 *
 * // Build packets fluently
 * const packet = publish("sensors/temp").payload("22.5").qos(1).packetId(1).build()
 *
 * // Test with harness
 * const harness = createTestHarness()
 * await harness.wire.connect({ clientId: "test" })
 *
 * // Property-based testing
 * fc.assert(fc.property(arbPublishPacket, (packet) => {
 *   const encoded = encodePacket(packet)
 *   const decoded = decodePacket(encoded)
 *   return decoded.ok
 * }))
 *
 * // Use spec fixtures
 * for (const fixture of fixtures.publish) {
 *   expect(encodePacket(fixture.packet)).toEqual(fixture.bytes)
 * }
 * ```
 *
 * @packageDocumentation
 */

// Packet builders
export {
  // Factory functions
  auth,
  // Builder classes
  AuthBuilder,
  connack,
  ConnackBuilder,
  connect,
  ConnectBuilder,
  disconnect,
  DisconnectBuilder,
  pingreq,
  pingresp,
  puback,
  PubackBuilder,
  pubcomp,
  PubcompBuilder,
  publish,
  PublishBuilder,
  pubrec,
  PubrecBuilder,
  pubrel,
  PubrelBuilder,
  suback,
  SubackBuilder,
  subscribe,
  SubscribeBuilder,
  unsuback,
  UnsubackBuilder,
  unsubscribe,
  UnsubscribeBuilder,
  WillBuilder
} from "./builders.js"

// Fast-check generators
export {
  // Packets
  arbAuthPacket,
  // Properties
  arbAuthProperties,
  // Primitives
  arbBinary,
  // Chunk splitting
  arbChunkSplits,
  arbClientId,
  arbConnackPacket,
  arbConnackProperties,
  arbConnectPacket,
  arbConnectProperties,
  // Mutations
  arbDeleteBytes,
  arbDisconnectPacket,
  arbDisconnectProperties,
  arbInsertBytes,
  arbMqttPacket,
  arbMqttString,
  arbMutateByte,
  arbMutation,
  arbMutations,
  arbPacketId,
  arbPingreqPacket,
  arbPingrespPacket,
  arbProtocolVersion,
  arbPubackPacket,
  arbPubAckProperties,
  arbPubcompPacket,
  arbPublishPacket,
  arbPublishProperties,
  arbPublishQoS0Packet,
  arbPublishQoS12Packet,
  arbPubrecPacket,
  arbPubrelPacket,
  arbQoS,
  arbReasonCode,
  arbSmallBinary,
  arbSubackPacket,
  arbSubackProperties,
  arbSubscribePacket,
  arbSubscribeProperties,
  // Subscription
  arbSubscription,
  arbSubscriptionOptions,
  arbSuccessReasonCode,
  arbTopicFilter,
  arbTopicName,
  arbTruncate,
  arbUnsubackPacket,
  arbUnsubackProperties,
  arbUnsubscribePacket,
  arbUnsubscribeProperties,
  arbUserProperties,
  arbUserProperty,
  arbWillMessage,
  arbWillProperties,
  arbWithChunkSplits,
  splitAtPositions
} from "./generators.js"

// Test harness
export type {
  PacketResponder,
  ReceivedPacketRecord,
  SentPacketRecord,
  TestHarnessOptions
} from "./harness.js"
export { createFullTestHarness, createTestHarness, TestHarness } from "./harness.js"

// Fixtures
export type { MalformedFixture, PacketFixture } from "./fixtures.js"
export {
  allValidFixtures,
  connackFixtures,
  connectFixtures,
  disconnectFixtures,
  edgeCaseFixtures,
  fixtures,
  fromAscii,
  fromHex,
  malformedFixtures,
  pingreqFixtures,
  pingrespFixtures,
  pubackFixtures,
  pubcompFixtures,
  publishFixtures,
  pubrecFixtures,
  pubrelFixtures,
  subackFixtures,
  subscribeFixtures,
  unsubackFixtures,
  unsubscribeFixtures
} from "./fixtures.js"
