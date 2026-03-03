/**
 * MQTT packet types, encoding, and decoding.
 *
 * @packageDocumentation
 */

// Packet types
export type {
  AuthPacket,
  AuthProperties,
  ConnackPacket,
  ConnackProperties,
  ConnectPacket,
  ConnectProperties,
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
} from "./types.js"

// Encoding
export { encodePacket } from "./encode.js"

// Decoding
export { type DecodedPacket, decodePacket } from "./decode.js"

// Properties (for advanced use)
export {
  decodeProperties,
  encodeEmptyProperties,
  encodeProperties,
  type RawProperties
} from "./properties.js"
