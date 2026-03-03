/**
 * MQTT 5.0 properties encoding and decoding.
 *
 * Properties are encoded as a variable byte integer length followed by
 * property identifier/value pairs.
 *
 * @packageDocumentation
 */

import type { BinaryReader } from "../codec/reader.js"
import { utf8ByteLength } from "../codec/utf8.js"
import { variableByteIntegerLength } from "../codec/varint.js"
import type { BinaryWriter } from "../codec/writer.js"
import { PropertyId } from "../constants.js"
import { decodeError, type DecodeResult, err, ok } from "../types.js"
import type {
  AuthProperties,
  ConnackProperties,
  ConnectProperties,
  DisconnectProperties,
  PubAckProperties,
  PublishProperties,
  SubackProperties,
  SubscribeProperties,
  UnsubackProperties,
  UnsubscribeProperties,
  UserProperty,
  WillProperties
} from "./types.js"

// -----------------------------------------------------------------------------
// Property Type Handlers
// -----------------------------------------------------------------------------

/**
 * Property data types per MQTT 5.0 spec.
 */
type PropertyType = "byte" | "uint16" | "uint32" | "varint" | "string" | "binary" | "stringPair"

/**
 * Property metadata: data type and whether it can appear multiple times.
 */
type PropertyMeta = {
  readonly type: PropertyType
  readonly multiple?: boolean
}

/**
 * Property type definitions per §2.2.2.2.
 */
const PROPERTY_META: Partial<Record<number, PropertyMeta>> = {
  [PropertyId.PAYLOAD_FORMAT_INDICATOR]: { type: "byte" },
  [PropertyId.MESSAGE_EXPIRY_INTERVAL]: { type: "uint32" },
  [PropertyId.CONTENT_TYPE]: { type: "string" },
  [PropertyId.RESPONSE_TOPIC]: { type: "string" },
  [PropertyId.CORRELATION_DATA]: { type: "binary" },
  [PropertyId.SUBSCRIPTION_IDENTIFIER]: { type: "varint", multiple: true },
  [PropertyId.SESSION_EXPIRY_INTERVAL]: { type: "uint32" },
  [PropertyId.ASSIGNED_CLIENT_IDENTIFIER]: { type: "string" },
  [PropertyId.SERVER_KEEP_ALIVE]: { type: "uint16" },
  [PropertyId.AUTHENTICATION_METHOD]: { type: "string" },
  [PropertyId.AUTHENTICATION_DATA]: { type: "binary" },
  [PropertyId.REQUEST_PROBLEM_INFORMATION]: { type: "byte" },
  [PropertyId.WILL_DELAY_INTERVAL]: { type: "uint32" },
  [PropertyId.REQUEST_RESPONSE_INFORMATION]: { type: "byte" },
  [PropertyId.RESPONSE_INFORMATION]: { type: "string" },
  [PropertyId.SERVER_REFERENCE]: { type: "string" },
  [PropertyId.REASON_STRING]: { type: "string" },
  [PropertyId.RECEIVE_MAXIMUM]: { type: "uint16" },
  [PropertyId.TOPIC_ALIAS_MAXIMUM]: { type: "uint16" },
  [PropertyId.TOPIC_ALIAS]: { type: "uint16" },
  [PropertyId.MAXIMUM_QOS]: { type: "byte" },
  [PropertyId.RETAIN_AVAILABLE]: { type: "byte" },
  [PropertyId.USER_PROPERTY]: { type: "stringPair", multiple: true },
  [PropertyId.MAXIMUM_PACKET_SIZE]: { type: "uint32" },
  [PropertyId.WILDCARD_SUBSCRIPTION_AVAILABLE]: { type: "byte" },
  [PropertyId.SUBSCRIPTION_IDENTIFIER_AVAILABLE]: { type: "byte" },
  [PropertyId.SHARED_SUBSCRIPTION_AVAILABLE]: { type: "byte" }
}

// -----------------------------------------------------------------------------
// Raw Property Map
// -----------------------------------------------------------------------------

/**
 * Raw property value types.
 */
type RawPropertyValue = number | string | Uint8Array | UserProperty | number[]

/**
 * Raw property map for intermediate decode.
 */
export type RawProperties = Map<number, RawPropertyValue | RawPropertyValue[]>

// -----------------------------------------------------------------------------
// Property Size Calculation
// -----------------------------------------------------------------------------

/**
 * Calculate the encoded size of a property value.
 */
function propertyValueSize(type: PropertyType, value: RawPropertyValue): number {
  switch (type) {
    case "byte":
      return 1
    case "uint16":
      return 2
    case "uint32":
      return 4
    case "varint":
      return variableByteIntegerLength(value as number)
    case "string":
      return 2 + utf8ByteLength(value as string)
    case "binary":
      return 2 + (value as Uint8Array).length
    case "stringPair": {
      const [key, val] = value as UserProperty
      return 2 + utf8ByteLength(key) + 2 + utf8ByteLength(val)
    }
  }
}

/**
 * Calculate total size of encoded properties (excluding length prefix).
 */
export function calculatePropertiesSize(properties: RawProperties): number {
  let size = 0
  for (const [id, value] of properties) {
    const meta = PROPERTY_META[id]
    if (!meta) {
      continue
    }

    if (Array.isArray(value)) {
      for (const v of value) {
        size += variableByteIntegerLength(id) + propertyValueSize(meta.type, v)
      }
    } else {
      size += variableByteIntegerLength(id) + propertyValueSize(meta.type, value)
    }
  }
  return size
}

// -----------------------------------------------------------------------------
// Property Encoding
// -----------------------------------------------------------------------------

/**
 * Write a single property value.
 */
function writePropertyValue(
  writer: BinaryWriter,
  type: PropertyType,
  value: RawPropertyValue
): void {
  switch (type) {
    case "byte":
      writer.writeUint8(value as number)
      break
    case "uint16":
      writer.writeUint16(value as number)
      break
    case "uint32":
      writer.writeUint32(value as number)
      break
    case "varint":
      writer.writeVariableByteInteger(value as number)
      break
    case "string":
      writer.writeMqttString(value as string)
      break
    case "binary":
      writer.writeMqttBinary(value as Uint8Array)
      break
    case "stringPair": {
      const [key, val] = value as UserProperty
      writer.writeMqttString(key)
      writer.writeMqttString(val)
      break
    }
  }
}

/**
 * Encode properties to a writer.
 */
export function encodeProperties(writer: BinaryWriter, properties: RawProperties): void {
  const size = calculatePropertiesSize(properties)
  writer.writeVariableByteInteger(size)

  for (const [id, value] of properties) {
    const meta = PROPERTY_META[id]
    if (!meta) {
      continue
    }

    if (Array.isArray(value)) {
      for (const v of value) {
        writer.writeVariableByteInteger(id)
        writePropertyValue(writer, meta.type, v)
      }
    } else {
      writer.writeVariableByteInteger(id)
      writePropertyValue(writer, meta.type, value)
    }
  }
}

/**
 * Write empty properties (just length = 0).
 */
export function encodeEmptyProperties(writer: BinaryWriter): void {
  writer.writeVariableByteInteger(0)
}

// -----------------------------------------------------------------------------
// Property Decoding
// -----------------------------------------------------------------------------

/**
 * Read a single property value.
 */
function readPropertyValue(
  reader: BinaryReader,
  type: PropertyType
): DecodeResult<RawPropertyValue> {
  switch (type) {
    case "byte":
      return reader.readUint8()
    case "uint16":
      return reader.readUint16()
    case "uint32":
      return reader.readUint32()
    case "varint":
      return reader.readVariableByteInteger()
    case "string":
      return reader.readMqttString()
    case "binary":
      return reader.readMqttBinary()
    case "stringPair": {
      const key = reader.readMqttString()
      if (!key.ok) {
        return key
      }
      const val = reader.readMqttString()
      if (!val.ok) {
        return val
      }
      return ok([key.value, val.value] as const)
    }
  }
}

/**
 * Decode properties from a reader.
 */
export function decodeProperties(reader: BinaryReader): DecodeResult<RawProperties> {
  const lengthResult = reader.readVariableByteInteger()
  if (!lengthResult.ok) {
    return lengthResult
  }

  const length = lengthResult.value
  const properties: RawProperties = new Map()

  if (length === 0) {
    return ok(properties)
  }

  const endOffset = reader.offset + length
  if (!reader.hasRemaining(length)) {
    return err(decodeError("INCOMPLETE", "not enough bytes for properties", "§2.2.2"))
  }

  while (reader.offset < endOffset) {
    const idResult = reader.readVariableByteInteger()
    if (!idResult.ok) {
      return idResult
    }

    const id = idResult.value
    const meta = PROPERTY_META[id]

    if (!meta) {
      return err(
        decodeError(
          "INVALID_PROPERTY_ID",
          `unknown property id: ${String(id)}`,
          "§2.2.2.2",
          reader.offset
        )
      )
    }

    const valueResult = readPropertyValue(reader, meta.type)
    if (!valueResult.ok) {
      return valueResult
    }

    if (meta.multiple === true) {
      const existing = properties.get(id)
      if (existing !== undefined) {
        if (Array.isArray(existing)) {
          ;(existing as RawPropertyValue[]).push(valueResult.value)
        } else {
          properties.set(id, [existing, valueResult.value])
        }
      } else {
        properties.set(id, [valueResult.value])
      }
    } else {
      if (properties.has(id)) {
        return err(
          decodeError(
            "PROTOCOL_ERROR",
            `duplicate property id: ${String(id)}`,
            "§2.2.2.2",
            reader.offset
          )
        )
      }
      properties.set(id, valueResult.value)
    }
  }

  return ok(properties)
}

// -----------------------------------------------------------------------------
// Property Builders
// -----------------------------------------------------------------------------

/**
 * Build RawProperties from ConnectProperties.
 */
export function buildConnectProperties(props: ConnectProperties): RawProperties {
  const raw: RawProperties = new Map()

  if (props.sessionExpiryInterval !== undefined) {
    raw.set(PropertyId.SESSION_EXPIRY_INTERVAL, props.sessionExpiryInterval)
  }
  if (props.receiveMaximum !== undefined) {
    raw.set(PropertyId.RECEIVE_MAXIMUM, props.receiveMaximum)
  }
  if (props.maximumPacketSize !== undefined) {
    raw.set(PropertyId.MAXIMUM_PACKET_SIZE, props.maximumPacketSize)
  }
  if (props.topicAliasMaximum !== undefined) {
    raw.set(PropertyId.TOPIC_ALIAS_MAXIMUM, props.topicAliasMaximum)
  }
  if (props.requestResponseInformation !== undefined) {
    raw.set(PropertyId.REQUEST_RESPONSE_INFORMATION, props.requestResponseInformation ? 1 : 0)
  }
  if (props.requestProblemInformation !== undefined) {
    raw.set(PropertyId.REQUEST_PROBLEM_INFORMATION, props.requestProblemInformation ? 1 : 0)
  }
  if (props.authenticationMethod !== undefined) {
    raw.set(PropertyId.AUTHENTICATION_METHOD, props.authenticationMethod)
  }
  if (props.authenticationData !== undefined) {
    raw.set(PropertyId.AUTHENTICATION_DATA, props.authenticationData)
  }
  if (props.userProperties !== undefined && props.userProperties.length > 0) {
    raw.set(PropertyId.USER_PROPERTY, [...props.userProperties])
  }

  return raw
}

/**
 * Build RawProperties from WillProperties.
 */
export function buildWillProperties(props: WillProperties): RawProperties {
  const raw: RawProperties = new Map()

  if (props.willDelayInterval !== undefined) {
    raw.set(PropertyId.WILL_DELAY_INTERVAL, props.willDelayInterval)
  }
  if (props.payloadFormatIndicator !== undefined) {
    raw.set(PropertyId.PAYLOAD_FORMAT_INDICATOR, props.payloadFormatIndicator)
  }
  if (props.messageExpiryInterval !== undefined) {
    raw.set(PropertyId.MESSAGE_EXPIRY_INTERVAL, props.messageExpiryInterval)
  }
  if (props.contentType !== undefined) {
    raw.set(PropertyId.CONTENT_TYPE, props.contentType)
  }
  if (props.responseTopic !== undefined) {
    raw.set(PropertyId.RESPONSE_TOPIC, props.responseTopic)
  }
  if (props.correlationData !== undefined) {
    raw.set(PropertyId.CORRELATION_DATA, props.correlationData)
  }
  if (props.userProperties !== undefined && props.userProperties.length > 0) {
    raw.set(PropertyId.USER_PROPERTY, [...props.userProperties])
  }

  return raw
}

// -----------------------------------------------------------------------------
// Property Builder Helpers
// -----------------------------------------------------------------------------

/** Set property if value is defined. */
function setIfDefined(
  raw: RawProperties,
  id: PropertyId,
  value: RawPropertyValue | undefined
): void {
  if (value !== undefined) {
    raw.set(id, value)
  }
}

/** Set boolean property as 0/1 if defined. */
function setBoolIfDefined(raw: RawProperties, id: PropertyId, value: boolean | undefined): void {
  if (value !== undefined) {
    raw.set(id, value ? 1 : 0)
  }
}

/** Set user properties if non-empty. */
function setUserProperties(
  raw: RawProperties,
  userProperties: readonly (readonly [string, string])[] | undefined
): void {
  if (userProperties !== undefined && userProperties.length > 0) {
    raw.set(PropertyId.USER_PROPERTY, [...userProperties])
  }
}

/**
 * Build RawProperties from ConnackProperties.
 */
export function buildConnackProperties(props: ConnackProperties): RawProperties {
  const raw: RawProperties = new Map()

  setIfDefined(raw, PropertyId.SESSION_EXPIRY_INTERVAL, props.sessionExpiryInterval)
  setIfDefined(raw, PropertyId.RECEIVE_MAXIMUM, props.receiveMaximum)
  setIfDefined(raw, PropertyId.MAXIMUM_QOS, props.maximumQoS)
  setBoolIfDefined(raw, PropertyId.RETAIN_AVAILABLE, props.retainAvailable)
  setIfDefined(raw, PropertyId.MAXIMUM_PACKET_SIZE, props.maximumPacketSize)
  setIfDefined(raw, PropertyId.ASSIGNED_CLIENT_IDENTIFIER, props.assignedClientIdentifier)
  setIfDefined(raw, PropertyId.TOPIC_ALIAS_MAXIMUM, props.topicAliasMaximum)
  setIfDefined(raw, PropertyId.REASON_STRING, props.reasonString)
  setBoolIfDefined(
    raw,
    PropertyId.WILDCARD_SUBSCRIPTION_AVAILABLE,
    props.wildcardSubscriptionAvailable
  )
  setBoolIfDefined(
    raw,
    PropertyId.SUBSCRIPTION_IDENTIFIER_AVAILABLE,
    props.subscriptionIdentifiersAvailable
  )
  setBoolIfDefined(raw, PropertyId.SHARED_SUBSCRIPTION_AVAILABLE, props.sharedSubscriptionAvailable)
  setIfDefined(raw, PropertyId.SERVER_KEEP_ALIVE, props.serverKeepAlive)
  setIfDefined(raw, PropertyId.RESPONSE_INFORMATION, props.responseInformation)
  setIfDefined(raw, PropertyId.SERVER_REFERENCE, props.serverReference)
  setIfDefined(raw, PropertyId.AUTHENTICATION_METHOD, props.authenticationMethod)
  setIfDefined(raw, PropertyId.AUTHENTICATION_DATA, props.authenticationData)
  setUserProperties(raw, props.userProperties)

  return raw
}

/**
 * Build RawProperties from PublishProperties.
 */
export function buildPublishProperties(props: PublishProperties): RawProperties {
  const raw: RawProperties = new Map()

  if (props.payloadFormatIndicator !== undefined) {
    raw.set(PropertyId.PAYLOAD_FORMAT_INDICATOR, props.payloadFormatIndicator)
  }
  if (props.messageExpiryInterval !== undefined) {
    raw.set(PropertyId.MESSAGE_EXPIRY_INTERVAL, props.messageExpiryInterval)
  }
  if (props.topicAlias !== undefined) {
    raw.set(PropertyId.TOPIC_ALIAS, props.topicAlias)
  }
  if (props.responseTopic !== undefined) {
    raw.set(PropertyId.RESPONSE_TOPIC, props.responseTopic)
  }
  if (props.correlationData !== undefined) {
    raw.set(PropertyId.CORRELATION_DATA, props.correlationData)
  }
  if (props.subscriptionIdentifiers !== undefined && props.subscriptionIdentifiers.length > 0) {
    raw.set(PropertyId.SUBSCRIPTION_IDENTIFIER, [...props.subscriptionIdentifiers])
  }
  if (props.contentType !== undefined) {
    raw.set(PropertyId.CONTENT_TYPE, props.contentType)
  }
  if (props.userProperties !== undefined && props.userProperties.length > 0) {
    raw.set(PropertyId.USER_PROPERTY, [...props.userProperties])
  }

  return raw
}

/**
 * Build RawProperties from PubAckProperties (shared by PUBACK/PUBREC/PUBREL/PUBCOMP).
 */
export function buildPubAckProperties(props: PubAckProperties): RawProperties {
  const raw: RawProperties = new Map()

  if (props.reasonString !== undefined) {
    raw.set(PropertyId.REASON_STRING, props.reasonString)
  }
  if (props.userProperties !== undefined && props.userProperties.length > 0) {
    raw.set(PropertyId.USER_PROPERTY, [...props.userProperties])
  }

  return raw
}

/**
 * Build RawProperties from SubscribeProperties.
 */
export function buildSubscribeProperties(props: SubscribeProperties): RawProperties {
  const raw: RawProperties = new Map()

  if (props.subscriptionIdentifier !== undefined) {
    raw.set(PropertyId.SUBSCRIPTION_IDENTIFIER, [props.subscriptionIdentifier])
  }
  if (props.userProperties !== undefined && props.userProperties.length > 0) {
    raw.set(PropertyId.USER_PROPERTY, [...props.userProperties])
  }

  return raw
}

/**
 * Build RawProperties from SubackProperties.
 */
export function buildSubackProperties(props: SubackProperties): RawProperties {
  const raw: RawProperties = new Map()

  if (props.reasonString !== undefined) {
    raw.set(PropertyId.REASON_STRING, props.reasonString)
  }
  if (props.userProperties !== undefined && props.userProperties.length > 0) {
    raw.set(PropertyId.USER_PROPERTY, [...props.userProperties])
  }

  return raw
}

/**
 * Build RawProperties from UnsubscribeProperties.
 */
export function buildUnsubscribeProperties(props: UnsubscribeProperties): RawProperties {
  const raw: RawProperties = new Map()

  if (props.userProperties !== undefined && props.userProperties.length > 0) {
    raw.set(PropertyId.USER_PROPERTY, [...props.userProperties])
  }

  return raw
}

/**
 * Build RawProperties from UnsubackProperties.
 */
export function buildUnsubackProperties(props: UnsubackProperties): RawProperties {
  const raw: RawProperties = new Map()

  if (props.reasonString !== undefined) {
    raw.set(PropertyId.REASON_STRING, props.reasonString)
  }
  if (props.userProperties !== undefined && props.userProperties.length > 0) {
    raw.set(PropertyId.USER_PROPERTY, [...props.userProperties])
  }

  return raw
}

/**
 * Build RawProperties from DisconnectProperties.
 */
export function buildDisconnectProperties(props: DisconnectProperties): RawProperties {
  const raw: RawProperties = new Map()

  if (props.sessionExpiryInterval !== undefined) {
    raw.set(PropertyId.SESSION_EXPIRY_INTERVAL, props.sessionExpiryInterval)
  }
  if (props.reasonString !== undefined) {
    raw.set(PropertyId.REASON_STRING, props.reasonString)
  }
  if (props.serverReference !== undefined) {
    raw.set(PropertyId.SERVER_REFERENCE, props.serverReference)
  }
  if (props.userProperties !== undefined && props.userProperties.length > 0) {
    raw.set(PropertyId.USER_PROPERTY, [...props.userProperties])
  }

  return raw
}

/**
 * Build RawProperties from AuthProperties.
 */
export function buildAuthProperties(props: AuthProperties): RawProperties {
  const raw: RawProperties = new Map()

  if (props.authenticationMethod !== undefined) {
    raw.set(PropertyId.AUTHENTICATION_METHOD, props.authenticationMethod)
  }
  if (props.authenticationData !== undefined) {
    raw.set(PropertyId.AUTHENTICATION_DATA, props.authenticationData)
  }
  if (props.reasonString !== undefined) {
    raw.set(PropertyId.REASON_STRING, props.reasonString)
  }
  if (props.userProperties !== undefined && props.userProperties.length > 0) {
    raw.set(PropertyId.USER_PROPERTY, [...props.userProperties])
  }

  return raw
}

// -----------------------------------------------------------------------------
// Property Parsers
// -----------------------------------------------------------------------------

/**
 * Parse RawProperties to ConnectProperties.
 */
export function parseConnectProperties(raw: RawProperties): ConnectProperties {
  const props: Record<string, unknown> = {}

  const sessionExpiry = raw.get(PropertyId.SESSION_EXPIRY_INTERVAL)
  if (sessionExpiry !== undefined) {
    props.sessionExpiryInterval = sessionExpiry as number
  }

  const receiveMax = raw.get(PropertyId.RECEIVE_MAXIMUM)
  if (receiveMax !== undefined) {
    props.receiveMaximum = receiveMax as number
  }

  const maxPacketSize = raw.get(PropertyId.MAXIMUM_PACKET_SIZE)
  if (maxPacketSize !== undefined) {
    props.maximumPacketSize = maxPacketSize as number
  }

  const topicAliasMax = raw.get(PropertyId.TOPIC_ALIAS_MAXIMUM)
  if (topicAliasMax !== undefined) {
    props.topicAliasMaximum = topicAliasMax as number
  }

  const reqRespInfo = raw.get(PropertyId.REQUEST_RESPONSE_INFORMATION)
  if (reqRespInfo !== undefined) {
    props.requestResponseInformation = reqRespInfo === 1
  }

  const reqProbInfo = raw.get(PropertyId.REQUEST_PROBLEM_INFORMATION)
  if (reqProbInfo !== undefined) {
    props.requestProblemInformation = reqProbInfo === 1
  }

  const authMethod = raw.get(PropertyId.AUTHENTICATION_METHOD)
  if (authMethod !== undefined) {
    props.authenticationMethod = authMethod as string
  }

  const authData = raw.get(PropertyId.AUTHENTICATION_DATA)
  if (authData !== undefined) {
    props.authenticationData = authData as Uint8Array
  }

  const userProps = raw.get(PropertyId.USER_PROPERTY)
  if (userProps !== undefined) {
    props.userProperties = userProps as UserProperty[]
  }

  return props as ConnectProperties
}

/**
 * Parse RawProperties to WillProperties.
 */
export function parseWillProperties(raw: RawProperties): WillProperties {
  const props: Record<string, unknown> = {}

  const willDelay = raw.get(PropertyId.WILL_DELAY_INTERVAL)
  if (willDelay !== undefined) {
    props.willDelayInterval = willDelay as number
  }

  const payloadFormat = raw.get(PropertyId.PAYLOAD_FORMAT_INDICATOR)
  if (payloadFormat !== undefined) {
    props.payloadFormatIndicator = payloadFormat as 0 | 1
  }

  const msgExpiry = raw.get(PropertyId.MESSAGE_EXPIRY_INTERVAL)
  if (msgExpiry !== undefined) {
    props.messageExpiryInterval = msgExpiry as number
  }

  const contentType = raw.get(PropertyId.CONTENT_TYPE)
  if (contentType !== undefined) {
    props.contentType = contentType as string
  }

  const respTopic = raw.get(PropertyId.RESPONSE_TOPIC)
  if (respTopic !== undefined) {
    props.responseTopic = respTopic as string
  }

  const corrData = raw.get(PropertyId.CORRELATION_DATA)
  if (corrData !== undefined) {
    props.correlationData = corrData as Uint8Array
  }

  const userProps = raw.get(PropertyId.USER_PROPERTY)
  if (userProps !== undefined) {
    props.userProperties = userProps as UserProperty[]
  }

  return props as WillProperties
}

/**
 * Parse RawProperties to ConnackProperties.
 */
export function parseConnackProperties(raw: RawProperties): ConnackProperties {
  const props: Record<string, unknown> = {}

  const sessionExpiry = raw.get(PropertyId.SESSION_EXPIRY_INTERVAL)
  if (sessionExpiry !== undefined) {
    props.sessionExpiryInterval = sessionExpiry as number
  }

  const receiveMax = raw.get(PropertyId.RECEIVE_MAXIMUM)
  if (receiveMax !== undefined) {
    props.receiveMaximum = receiveMax as number
  }

  const maxQoS = raw.get(PropertyId.MAXIMUM_QOS)
  if (maxQoS !== undefined) {
    props.maximumQoS = maxQoS as number
  }

  const retainAvail = raw.get(PropertyId.RETAIN_AVAILABLE)
  if (retainAvail !== undefined) {
    props.retainAvailable = retainAvail === 1
  }

  const maxPacketSize = raw.get(PropertyId.MAXIMUM_PACKET_SIZE)
  if (maxPacketSize !== undefined) {
    props.maximumPacketSize = maxPacketSize as number
  }

  const assignedClientId = raw.get(PropertyId.ASSIGNED_CLIENT_IDENTIFIER)
  if (assignedClientId !== undefined) {
    props.assignedClientIdentifier = assignedClientId as string
  }

  const topicAliasMax = raw.get(PropertyId.TOPIC_ALIAS_MAXIMUM)
  if (topicAliasMax !== undefined) {
    props.topicAliasMaximum = topicAliasMax as number
  }

  const reasonStr = raw.get(PropertyId.REASON_STRING)
  if (reasonStr !== undefined) {
    props.reasonString = reasonStr as string
  }

  const wildcardSub = raw.get(PropertyId.WILDCARD_SUBSCRIPTION_AVAILABLE)
  if (wildcardSub !== undefined) {
    props.wildcardSubscriptionAvailable = wildcardSub === 1
  }

  const subIdAvail = raw.get(PropertyId.SUBSCRIPTION_IDENTIFIER_AVAILABLE)
  if (subIdAvail !== undefined) {
    props.subscriptionIdentifiersAvailable = subIdAvail === 1
  }

  const sharedSub = raw.get(PropertyId.SHARED_SUBSCRIPTION_AVAILABLE)
  if (sharedSub !== undefined) {
    props.sharedSubscriptionAvailable = sharedSub === 1
  }

  const serverKeepAlive = raw.get(PropertyId.SERVER_KEEP_ALIVE)
  if (serverKeepAlive !== undefined) {
    props.serverKeepAlive = serverKeepAlive as number
  }

  const respInfo = raw.get(PropertyId.RESPONSE_INFORMATION)
  if (respInfo !== undefined) {
    props.responseInformation = respInfo as string
  }

  const serverRef = raw.get(PropertyId.SERVER_REFERENCE)
  if (serverRef !== undefined) {
    props.serverReference = serverRef as string
  }

  const authMethod = raw.get(PropertyId.AUTHENTICATION_METHOD)
  if (authMethod !== undefined) {
    props.authenticationMethod = authMethod as string
  }

  const authData = raw.get(PropertyId.AUTHENTICATION_DATA)
  if (authData !== undefined) {
    props.authenticationData = authData as Uint8Array
  }

  const userProps = raw.get(PropertyId.USER_PROPERTY)
  if (userProps !== undefined) {
    props.userProperties = userProps as UserProperty[]
  }

  return props as ConnackProperties
}

/**
 * Parse RawProperties to PublishProperties.
 */
export function parsePublishProperties(raw: RawProperties): PublishProperties {
  const props: Record<string, unknown> = {}

  const payloadFormat = raw.get(PropertyId.PAYLOAD_FORMAT_INDICATOR)
  if (payloadFormat !== undefined) {
    props.payloadFormatIndicator = payloadFormat as 0 | 1
  }

  const msgExpiry = raw.get(PropertyId.MESSAGE_EXPIRY_INTERVAL)
  if (msgExpiry !== undefined) {
    props.messageExpiryInterval = msgExpiry as number
  }

  const topicAlias = raw.get(PropertyId.TOPIC_ALIAS)
  if (topicAlias !== undefined) {
    props.topicAlias = topicAlias as number
  }

  const respTopic = raw.get(PropertyId.RESPONSE_TOPIC)
  if (respTopic !== undefined) {
    props.responseTopic = respTopic as string
  }

  const corrData = raw.get(PropertyId.CORRELATION_DATA)
  if (corrData !== undefined) {
    props.correlationData = corrData as Uint8Array
  }

  const subIds = raw.get(PropertyId.SUBSCRIPTION_IDENTIFIER)
  if (subIds !== undefined) {
    props.subscriptionIdentifiers = subIds as number[]
  }

  const contentType = raw.get(PropertyId.CONTENT_TYPE)
  if (contentType !== undefined) {
    props.contentType = contentType as string
  }

  const userProps = raw.get(PropertyId.USER_PROPERTY)
  if (userProps !== undefined) {
    props.userProperties = userProps as UserProperty[]
  }

  return props as PublishProperties
}

/**
 * Parse RawProperties to PubAckProperties.
 */
export function parsePubAckProperties(raw: RawProperties): PubAckProperties {
  const props: Record<string, unknown> = {}

  const reasonStr = raw.get(PropertyId.REASON_STRING)
  if (reasonStr !== undefined) {
    props.reasonString = reasonStr as string
  }

  const userProps = raw.get(PropertyId.USER_PROPERTY)
  if (userProps !== undefined) {
    props.userProperties = userProps as UserProperty[]
  }

  return props as PubAckProperties
}

/**
 * Parse RawProperties to SubscribeProperties.
 */
export function parseSubscribeProperties(raw: RawProperties): SubscribeProperties {
  const props: Record<string, unknown> = {}

  const subId = raw.get(PropertyId.SUBSCRIPTION_IDENTIFIER)
  if (subId !== undefined) {
    const ids = subId as number[]
    if (ids.length > 0) {
      props.subscriptionIdentifier = ids[0]
    }
  }

  const userProps = raw.get(PropertyId.USER_PROPERTY)
  if (userProps !== undefined) {
    props.userProperties = userProps as UserProperty[]
  }

  return props as SubscribeProperties
}

/**
 * Parse RawProperties to SubackProperties.
 */
export function parseSubackProperties(raw: RawProperties): SubackProperties {
  const props: Record<string, unknown> = {}

  const reasonStr = raw.get(PropertyId.REASON_STRING)
  if (reasonStr !== undefined) {
    props.reasonString = reasonStr as string
  }

  const userProps = raw.get(PropertyId.USER_PROPERTY)
  if (userProps !== undefined) {
    props.userProperties = userProps as UserProperty[]
  }

  return props as SubackProperties
}

/**
 * Parse RawProperties to UnsubscribeProperties.
 */
export function parseUnsubscribeProperties(raw: RawProperties): UnsubscribeProperties {
  const props: Record<string, unknown> = {}

  const userProps = raw.get(PropertyId.USER_PROPERTY)
  if (userProps !== undefined) {
    props.userProperties = userProps as UserProperty[]
  }

  return props as UnsubscribeProperties
}

/**
 * Parse RawProperties to UnsubackProperties.
 */
export function parseUnsubackProperties(raw: RawProperties): UnsubackProperties {
  const props: Record<string, unknown> = {}

  const reasonStr = raw.get(PropertyId.REASON_STRING)
  if (reasonStr !== undefined) {
    props.reasonString = reasonStr as string
  }

  const userProps = raw.get(PropertyId.USER_PROPERTY)
  if (userProps !== undefined) {
    props.userProperties = userProps as UserProperty[]
  }

  return props as UnsubackProperties
}

/**
 * Parse RawProperties to DisconnectProperties.
 */
export function parseDisconnectProperties(raw: RawProperties): DisconnectProperties {
  const props: Record<string, unknown> = {}

  const sessionExpiry = raw.get(PropertyId.SESSION_EXPIRY_INTERVAL)
  if (sessionExpiry !== undefined) {
    props.sessionExpiryInterval = sessionExpiry as number
  }

  const reasonStr = raw.get(PropertyId.REASON_STRING)
  if (reasonStr !== undefined) {
    props.reasonString = reasonStr as string
  }

  const serverRef = raw.get(PropertyId.SERVER_REFERENCE)
  if (serverRef !== undefined) {
    props.serverReference = serverRef as string
  }

  const userProps = raw.get(PropertyId.USER_PROPERTY)
  if (userProps !== undefined) {
    props.userProperties = userProps as UserProperty[]
  }

  return props as DisconnectProperties
}

/**
 * Parse RawProperties to AuthProperties.
 */
export function parseAuthProperties(raw: RawProperties): AuthProperties {
  const props: Record<string, unknown> = {}

  const authMethod = raw.get(PropertyId.AUTHENTICATION_METHOD)
  if (authMethod !== undefined) {
    props.authenticationMethod = authMethod as string
  }

  const authData = raw.get(PropertyId.AUTHENTICATION_DATA)
  if (authData !== undefined) {
    props.authenticationData = authData as Uint8Array
  }

  const reasonStr = raw.get(PropertyId.REASON_STRING)
  if (reasonStr !== undefined) {
    props.reasonString = reasonStr as string
  }

  const userProps = raw.get(PropertyId.USER_PROPERTY)
  if (userProps !== undefined) {
    props.userProperties = userProps as UserProperty[]
  }

  return props as AuthProperties
}
