/**
 * MQTT binary codec utilities.
 *
 * @packageDocumentation
 */

// Variable byte integer
export {
  decodeVariableByteInteger,
  encodeVariableByteInteger,
  encodeVariableByteIntegerToArray,
  hasCompleteVariableByteInteger,
  variableByteIntegerLength,
  type VarintDecodeValue
} from "./varint.js"

// UTF-8 and MQTT strings
export {
  decodeMqttBinary,
  decodeMqttString,
  decodeUtf8,
  encodeMqttBinary,
  encodeMqttString,
  encodeUtf8,
  isValidMqttString,
  utf8ByteLength,
  validateMqttUtf8
} from "./utf8.js"

// Binary reader
export { BinaryReader } from "./reader.js"

// Binary writer
export { BinaryWriter, PacketSizeCalculator } from "./writer.js"

// Stream framing
export {
  type FrameResult,
  type PacketFrame,
  parsePacketFrame,
  readPacketFrame,
  StreamFramer
} from "./framing.js"
