/**
 * State machine module exports.
 *
 * @packageDocumentation
 */

// Types
export type {
  ConnectionState,
  ConnectionStateChange,
  InboundFlow,
  LifecycleHooks,
  MqttWireOptions,
  OnConnectHook,
  OnDisconnectHook,
  OnErrorHook,
  OnPublishHook,
  OnSendHook,
  OnSessionLostHook,
  OnSubscribeHook,
  OnUnsubscribeHook,
  OutboundFlow,
  PendingOperation,
  PendingSubscribe,
  PendingUnsubscribe,
  QoS1InboundFlow,
  QoS1OutboundFlow,
  QoS2InboundFlow,
  QoS2InboundState,
  QoS2OutboundFlow,
  QoS2OutboundState,
  QoSFlow,
  SessionState
} from "./types.js"
export { DEFAULT_WIRE_OPTIONS } from "./types.js"

// Packet ID allocator
export { PacketIdAllocator, PacketIdExhaustedError } from "./packet-id.js"

// Topic aliases
export { TopicAliasError, TopicAliasManager, TopicAliasMap } from "./topic-alias.js"

// QoS flow tracking
export type { AckResult } from "./qos-flow.js"
export { QoSFlowTracker } from "./qos-flow.js"
