/**
 * Fluent packet builders for test construction.
 *
 * Provides ergonomic APIs for building MQTT packets in tests without
 * manually constructing all required fields.
 *
 * @example
 * ```ts
 * import { connect, publish, subscribe } from "@qualithm/mqtt-wire/testing"
 *
 * const connectPacket = connect().clientId("test").cleanStart().build()
 * const publishPacket = publish("sensors/temp").payload("22.5").qos(1).build()
 * const subPacket = subscribe("sensors/#").qos(1).build()
 * ```
 *
 * @packageDocumentation
 */

import { PacketType } from "../constants.js"
import type {
  AuthPacket,
  AuthProperties,
  ConnackPacket,
  ConnackProperties,
  ConnectPacket,
  ConnectProperties,
  DisconnectPacket,
  DisconnectProperties,
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
  WillMessage,
  WillProperties
} from "../packets/types.js"
import type { ProtocolVersion, QoS, ReasonCode } from "../types.js"

// -----------------------------------------------------------------------------
// Text Encoder
// -----------------------------------------------------------------------------

const encoder = new TextEncoder()

/**
 * Convert string to Uint8Array.
 */
function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? encoder.encode(value) : value
}

// -----------------------------------------------------------------------------
// CONNECT Builder
// -----------------------------------------------------------------------------

/**
 * Builder for CONNECT packets.
 */
export class ConnectBuilder {
  private _clientId = ""
  private _protocolVersion: ProtocolVersion = "5.0"
  private _cleanStart = true
  private _keepAlive = 60
  private _username?: string
  private _password?: Uint8Array
  private _will?: WillMessage
  private _properties?: ConnectProperties

  /** Set client identifier */
  clientId(value: string): this {
    this._clientId = value
    return this
  }

  /** Set protocol version */
  version(value: ProtocolVersion): this {
    this._protocolVersion = value
    return this
  }

  /** Enable clean start */
  cleanStart(value = true): this {
    this._cleanStart = value
    return this
  }

  /** Set keep alive interval (seconds) */
  keepAlive(seconds: number): this {
    this._keepAlive = seconds
    return this
  }

  /** Set username */
  username(value: string): this {
    this._username = value
    return this
  }

  /** Set password */
  password(value: string | Uint8Array): this {
    this._password = toBytes(value)
    return this
  }

  /** Set will message */
  will(will: WillMessage): this {
    this._will = will
    return this
  }

  /** Set will message using builder callback */
  withWill(
    topic: string,
    payload: string | Uint8Array,
    configure?: (builder: WillBuilder) => WillBuilder
  ): this {
    const builder = new WillBuilder(topic, toBytes(payload))
    this._will = configure ? configure(builder).build() : builder.build()
    return this
  }

  /** Set CONNECT properties */
  properties(props: ConnectProperties): this {
    this._properties = props
    return this
  }

  /** Set session expiry interval */
  sessionExpiry(seconds: number): this {
    this._properties = { ...this._properties, sessionExpiryInterval: seconds }
    return this
  }

  /** Set receive maximum */
  receiveMaximum(value: number): this {
    this._properties = { ...this._properties, receiveMaximum: value }
    return this
  }

  /** Set maximum packet size */
  maxPacketSize(bytes: number): this {
    this._properties = { ...this._properties, maximumPacketSize: bytes }
    return this
  }

  /** Set topic alias maximum */
  topicAliasMaximum(value: number): this {
    this._properties = { ...this._properties, topicAliasMaximum: value }
    return this
  }

  /** Add user property */
  userProperty(key: string, value: string): this {
    const existing = this._properties?.userProperties ?? []
    this._properties = {
      ...this._properties,
      userProperties: [...existing, [key, value] as const]
    }
    return this
  }

  /** Build the CONNECT packet */
  build(): ConnectPacket {
    return {
      type: PacketType.CONNECT,
      protocolVersion: this._protocolVersion,
      clientId: this._clientId,
      cleanStart: this._cleanStart,
      keepAlive: this._keepAlive,
      ...(this._username !== undefined && { username: this._username }),
      ...(this._password !== undefined && { password: this._password }),
      ...(this._will !== undefined && { will: this._will }),
      ...(this._properties !== undefined && { properties: this._properties })
    }
  }
}

/**
 * Builder for will messages.
 */
export class WillBuilder {
  private readonly _topic: string
  private readonly _payload: Uint8Array
  private _qos: QoS = 0
  private _retain = false
  private _properties?: WillProperties

  constructor(topic: string, payload: Uint8Array) {
    this._topic = topic
    this._payload = payload
  }

  /** Set QoS level */
  qos(value: QoS): this {
    this._qos = value
    return this
  }

  /** Enable retain flag */
  retain(value = true): this {
    this._retain = value
    return this
  }

  /** Set will properties */
  properties(props: WillProperties): this {
    this._properties = props
    return this
  }

  /** Set will delay interval */
  delay(seconds: number): this {
    this._properties = { ...this._properties, willDelayInterval: seconds }
    return this
  }

  /** Set message expiry interval */
  expiry(seconds: number): this {
    this._properties = { ...this._properties, messageExpiryInterval: seconds }
    return this
  }

  /** Set content type */
  contentType(value: string): this {
    this._properties = { ...this._properties, contentType: value }
    return this
  }

  /** Set response topic */
  responseTopic(topic: string): this {
    this._properties = { ...this._properties, responseTopic: topic }
    return this
  }

  /** Set correlation data */
  correlationData(data: Uint8Array): this {
    this._properties = { ...this._properties, correlationData: data }
    return this
  }

  /** Build the will message */
  build(): WillMessage {
    return {
      topic: this._topic,
      payload: this._payload,
      qos: this._qos,
      retain: this._retain,
      ...(this._properties !== undefined && { properties: this._properties })
    }
  }
}

// -----------------------------------------------------------------------------
// CONNACK Builder
// -----------------------------------------------------------------------------

/**
 * Builder for CONNACK packets.
 */
export class ConnackBuilder {
  private _sessionPresent = false
  private _reasonCode: ReasonCode = 0x00
  private _properties?: ConnackProperties

  /** Set session present flag */
  sessionPresent(value = true): this {
    this._sessionPresent = value
    return this
  }

  /** Set reason code */
  reasonCode(code: ReasonCode): this {
    this._reasonCode = code
    return this
  }

  /** Set CONNACK properties */
  properties(props: ConnackProperties): this {
    this._properties = props
    return this
  }

  /** Set receive maximum */
  receiveMaximum(value: number): this {
    this._properties = { ...this._properties, receiveMaximum: value }
    return this
  }

  /** Set maximum QoS */
  maximumQoS(value: QoS): this {
    this._properties = { ...this._properties, maximumQoS: value }
    return this
  }

  /** Set retain available */
  retainAvailable(value = true): this {
    this._properties = { ...this._properties, retainAvailable: value }
    return this
  }

  /** Set maximum packet size */
  maxPacketSize(bytes: number): this {
    this._properties = { ...this._properties, maximumPacketSize: bytes }
    return this
  }

  /** Set assigned client identifier */
  assignedClientId(value: string): this {
    this._properties = { ...this._properties, assignedClientIdentifier: value }
    return this
  }

  /** Set topic alias maximum */
  topicAliasMaximum(value: number): this {
    this._properties = { ...this._properties, topicAliasMaximum: value }
    return this
  }

  /** Set server keep alive */
  serverKeepAlive(seconds: number): this {
    this._properties = { ...this._properties, serverKeepAlive: seconds }
    return this
  }

  /** Add user property */
  userProperty(key: string, value: string): this {
    const existing = this._properties?.userProperties ?? []
    this._properties = {
      ...this._properties,
      userProperties: [...existing, [key, value] as const]
    }
    return this
  }

  /** Build the CONNACK packet */
  build(): ConnackPacket {
    return {
      type: PacketType.CONNACK,
      sessionPresent: this._sessionPresent,
      reasonCode: this._reasonCode,
      ...(this._properties !== undefined && { properties: this._properties })
    }
  }
}

// -----------------------------------------------------------------------------
// PUBLISH Builder
// -----------------------------------------------------------------------------

/**
 * Builder for PUBLISH packets.
 */
export class PublishBuilder {
  private readonly _topic: string
  private _packetId?: number
  private _qos: QoS = 0
  private _retain = false
  private _dup = false
  private _payload: Uint8Array = new Uint8Array(0)
  private _properties?: PublishProperties

  constructor(topic: string) {
    this._topic = topic
  }

  /** Set packet identifier (required for QoS > 0) */
  packetId(id: number): this {
    this._packetId = id
    return this
  }

  /** Set QoS level */
  qos(value: QoS): this {
    this._qos = value
    return this
  }

  /** Enable retain flag */
  retain(value = true): this {
    this._retain = value
    return this
  }

  /** Set duplicate delivery flag */
  dup(value = true): this {
    this._dup = value
    return this
  }

  /** Set payload */
  payload(value: string | Uint8Array): this {
    this._payload = toBytes(value)
    return this
  }

  /** Set PUBLISH properties */
  properties(props: PublishProperties): this {
    this._properties = props
    return this
  }

  /** Set payload format indicator */
  payloadFormat(indicator: 0 | 1): this {
    this._properties = { ...this._properties, payloadFormatIndicator: indicator }
    return this
  }

  /** Set message expiry interval */
  expiry(seconds: number): this {
    this._properties = { ...this._properties, messageExpiryInterval: seconds }
    return this
  }

  /** Set topic alias */
  topicAlias(alias: number): this {
    this._properties = { ...this._properties, topicAlias: alias }
    return this
  }

  /** Set response topic */
  responseTopic(topic: string): this {
    this._properties = { ...this._properties, responseTopic: topic }
    return this
  }

  /** Set correlation data */
  correlationData(data: Uint8Array): this {
    this._properties = { ...this._properties, correlationData: data }
    return this
  }

  /** Set content type */
  contentType(value: string): this {
    this._properties = { ...this._properties, contentType: value }
    return this
  }

  /** Add subscription identifier */
  subscriptionId(id: number): this {
    const existing = this._properties?.subscriptionIdentifiers ?? []
    this._properties = {
      ...this._properties,
      subscriptionIdentifiers: [...existing, id]
    }
    return this
  }

  /** Add user property */
  userProperty(key: string, value: string): this {
    const existing = this._properties?.userProperties ?? []
    this._properties = {
      ...this._properties,
      userProperties: [...existing, [key, value] as const]
    }
    return this
  }

  /** Build the PUBLISH packet */
  build(): PublishPacket {
    return {
      type: PacketType.PUBLISH,
      topic: this._topic,
      qos: this._qos,
      retain: this._retain,
      dup: this._dup,
      payload: this._payload,
      ...(this._packetId !== undefined && { packetId: this._packetId }),
      ...(this._properties !== undefined && { properties: this._properties })
    }
  }
}

// -----------------------------------------------------------------------------
// PUBACK/PUBREC/PUBREL/PUBCOMP Builders
// -----------------------------------------------------------------------------

/**
 * Base builder for acknowledgement packets.
 */
class PubAckBaseBuilder<T extends { type: number; packetId: number }> {
  protected readonly packetType: number
  protected readonly id: number
  protected code?: ReasonCode
  protected props?: PubAckProperties

  constructor(type: number, packetId: number) {
    this.packetType = type
    this.id = packetId
  }

  /** Set reason code */
  reasonCode(code: ReasonCode): this {
    this.code = code
    return this
  }

  /** Set success reason code (0x00) */
  success(): this {
    this.code = 0x00
    return this
  }

  /** Set properties */
  properties(props: PubAckProperties): this {
    this.props = props
    return this
  }

  /** Set reason string */
  reasonString(value: string): this {
    this.props = { ...this.props, reasonString: value }
    return this
  }

  /** Add user property */
  userProperty(key: string, value: string): this {
    const existing = this.props?.userProperties ?? []
    this.props = {
      ...this.props,
      userProperties: [...existing, [key, value] as const]
    }
    return this
  }

  /** Build the packet */
  build(): T {
    return {
      type: this.packetType,
      packetId: this.id,
      ...(this.code !== undefined && { reasonCode: this.code }),
      ...(this.props !== undefined && { properties: this.props })
    } as T
  }
}

/** Builder for PUBACK packets */
export class PubackBuilder extends PubAckBaseBuilder<PubackPacket> {
  constructor(packetId: number) {
    super(PacketType.PUBACK, packetId)
  }
}

/** Builder for PUBREC packets */
export class PubrecBuilder extends PubAckBaseBuilder<PubrecPacket> {
  constructor(packetId: number) {
    super(PacketType.PUBREC, packetId)
  }
}

/** Builder for PUBREL packets */
export class PubrelBuilder extends PubAckBaseBuilder<PubrelPacket> {
  constructor(packetId: number) {
    super(PacketType.PUBREL, packetId)
  }
}

/** Builder for PUBCOMP packets */
export class PubcompBuilder extends PubAckBaseBuilder<PubcompPacket> {
  constructor(packetId: number) {
    super(PacketType.PUBCOMP, packetId)
  }
}

// -----------------------------------------------------------------------------
// SUBSCRIBE Builder
// -----------------------------------------------------------------------------

/**
 * Builder for SUBSCRIBE packets.
 */
export class SubscribeBuilder {
  private readonly _packetId: number
  private _subscriptions: Subscription[] = []
  private _properties?: SubscribeProperties

  constructor(packetId: number, topicFilter?: string, options?: Partial<SubscriptionOptions>) {
    this._packetId = packetId
    if (topicFilter !== undefined) {
      this._subscriptions.push({
        topicFilter,
        options: { qos: 0, ...options }
      })
    }
  }

  /** Add a subscription */
  add(topicFilter: string, options: Partial<SubscriptionOptions> = {}): this {
    this._subscriptions.push({
      topicFilter,
      options: { qos: 0, ...options }
    })
    return this
  }

  /** Add a subscription with QoS */
  topic(topicFilter: string, qos: QoS = 0): this {
    return this.add(topicFilter, { qos })
  }

  /** Set no local flag on last subscription */
  noLocal(value = true): this {
    if (this._subscriptions.length > 0) {
      const last = this._subscriptions[this._subscriptions.length - 1]
      this._subscriptions[this._subscriptions.length - 1] = {
        ...last,
        options: { ...last.options, noLocal: value }
      }
    }
    return this
  }

  /** Set retain as published flag on last subscription */
  retainAsPublished(value = true): this {
    if (this._subscriptions.length > 0) {
      const last = this._subscriptions[this._subscriptions.length - 1]
      this._subscriptions[this._subscriptions.length - 1] = {
        ...last,
        options: { ...last.options, retainAsPublished: value }
      }
    }
    return this
  }

  /** Set retain handling on last subscription */
  retainHandling(value: 0 | 1 | 2): this {
    if (this._subscriptions.length > 0) {
      const last = this._subscriptions[this._subscriptions.length - 1]
      this._subscriptions[this._subscriptions.length - 1] = {
        ...last,
        options: { ...last.options, retainHandling: value }
      }
    }
    return this
  }

  /** Set SUBSCRIBE properties */
  properties(props: SubscribeProperties): this {
    this._properties = props
    return this
  }

  /** Set subscription identifier */
  subscriptionId(id: number): this {
    this._properties = { ...this._properties, subscriptionIdentifier: id }
    return this
  }

  /** Add user property */
  userProperty(key: string, value: string): this {
    const existing = this._properties?.userProperties ?? []
    this._properties = {
      ...this._properties,
      userProperties: [...existing, [key, value] as const]
    }
    return this
  }

  /** Build the SUBSCRIBE packet */
  build(): SubscribePacket {
    if (this._subscriptions.length === 0) {
      throw new Error("SUBSCRIBE packet requires at least one subscription")
    }
    return {
      type: PacketType.SUBSCRIBE,
      packetId: this._packetId,
      subscriptions: this._subscriptions,
      ...(this._properties !== undefined && { properties: this._properties })
    }
  }
}

// -----------------------------------------------------------------------------
// SUBACK Builder
// -----------------------------------------------------------------------------

/**
 * Builder for SUBACK packets.
 */
export class SubackBuilder {
  private readonly _packetId: number
  private readonly _reasonCodes: ReasonCode[] = []
  private _properties?: SubackProperties

  constructor(packetId: number) {
    this._packetId = packetId
  }

  /** Add reason code */
  reasonCode(code: ReasonCode): this {
    this._reasonCodes.push(code)
    return this
  }

  /** Add success reason codes for given QoS levels */
  granted(...qosLevels: QoS[]): this {
    this._reasonCodes.push(...qosLevels)
    return this
  }

  /** Add failure reason code (0x80) */
  failed(): this {
    this._reasonCodes.push(0x80)
    return this
  }

  /** Set SUBACK properties */
  properties(props: SubackProperties): this {
    this._properties = props
    return this
  }

  /** Set reason string */
  reasonString(value: string): this {
    this._properties = { ...this._properties, reasonString: value }
    return this
  }

  /** Add user property */
  userProperty(key: string, value: string): this {
    const existing = this._properties?.userProperties ?? []
    this._properties = {
      ...this._properties,
      userProperties: [...existing, [key, value] as const]
    }
    return this
  }

  /** Build the SUBACK packet */
  build(): SubackPacket {
    return {
      type: PacketType.SUBACK,
      packetId: this._packetId,
      reasonCodes: this._reasonCodes,
      ...(this._properties !== undefined && { properties: this._properties })
    }
  }
}

// -----------------------------------------------------------------------------
// UNSUBSCRIBE Builder
// -----------------------------------------------------------------------------

/**
 * Builder for UNSUBSCRIBE packets.
 */
export class UnsubscribeBuilder {
  private readonly _packetId: number
  private readonly _topicFilters: string[] = []
  private _properties?: UnsubscribeProperties

  constructor(packetId: number, topicFilter?: string) {
    this._packetId = packetId
    if (topicFilter !== undefined) {
      this._topicFilters.push(topicFilter)
    }
  }

  /** Add topic filter */
  topic(topicFilter: string): this {
    this._topicFilters.push(topicFilter)
    return this
  }

  /** Set UNSUBSCRIBE properties */
  properties(props: UnsubscribeProperties): this {
    this._properties = props
    return this
  }

  /** Add user property */
  userProperty(key: string, value: string): this {
    const existing = this._properties?.userProperties ?? []
    this._properties = {
      ...this._properties,
      userProperties: [...existing, [key, value] as const]
    }
    return this
  }

  /** Build the UNSUBSCRIBE packet */
  build(): UnsubscribePacket {
    if (this._topicFilters.length === 0) {
      throw new Error("UNSUBSCRIBE packet requires at least one topic filter")
    }
    return {
      type: PacketType.UNSUBSCRIBE,
      packetId: this._packetId,
      topicFilters: this._topicFilters,
      ...(this._properties !== undefined && { properties: this._properties })
    }
  }
}

// -----------------------------------------------------------------------------
// UNSUBACK Builder
// -----------------------------------------------------------------------------

/**
 * Builder for UNSUBACK packets.
 */
export class UnsubackBuilder {
  private readonly _packetId: number
  private _reasonCodes?: ReasonCode[]
  private _properties?: UnsubackProperties

  constructor(packetId: number) {
    this._packetId = packetId
  }

  /** Add reason code */
  reasonCode(code: ReasonCode): this {
    this._reasonCodes = this._reasonCodes ?? []
    this._reasonCodes.push(code)
    return this
  }

  /** Add success reason codes */
  success(count = 1): this {
    this._reasonCodes = this._reasonCodes ?? []
    for (let i = 0; i < count; i++) {
      this._reasonCodes.push(0x00)
    }
    return this
  }

  /** Set UNSUBACK properties */
  properties(props: UnsubackProperties): this {
    this._properties = props
    return this
  }

  /** Set reason string */
  reasonString(value: string): this {
    this._properties = { ...this._properties, reasonString: value }
    return this
  }

  /** Add user property */
  userProperty(key: string, value: string): this {
    const existing = this._properties?.userProperties ?? []
    this._properties = {
      ...this._properties,
      userProperties: [...existing, [key, value] as const]
    }
    return this
  }

  /** Build the UNSUBACK packet */
  build(): UnsubackPacket {
    return {
      type: PacketType.UNSUBACK,
      packetId: this._packetId,
      ...(this._reasonCodes !== undefined && { reasonCodes: this._reasonCodes }),
      ...(this._properties !== undefined && { properties: this._properties })
    }
  }
}

// -----------------------------------------------------------------------------
// PINGREQ / PINGRESP
// -----------------------------------------------------------------------------

/**
 * Build a PINGREQ packet.
 */
export function pingreq(): PingreqPacket {
  return { type: PacketType.PINGREQ }
}

/**
 * Build a PINGRESP packet.
 */
export function pingresp(): PingrespPacket {
  return { type: PacketType.PINGRESP }
}

// -----------------------------------------------------------------------------
// DISCONNECT Builder
// -----------------------------------------------------------------------------

/**
 * Builder for DISCONNECT packets.
 */
export class DisconnectBuilder {
  private _reasonCode?: ReasonCode
  private _properties?: DisconnectProperties

  /** Set reason code */
  reasonCode(code: ReasonCode): this {
    this._reasonCode = code
    return this
  }

  /** Set normal disconnection (0x00) */
  normal(): this {
    this._reasonCode = 0x00
    return this
  }

  /** Set with will message (0x04) */
  withWill(): this {
    this._reasonCode = 0x04
    return this
  }

  /** Set DISCONNECT properties */
  properties(props: DisconnectProperties): this {
    this._properties = props
    return this
  }

  /** Set session expiry interval */
  sessionExpiry(seconds: number): this {
    this._properties = { ...this._properties, sessionExpiryInterval: seconds }
    return this
  }

  /** Set reason string */
  reasonString(value: string): this {
    this._properties = { ...this._properties, reasonString: value }
    return this
  }

  /** Set server reference */
  serverReference(value: string): this {
    this._properties = { ...this._properties, serverReference: value }
    return this
  }

  /** Add user property */
  userProperty(key: string, value: string): this {
    const existing = this._properties?.userProperties ?? []
    this._properties = {
      ...this._properties,
      userProperties: [...existing, [key, value] as const]
    }
    return this
  }

  /** Build the DISCONNECT packet */
  build(): DisconnectPacket {
    return {
      type: PacketType.DISCONNECT,
      ...(this._reasonCode !== undefined && { reasonCode: this._reasonCode }),
      ...(this._properties !== undefined && { properties: this._properties })
    }
  }
}

// -----------------------------------------------------------------------------
// AUTH Builder
// -----------------------------------------------------------------------------

/**
 * Builder for AUTH packets (MQTT 5.0 only).
 */
export class AuthBuilder {
  private _reasonCode: ReasonCode
  private _properties?: AuthProperties

  constructor(reasonCode: ReasonCode = 0x00) {
    this._reasonCode = reasonCode
  }

  /** Set reason code */
  reasonCode(code: ReasonCode): this {
    this._reasonCode = code
    return this
  }

  /** Set success (0x00) */
  success(): this {
    this._reasonCode = 0x00
    return this
  }

  /** Set continue authentication (0x18) */
  continueAuth(): this {
    this._reasonCode = 0x18
    return this
  }

  /** Set re-authenticate (0x19) */
  reAuth(): this {
    this._reasonCode = 0x19
    return this
  }

  /** Set AUTH properties */
  properties(props: AuthProperties): this {
    this._properties = props
    return this
  }

  /** Set authentication method */
  method(value: string): this {
    this._properties = { ...this._properties, authenticationMethod: value }
    return this
  }

  /** Set authentication data */
  data(value: Uint8Array): this {
    this._properties = { ...this._properties, authenticationData: value }
    return this
  }

  /** Set reason string */
  reasonString(value: string): this {
    this._properties = { ...this._properties, reasonString: value }
    return this
  }

  /** Add user property */
  userProperty(key: string, value: string): this {
    const existing = this._properties?.userProperties ?? []
    this._properties = {
      ...this._properties,
      userProperties: [...existing, [key, value] as const]
    }
    return this
  }

  /** Build the AUTH packet */
  build(): AuthPacket {
    return {
      type: PacketType.AUTH,
      reasonCode: this._reasonCode,
      ...(this._properties !== undefined && { properties: this._properties })
    }
  }
}

// -----------------------------------------------------------------------------
// Factory Functions
// -----------------------------------------------------------------------------

/**
 * Create a CONNECT packet builder.
 *
 * @example
 * ```ts
 * const packet = connect().clientId("test").cleanStart().build()
 * ```
 */
export function connect(): ConnectBuilder {
  return new ConnectBuilder()
}

/**
 * Create a CONNACK packet builder.
 *
 * @example
 * ```ts
 * const packet = connack().sessionPresent().reasonCode(0x00).build()
 * ```
 */
export function connack(): ConnackBuilder {
  return new ConnackBuilder()
}

/**
 * Create a PUBLISH packet builder.
 *
 * @example
 * ```ts
 * const packet = publish("sensors/temp").payload("22.5").qos(1).packetId(1).build()
 * ```
 */
export function publish(topic: string): PublishBuilder {
  return new PublishBuilder(topic)
}

/**
 * Create a PUBACK packet builder.
 *
 * @example
 * ```ts
 * const packet = puback(1).success().build()
 * ```
 */
export function puback(packetId: number): PubackBuilder {
  return new PubackBuilder(packetId)
}

/**
 * Create a PUBREC packet builder.
 *
 * @example
 * ```ts
 * const packet = pubrec(1).success().build()
 * ```
 */
export function pubrec(packetId: number): PubrecBuilder {
  return new PubrecBuilder(packetId)
}

/**
 * Create a PUBREL packet builder.
 *
 * @example
 * ```ts
 * const packet = pubrel(1).success().build()
 * ```
 */
export function pubrel(packetId: number): PubrelBuilder {
  return new PubrelBuilder(packetId)
}

/**
 * Create a PUBCOMP packet builder.
 *
 * @example
 * ```ts
 * const packet = pubcomp(1).success().build()
 * ```
 */
export function pubcomp(packetId: number): PubcompBuilder {
  return new PubcompBuilder(packetId)
}

/**
 * Create a SUBSCRIBE packet builder.
 *
 * @example
 * ```ts
 * const packet = subscribe(1, "sensors/#").topic("events/#", 1).build()
 * ```
 */
export function subscribe(
  packetId: number,
  topicFilter?: string,
  options?: Partial<SubscriptionOptions>
): SubscribeBuilder {
  return new SubscribeBuilder(packetId, topicFilter, options)
}

/**
 * Create a SUBACK packet builder.
 *
 * @example
 * ```ts
 * const packet = suback(1).granted(0, 1).build()
 * ```
 */
export function suback(packetId: number): SubackBuilder {
  return new SubackBuilder(packetId)
}

/**
 * Create an UNSUBSCRIBE packet builder.
 *
 * @example
 * ```ts
 * const packet = unsubscribe(1, "sensors/#").topic("events/#").build()
 * ```
 */
export function unsubscribe(packetId: number, topicFilter?: string): UnsubscribeBuilder {
  return new UnsubscribeBuilder(packetId, topicFilter)
}

/**
 * Create an UNSUBACK packet builder.
 *
 * @example
 * ```ts
 * const packet = unsuback(1).success(2).build()
 * ```
 */
export function unsuback(packetId: number): UnsubackBuilder {
  return new UnsubackBuilder(packetId)
}

/**
 * Create a DISCONNECT packet builder.
 *
 * @example
 * ```ts
 * const packet = disconnect().normal().build()
 * ```
 */
export function disconnect(): DisconnectBuilder {
  return new DisconnectBuilder()
}

/**
 * Create an AUTH packet builder (MQTT 5.0 only).
 *
 * @example
 * ```ts
 * const packet = auth().continueAuth().method("SCRAM-SHA-256").build()
 * ```
 */
export function auth(reasonCode?: ReasonCode): AuthBuilder {
  return new AuthBuilder(reasonCode)
}
