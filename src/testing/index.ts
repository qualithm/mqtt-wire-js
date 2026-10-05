/**
 * Test helpers for code that uses MQTT Wire, exported at
 * `@qualithm/mqtt-wire/testing`.
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
  DisconnectRecord,
  HookCallRecords,
  ReceivedPacketRecord,
  SentPacketRecord,
  TestHarnessOptions
} from "./harness.js"
export { createTestHarness, TestHarness } from "./harness.js"

// Generators
export type { ChunkSplitResult } from "./generators.js"

// Fixtures
export type {
  EdgeCaseFixture,
  FixturesCollection,
  MalformedFixture,
  PacketFixture
} from "./fixtures.js"
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
