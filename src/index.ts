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
