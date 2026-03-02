/**
 * Constants tests.
 */

import { describe, expect, it } from "vitest"

import {
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
} from "../../constants.js"

describe("constants", () => {
  describe("PacketType [§2.1.2]", () => {
    it("defines all 15 packet types", () => {
      expect(PacketType.CONNECT).toBe(1)
      expect(PacketType.CONNACK).toBe(2)
      expect(PacketType.PUBLISH).toBe(3)
      expect(PacketType.PUBACK).toBe(4)
      expect(PacketType.PUBREC).toBe(5)
      expect(PacketType.PUBREL).toBe(6)
      expect(PacketType.PUBCOMP).toBe(7)
      expect(PacketType.SUBSCRIBE).toBe(8)
      expect(PacketType.SUBACK).toBe(9)
      expect(PacketType.UNSUBSCRIBE).toBe(10)
      expect(PacketType.UNSUBACK).toBe(11)
      expect(PacketType.PINGREQ).toBe(12)
      expect(PacketType.PINGRESP).toBe(13)
      expect(PacketType.DISCONNECT).toBe(14)
      expect(PacketType.AUTH).toBe(15)
    })

    it("has names for all packet types", () => {
      expect(PACKET_TYPE_NAME[PacketType.CONNECT]).toBe("CONNECT")
      expect(PACKET_TYPE_NAME[PacketType.AUTH]).toBe("AUTH")
    })
  })

  describe("PropertyId [§2.2.2.2]", () => {
    it("defines property identifiers", () => {
      expect(PropertyId.PAYLOAD_FORMAT_INDICATOR).toBe(0x01)
      expect(PropertyId.MESSAGE_EXPIRY_INTERVAL).toBe(0x02)
      expect(PropertyId.SESSION_EXPIRY_INTERVAL).toBe(0x11)
      expect(PropertyId.RECEIVE_MAXIMUM).toBe(0x21)
      expect(PropertyId.USER_PROPERTY).toBe(0x26)
    })

    it("has names for all property identifiers", () => {
      expect(PROPERTY_ID_NAME[PropertyId.PAYLOAD_FORMAT_INDICATOR]).toBe("Payload Format Indicator")
      expect(PROPERTY_ID_NAME[PropertyId.USER_PROPERTY]).toBe("User Property")
    })
  })

  describe("REASON_CODE_NAME [§2.4]", () => {
    it("has names for success codes", () => {
      expect(REASON_CODE_NAME[0x00]).toBe("Success")
      expect(REASON_CODE_NAME[0x01]).toBe("Granted QoS 1")
      expect(REASON_CODE_NAME[0x02]).toBe("Granted QoS 2")
    })

    it("has names for error codes", () => {
      expect(REASON_CODE_NAME[0x80]).toBe("Unspecified error")
      expect(REASON_CODE_NAME[0x81]).toBe("Malformed packet")
      expect(REASON_CODE_NAME[0x87]).toBe("Not authorised")
    })
  })

  describe("protocol limits", () => {
    it("defines variable byte integer limits [§2.2.3]", () => {
      expect(MAX_VARIABLE_BYTE_INTEGER).toBe(268_435_455)
      expect(MAX_VARIABLE_BYTE_INTEGER_LENGTH).toBe(4)
    })

    it("defines packet size limits", () => {
      expect(MAX_PACKET_SIZE).toBe(268_435_456) // MAX_VARIABLE_BYTE_INTEGER + 1
      expect(DEFAULT_MAXIMUM_PACKET_SIZE).toBe(MAX_PACKET_SIZE)
    })

    it("defines receive maximum default", () => {
      expect(DEFAULT_RECEIVE_MAXIMUM).toBe(65_535)
    })

    it("defines packet ID limits", () => {
      expect(MIN_PACKET_ID).toBe(1)
      expect(MAX_PACKET_ID).toBe(65_535)
    })

    it("defines topic alias limit", () => {
      expect(MAX_TOPIC_ALIAS).toBe(65_535)
    })
  })
})
