/**
 * MQTT protocol codec and connection state machine.
 *
 * @packageDocumentation
 */

// Core types
export type {
  DecodeError,
  DecodeErrorCode,
  DecodeFailure,
  DecodeResult,
  DecodeSuccess,
  ProtocolVersion,
  QoS,
  ReasonCode
} from "./types.js"
export {
  decodeError,
  err,
  isErrorReasonCode,
  isSuccessReasonCode,
  ok,
  PROTOCOL_LEVEL
} from "./types.js"

// Constants
export {
  DEFAULT_MAXIMUM_PACKET_SIZE,
  DEFAULT_RECEIVE_MAXIMUM,
  MAX_PACKET_ID,
  MAX_PACKET_SIZE,
  MAX_TOPIC_ALIAS,
  MAX_VARIABLE_BYTE_INTEGER,
  MAX_VARIABLE_BYTE_INTEGER_LENGTH,
  MIN_PACKET_ID,
  PACKET_TYPE_NAME,
  PacketType,
  PROPERTY_ID_NAME,
  PropertyId,
  REASON_CODE_NAME
} from "./constants.js"

// Codec utilities
export {
  BinaryReader,
  BinaryWriter,
  decodeMqttBinary,
  decodeMqttString,
  decodeUtf8,
  decodeVariableByteInteger,
  encodeMqttBinary,
  encodeMqttString,
  encodeUtf8,
  encodeVariableByteInteger,
  encodeVariableByteIntegerToArray,
  type FrameResult,
  hasCompleteVariableByteInteger,
  isValidMqttString,
  type PacketFrame,
  PacketSizeCalculator,
  parsePacketFrame,
  readPacketFrame,
  StreamFramer,
  utf8ByteLength,
  validateMqttUtf8,
  variableByteIntegerLength,
  type VarintDecodeValue
} from "./codec/index.js"

// Packet types and codec
export type {
  AuthPacket,
  AuthProperties,
  ConnackPacket,
  ConnackProperties,
  ConnectPacket,
  ConnectProperties,
  DecodedPacket,
  DisconnectPacket,
  DisconnectProperties,
  MqttPacket,
  PacketOfType,
  PingreqPacket,
  PingrespPacket,
  PubackPacket,
  PubAckProperties,
  PubcompPacket,
  PublishPacket,
  PublishProperties,
  PubrecPacket,
  PubrelPacket,
  SubackPacket,
  SubackProperties,
  SubscribePacket,
  SubscribeProperties,
  Subscription,
  SubscriptionOptions,
  UnsubackPacket,
  UnsubackProperties,
  UnsubscribePacket,
  UnsubscribeProperties,
  UserProperty,
  WillMessage,
  WillProperties
} from "./packets/index.js"
export { decodePacket, encodePacket } from "./packets/index.js"

// Topic utilities
export type { SharedSubscription } from "./topic.js"
export {
  isSharedSubscription,
  isValidTopicFilter,
  isValidTopicName,
  joinTopicLevels,
  MAX_TOPIC_LENGTH,
  parseSharedSubscription,
  parseTopicLevels,
  SHARED_SUBSCRIPTION_PREFIX,
  topicMatches,
  validateTopicFilter,
  validateTopicName,
  WILDCARD_MULTI,
  WILDCARD_SINGLE
} from "./topic.js"

// State machine
export type {
  AckResult,
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
  OnSubscribeHook,
  OnUnsubscribeHook,
  OutboundFlow,
  QoS1InboundFlow,
  QoS1OutboundFlow,
  QoS2InboundFlow,
  QoS2InboundState,
  QoS2OutboundFlow,
  QoS2OutboundState,
  QoSFlow
} from "./state/index.js"
export {
  DEFAULT_WIRE_OPTIONS,
  PacketIdAllocator,
  PacketIdExhaustedError,
  QoSFlowTracker,
  TopicAliasError,
  TopicAliasManager,
  TopicAliasMap
} from "./state/index.js"

// MqttWire
export { MqttWire, ProtocolError, StateError } from "./wire.js"
