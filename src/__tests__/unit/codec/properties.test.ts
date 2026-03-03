/**
 * Properties encoding and decoding tests.
 *
 * Tests for MQTT 5.0 property building, parsing, encoding, and decoding.
 */

import { describe, expect, it } from "vitest"

import { BinaryReader } from "../../../codec/reader.js"
import { BinaryWriter } from "../../../codec/writer.js"
import { PropertyId } from "../../../constants.js"
import {
  buildAuthProperties,
  buildConnackProperties,
  buildConnectProperties,
  buildDisconnectProperties,
  buildPubAckProperties,
  buildPublishProperties,
  buildSubackProperties,
  buildSubscribeProperties,
  buildUnsubackProperties,
  buildUnsubscribeProperties,
  buildWillProperties,
  calculatePropertiesSize,
  decodeProperties,
  encodeEmptyProperties,
  encodeProperties,
  parseAuthProperties,
  parseConnackProperties,
  parseConnectProperties,
  parseDisconnectProperties,
  parsePubAckProperties,
  parsePublishProperties,
  parseSubackProperties,
  parseSubscribeProperties,
  parseUnsubackProperties,
  parseUnsubscribeProperties,
  parseWillProperties,
  type RawProperties
} from "../../../packets/properties.js"
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
  WillProperties
} from "../../../packets/types.js"

describe("properties", () => {
  describe("calculatePropertiesSize", () => {
    it("returns 0 for empty properties", () => {
      const props: RawProperties = new Map()
      expect(calculatePropertiesSize(props)).toBe(0)
    })

    it("calculates size for byte property", () => {
      const props: RawProperties = new Map([[PropertyId.PAYLOAD_FORMAT_INDICATOR, 1]])
      // 1 byte for property ID + 1 byte for value
      expect(calculatePropertiesSize(props)).toBe(2)
    })

    it("calculates size for uint16 property", () => {
      const props: RawProperties = new Map([[PropertyId.RECEIVE_MAXIMUM, 100]])
      // 1 byte for property ID + 2 bytes for value
      expect(calculatePropertiesSize(props)).toBe(3)
    })

    it("calculates size for uint32 property", () => {
      const props: RawProperties = new Map([[PropertyId.SESSION_EXPIRY_INTERVAL, 3600]])
      // 1 byte for property ID + 4 bytes for value
      expect(calculatePropertiesSize(props)).toBe(5)
    })

    it("calculates size for string property", () => {
      const props: RawProperties = new Map([[PropertyId.CONTENT_TYPE, "text/plain"]])
      // 1 byte for property ID + 2 bytes length + 10 bytes string
      expect(calculatePropertiesSize(props)).toBe(13)
    })

    it("calculates size for binary property", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5])
      const props: RawProperties = new Map([[PropertyId.CORRELATION_DATA, data]])
      // 1 byte for property ID + 2 bytes length + 5 bytes data
      expect(calculatePropertiesSize(props)).toBe(8)
    })

    it("calculates size for user property (string pair)", () => {
      const props: RawProperties = new Map([[PropertyId.USER_PROPERTY, [["key", "value"]]]])
      // 1 byte ID + 2+3 (key) + 2+5 (value) = 13
      expect(calculatePropertiesSize(props)).toBe(13)
    })

    it("calculates size for multiple user properties", () => {
      const props: RawProperties = new Map([
        [
          PropertyId.USER_PROPERTY,
          [
            ["k1", "v1"],
            ["k2", "v2"]
          ]
        ]
      ])
      // 2x (1 byte ID + 2+2 (key) + 2+2 (value)) = 2 * 9 = 18
      expect(calculatePropertiesSize(props)).toBe(18)
    })

    it("calculates size for varint property", () => {
      const props: RawProperties = new Map([[PropertyId.SUBSCRIPTION_IDENTIFIER, [127]]])
      // 1 byte for property ID + 1 byte for varint value (127 fits in 1 byte)
      expect(calculatePropertiesSize(props)).toBe(2)
    })

    it("skips unknown property IDs", () => {
      const props: RawProperties = new Map([[999, 42]])
      expect(calculatePropertiesSize(props)).toBe(0)
    })
  })

  describe("encodeProperties / decodeProperties", () => {
    it("encodes and decodes empty properties", () => {
      const writer = new BinaryWriter()
      encodeEmptyProperties(writer)
      const bytes = writer.toUint8Array()

      expect(bytes.length).toBe(1)
      expect(bytes[0]).toBe(0)

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.size).toBe(0)
      }
    })

    it("round-trips byte property", () => {
      const original: RawProperties = new Map([[PropertyId.MAXIMUM_QOS, 1]])

      const writer = new BinaryWriter()
      encodeProperties(writer, original)
      const bytes = writer.toUint8Array()

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.get(PropertyId.MAXIMUM_QOS)).toBe(1)
      }
    })

    it("round-trips uint16 property", () => {
      const original: RawProperties = new Map([[PropertyId.TOPIC_ALIAS, 42]])

      const writer = new BinaryWriter()
      encodeProperties(writer, original)
      const bytes = writer.toUint8Array()

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.get(PropertyId.TOPIC_ALIAS)).toBe(42)
      }
    })

    it("round-trips uint32 property", () => {
      const original: RawProperties = new Map([[PropertyId.MESSAGE_EXPIRY_INTERVAL, 86400]])

      const writer = new BinaryWriter()
      encodeProperties(writer, original)
      const bytes = writer.toUint8Array()

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.get(PropertyId.MESSAGE_EXPIRY_INTERVAL)).toBe(86400)
      }
    })

    it("round-trips string property", () => {
      const original: RawProperties = new Map([[PropertyId.CONTENT_TYPE, "application/json"]])

      const writer = new BinaryWriter()
      encodeProperties(writer, original)
      const bytes = writer.toUint8Array()

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.get(PropertyId.CONTENT_TYPE)).toBe("application/json")
      }
    })

    it("round-trips binary property", () => {
      const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      const original: RawProperties = new Map([[PropertyId.AUTHENTICATION_DATA, data]])

      const writer = new BinaryWriter()
      encodeProperties(writer, original)
      const bytes = writer.toUint8Array()

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.get(PropertyId.AUTHENTICATION_DATA)).toEqual(data)
      }
    })

    it("round-trips user property (string pair)", () => {
      const original: RawProperties = new Map([[PropertyId.USER_PROPERTY, [["myKey", "myValue"]]]])

      const writer = new BinaryWriter()
      encodeProperties(writer, original)
      const bytes = writer.toUint8Array()

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        const userProps = result.value.get(PropertyId.USER_PROPERTY)
        expect(userProps).toEqual([["myKey", "myValue"]])
      }
    })

    it("round-trips multiple user properties", () => {
      const original: RawProperties = new Map([
        [
          PropertyId.USER_PROPERTY,
          [
            ["key1", "value1"],
            ["key2", "value2"]
          ]
        ]
      ])

      const writer = new BinaryWriter()
      encodeProperties(writer, original)
      const bytes = writer.toUint8Array()

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        const userProps = result.value.get(PropertyId.USER_PROPERTY)
        expect(userProps).toEqual([
          ["key1", "value1"],
          ["key2", "value2"]
        ])
      }
    })

    it("round-trips subscription identifier (varint)", () => {
      const original: RawProperties = new Map([[PropertyId.SUBSCRIPTION_IDENTIFIER, [12345]]])

      const writer = new BinaryWriter()
      encodeProperties(writer, original)
      const bytes = writer.toUint8Array()

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.get(PropertyId.SUBSCRIPTION_IDENTIFIER)).toEqual([12345])
      }
    })

    it("round-trips multiple subscription identifiers", () => {
      const original: RawProperties = new Map([[PropertyId.SUBSCRIPTION_IDENTIFIER, [1, 2, 3]]])

      const writer = new BinaryWriter()
      encodeProperties(writer, original)
      const bytes = writer.toUint8Array()

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.get(PropertyId.SUBSCRIPTION_IDENTIFIER)).toEqual([1, 2, 3])
      }
    })

    it("returns error for unknown property ID", () => {
      // Manually create bytes with unknown property ID (0xFF)
      const bytes = new Uint8Array([
        3, // properties length
        0xff, // unknown property ID
        0x01, // some value byte
        0x02
      ])

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_PROPERTY_ID")
      }
    })

    it("returns error for duplicate non-multiple property", () => {
      // Create bytes with duplicate CONTENT_TYPE property
      const writer = new BinaryWriter()
      writer.writeVariableByteInteger(10) // properties length (approx)
      writer.writeVariableByteInteger(PropertyId.CONTENT_TYPE)
      writer.writeMqttString("a")
      writer.writeVariableByteInteger(PropertyId.CONTENT_TYPE)
      writer.writeMqttString("b")

      // Fix up the length
      const fullBytes = writer.toUint8Array()
      fullBytes[0] = fullBytes.length - 1

      const reader = new BinaryReader(fullBytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("PROTOCOL_ERROR")
      }
    })

    it("returns error for incomplete properties", () => {
      const bytes = new Uint8Array([
        10 // claims 10 bytes follow but nothing does
      ])

      const reader = new BinaryReader(bytes)
      const result = decodeProperties(reader)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe("INCOMPLETE")
      }
    })
  })

  describe("buildConnectProperties / parseConnectProperties", () => {
    it("round-trips all connect properties", () => {
      const original: ConnectProperties = {
        sessionExpiryInterval: 3600,
        receiveMaximum: 100,
        maximumPacketSize: 65536,
        topicAliasMaximum: 10,
        requestResponseInformation: true,
        requestProblemInformation: false,
        authenticationMethod: "SCRAM-SHA-256",
        authenticationData: new Uint8Array([1, 2, 3]),
        userProperties: [["key", "value"]]
      }

      const raw = buildConnectProperties(original)
      const parsed = parseConnectProperties(raw)

      expect(parsed.sessionExpiryInterval).toBe(3600)
      expect(parsed.receiveMaximum).toBe(100)
      expect(parsed.maximumPacketSize).toBe(65536)
      expect(parsed.topicAliasMaximum).toBe(10)
      expect(parsed.requestResponseInformation).toBe(true)
      expect(parsed.requestProblemInformation).toBe(false)
      expect(parsed.authenticationMethod).toBe("SCRAM-SHA-256")
      expect(parsed.authenticationData).toEqual(new Uint8Array([1, 2, 3]))
      expect(parsed.userProperties).toEqual([["key", "value"]])
    })

    it("handles empty connect properties", () => {
      const raw = buildConnectProperties({})
      expect(raw.size).toBe(0)
      const parsed = parseConnectProperties(raw)
      expect(Object.keys(parsed).length).toBe(0)
    })
  })

  describe("buildWillProperties / parseWillProperties", () => {
    it("round-trips all will properties", () => {
      const original: WillProperties = {
        willDelayInterval: 60,
        payloadFormatIndicator: 1,
        messageExpiryInterval: 300,
        contentType: "text/plain",
        responseTopic: "response/topic",
        correlationData: new Uint8Array([4, 5, 6]),
        userProperties: [["will-key", "will-value"]]
      }

      const raw = buildWillProperties(original)
      const parsed = parseWillProperties(raw)

      expect(parsed.willDelayInterval).toBe(60)
      expect(parsed.payloadFormatIndicator).toBe(1)
      expect(parsed.messageExpiryInterval).toBe(300)
      expect(parsed.contentType).toBe("text/plain")
      expect(parsed.responseTopic).toBe("response/topic")
      expect(parsed.correlationData).toEqual(new Uint8Array([4, 5, 6]))
      expect(parsed.userProperties).toEqual([["will-key", "will-value"]])
    })

    it("handles empty will properties", () => {
      const raw = buildWillProperties({})
      expect(raw.size).toBe(0)
    })
  })

  describe("buildConnackProperties / parseConnackProperties", () => {
    it("round-trips all connack properties", () => {
      const original: ConnackProperties = {
        sessionExpiryInterval: 7200,
        receiveMaximum: 50,
        maximumQoS: 1,
        retainAvailable: true,
        maximumPacketSize: 131072,
        assignedClientIdentifier: "assigned-id",
        topicAliasMaximum: 20,
        reasonString: "success",
        wildcardSubscriptionAvailable: true,
        subscriptionIdentifiersAvailable: true,
        sharedSubscriptionAvailable: false,
        serverKeepAlive: 120,
        responseInformation: "response/info",
        serverReference: "other-server",
        authenticationMethod: "PLAIN",
        authenticationData: new Uint8Array([7, 8, 9]),
        userProperties: [["server", "info"]]
      }

      const raw = buildConnackProperties(original)
      const parsed = parseConnackProperties(raw)

      expect(parsed.sessionExpiryInterval).toBe(7200)
      expect(parsed.receiveMaximum).toBe(50)
      expect(parsed.maximumQoS).toBe(1)
      expect(parsed.retainAvailable).toBe(true)
      expect(parsed.maximumPacketSize).toBe(131072)
      expect(parsed.assignedClientIdentifier).toBe("assigned-id")
      expect(parsed.topicAliasMaximum).toBe(20)
      expect(parsed.reasonString).toBe("success")
      expect(parsed.wildcardSubscriptionAvailable).toBe(true)
      expect(parsed.subscriptionIdentifiersAvailable).toBe(true)
      expect(parsed.sharedSubscriptionAvailable).toBe(false)
      expect(parsed.serverKeepAlive).toBe(120)
      expect(parsed.responseInformation).toBe("response/info")
      expect(parsed.serverReference).toBe("other-server")
      expect(parsed.authenticationMethod).toBe("PLAIN")
      expect(parsed.authenticationData).toEqual(new Uint8Array([7, 8, 9]))
      expect(parsed.userProperties).toEqual([["server", "info"]])
    })

    it("handles empty connack properties", () => {
      const raw = buildConnackProperties({})
      expect(raw.size).toBe(0)
    })
  })

  describe("buildPublishProperties / parsePublishProperties", () => {
    it("round-trips all publish properties", () => {
      const original: PublishProperties = {
        payloadFormatIndicator: 1,
        messageExpiryInterval: 600,
        topicAlias: 5,
        responseTopic: "response/pub",
        correlationData: new Uint8Array([10, 11, 12]),
        subscriptionIdentifiers: [1, 2],
        contentType: "application/octet-stream",
        userProperties: [["pub-key", "pub-value"]]
      }

      const raw = buildPublishProperties(original)
      const parsed = parsePublishProperties(raw)

      expect(parsed.payloadFormatIndicator).toBe(1)
      expect(parsed.messageExpiryInterval).toBe(600)
      expect(parsed.topicAlias).toBe(5)
      expect(parsed.responseTopic).toBe("response/pub")
      expect(parsed.correlationData).toEqual(new Uint8Array([10, 11, 12]))
      expect(parsed.subscriptionIdentifiers).toEqual([1, 2])
      expect(parsed.contentType).toBe("application/octet-stream")
      expect(parsed.userProperties).toEqual([["pub-key", "pub-value"]])
    })

    it("handles empty publish properties", () => {
      const raw = buildPublishProperties({})
      expect(raw.size).toBe(0)
    })
  })

  describe("buildPubAckProperties / parsePubAckProperties", () => {
    it("round-trips puback properties", () => {
      const original: PubAckProperties = {
        reasonString: "message received",
        userProperties: [["ack", "info"]]
      }

      const raw = buildPubAckProperties(original)
      const parsed = parsePubAckProperties(raw)

      expect(parsed.reasonString).toBe("message received")
      expect(parsed.userProperties).toEqual([["ack", "info"]])
    })

    it("handles empty puback properties", () => {
      const raw = buildPubAckProperties({})
      expect(raw.size).toBe(0)
    })
  })

  describe("buildSubscribeProperties / parseSubscribeProperties", () => {
    it("round-trips subscribe properties", () => {
      const original: SubscribeProperties = {
        subscriptionIdentifier: 12345,
        userProperties: [["sub", "data"]]
      }

      const raw = buildSubscribeProperties(original)
      const parsed = parseSubscribeProperties(raw)

      expect(parsed.subscriptionIdentifier).toBe(12345)
      expect(parsed.userProperties).toEqual([["sub", "data"]])
    })

    it("handles empty subscribe properties", () => {
      const raw = buildSubscribeProperties({})
      expect(raw.size).toBe(0)
    })
  })

  describe("buildSubackProperties / parseSubackProperties", () => {
    it("round-trips suback properties", () => {
      const original: SubackProperties = {
        reasonString: "subscribed",
        userProperties: [["suback", "info"]]
      }

      const raw = buildSubackProperties(original)
      const parsed = parseSubackProperties(raw)

      expect(parsed.reasonString).toBe("subscribed")
      expect(parsed.userProperties).toEqual([["suback", "info"]])
    })

    it("handles empty suback properties", () => {
      const raw = buildSubackProperties({})
      expect(raw.size).toBe(0)
    })
  })

  describe("buildUnsubscribeProperties / parseUnsubscribeProperties", () => {
    it("round-trips unsubscribe properties", () => {
      const original: UnsubscribeProperties = {
        userProperties: [["unsub", "data"]]
      }

      const raw = buildUnsubscribeProperties(original)
      const parsed = parseUnsubscribeProperties(raw)

      expect(parsed.userProperties).toEqual([["unsub", "data"]])
    })

    it("handles empty unsubscribe properties", () => {
      const raw = buildUnsubscribeProperties({})
      expect(raw.size).toBe(0)
    })
  })

  describe("buildUnsubackProperties / parseUnsubackProperties", () => {
    it("round-trips unsuback properties", () => {
      const original: UnsubackProperties = {
        reasonString: "unsubscribed",
        userProperties: [["unsuback", "info"]]
      }

      const raw = buildUnsubackProperties(original)
      const parsed = parseUnsubackProperties(raw)

      expect(parsed.reasonString).toBe("unsubscribed")
      expect(parsed.userProperties).toEqual([["unsuback", "info"]])
    })

    it("handles empty unsuback properties", () => {
      const raw = buildUnsubackProperties({})
      expect(raw.size).toBe(0)
    })
  })

  describe("buildDisconnectProperties / parseDisconnectProperties", () => {
    it("round-trips disconnect properties", () => {
      const original: DisconnectProperties = {
        sessionExpiryInterval: 0,
        reasonString: "client initiated",
        serverReference: "backup-server",
        userProperties: [["disconnect", "reason"]]
      }

      const raw = buildDisconnectProperties(original)
      const parsed = parseDisconnectProperties(raw)

      expect(parsed.sessionExpiryInterval).toBe(0)
      expect(parsed.reasonString).toBe("client initiated")
      expect(parsed.serverReference).toBe("backup-server")
      expect(parsed.userProperties).toEqual([["disconnect", "reason"]])
    })

    it("handles empty disconnect properties", () => {
      const raw = buildDisconnectProperties({})
      expect(raw.size).toBe(0)
    })
  })

  describe("buildAuthProperties / parseAuthProperties", () => {
    it("round-trips auth properties", () => {
      const original: AuthProperties = {
        authenticationMethod: "SCRAM-SHA-512",
        authenticationData: new Uint8Array([13, 14, 15]),
        reasonString: "continue",
        userProperties: [["auth", "step"]]
      }

      const raw = buildAuthProperties(original)
      const parsed = parseAuthProperties(raw)

      expect(parsed.authenticationMethod).toBe("SCRAM-SHA-512")
      expect(parsed.authenticationData).toEqual(new Uint8Array([13, 14, 15]))
      expect(parsed.reasonString).toBe("continue")
      expect(parsed.userProperties).toEqual([["auth", "step"]])
    })

    it("handles empty auth properties", () => {
      const raw = buildAuthProperties({})
      expect(raw.size).toBe(0)
    })
  })
})
