import { describe, expect, it } from "vitest"

import { PacketType } from "../../../constants.js"
import {
  auth,
  AuthBuilder,
  connack,
  ConnackBuilder,
  connect,
  disconnect,
  DisconnectBuilder,
  pingreq,
  pingresp,
  puback,
  pubcomp,
  publish,
  PublishBuilder,
  pubrec,
  pubrel,
  suback,
  SubackBuilder,
  subscribe,
  SubscribeBuilder,
  unsuback,
  UnsubackBuilder,
  unsubscribe,
  UnsubscribeBuilder,
  WillBuilder
} from "../../../testing/builders.js"

describe("testing/builders", () => {
  describe("connect", () => {
    it("builds minimal CONNECT packet", () => {
      const packet = connect().build()

      expect(packet.type).toBe(PacketType.CONNECT)
      expect(packet.protocolVersion).toBe("5.0")
      expect(packet.clientId).toBe("")
      expect(packet.cleanStart).toBe(true)
      expect(packet.keepAlive).toBe(60)
    })

    it("builds CONNECT with all options", () => {
      const packet = connect()
        .clientId("test-client")
        .version("3.1.1")
        .cleanStart(false)
        .keepAlive(120)
        .username("user")
        .password("secret")
        .sessionExpiry(3600)
        .receiveMaximum(100)
        .topicAliasMaximum(50)
        .userProperty("key", "value")
        .build()

      expect(packet.clientId).toBe("test-client")
      expect(packet.protocolVersion).toBe("3.1.1")
      expect(packet.cleanStart).toBe(false)
      expect(packet.keepAlive).toBe(120)
      expect(packet.username).toBe("user")
      expect(packet.password).toEqual(new TextEncoder().encode("secret"))
      expect(packet.properties?.sessionExpiryInterval).toBe(3600)
      expect(packet.properties?.receiveMaximum).toBe(100)
      expect(packet.properties?.topicAliasMaximum).toBe(50)
      expect(packet.properties?.userProperties).toEqual([["key", "value"]])
    })

    it("builds CONNECT with will message", () => {
      const packet = connect()
        .clientId("test")
        .withWill("will/topic", "will payload", (w) => w.qos(1).retain().delay(60))
        .build()

      expect(packet.will).toBeDefined()
      expect(packet.will?.topic).toBe("will/topic")
      expect(packet.will?.qos).toBe(1)
      expect(packet.will?.retain).toBe(true)
      expect(packet.will?.properties?.willDelayInterval).toBe(60)
    })
  })

  describe("connack", () => {
    it("builds successful CONNACK", () => {
      const packet = connack().sessionPresent().reasonCode(0x00).build()

      expect(packet.type).toBe(PacketType.CONNACK)
      expect(packet.sessionPresent).toBe(true)
      expect(packet.reasonCode).toBe(0x00)
    })

    it("builds CONNACK with properties", () => {
      const packet = connack()
        .receiveMaximum(100)
        .topicAliasMaximum(50)
        .maximumQoS(1)
        .serverKeepAlive(120)
        .build()

      expect(packet.properties?.receiveMaximum).toBe(100)
      expect(packet.properties?.topicAliasMaximum).toBe(50)
      expect(packet.properties?.maximumQoS).toBe(1)
      expect(packet.properties?.serverKeepAlive).toBe(120)
    })
  })

  describe("publish", () => {
    it("builds QoS 0 PUBLISH", () => {
      const packet = publish("sensors/temp").payload("22.5").build()

      expect(packet.type).toBe(PacketType.PUBLISH)
      expect(packet.topic).toBe("sensors/temp")
      expect(packet.qos).toBe(0)
      expect(packet.payload).toEqual(new TextEncoder().encode("22.5"))
    })

    it("builds QoS 1 PUBLISH with packet ID", () => {
      const packet = publish("topic").qos(1).packetId(1).retain().build()

      expect(packet.qos).toBe(1)
      expect(packet.packetId).toBe(1)
      expect(packet.retain).toBe(true)
    })

    it("builds PUBLISH with properties", () => {
      const packet = publish("topic")
        .topicAlias(1)
        .payloadFormat(1)
        .expiry(3600)
        .contentType("application/json")
        .responseTopic("response/topic")
        .build()

      expect(packet.properties?.topicAlias).toBe(1)
      expect(packet.properties?.payloadFormatIndicator).toBe(1)
      expect(packet.properties?.messageExpiryInterval).toBe(3600)
      expect(packet.properties?.contentType).toBe("application/json")
      expect(packet.properties?.responseTopic).toBe("response/topic")
    })
  })

  describe("puback/pubrec/pubrel/pubcomp", () => {
    it("builds acknowledgement packets", () => {
      const ack = puback(1).success().build()
      const rec = pubrec(2).reasonCode(0x00).build()
      const rel = pubrel(3).build()
      const comp = pubcomp(4).build()

      expect(ack.type).toBe(PacketType.PUBACK)
      expect(ack.packetId).toBe(1)
      expect(rec.type).toBe(PacketType.PUBREC)
      expect(rec.packetId).toBe(2)
      expect(rel.type).toBe(PacketType.PUBREL)
      expect(rel.packetId).toBe(3)
      expect(comp.type).toBe(PacketType.PUBCOMP)
      expect(comp.packetId).toBe(4)
    })

    it("supports reason strings and user properties", () => {
      const packet = puback(1)
        .reasonCode(0x10)
        .reasonString("no matching subscribers")
        .userProperty("key", "value")
        .build()

      expect(packet.reasonCode).toBe(0x10)
      expect(packet.properties?.reasonString).toBe("no matching subscribers")
      expect(packet.properties?.userProperties).toEqual([["key", "value"]])
    })
  })

  describe("subscribe", () => {
    it("builds SUBSCRIBE with single topic", () => {
      const packet = subscribe(1, "sensors/#").build()

      expect(packet.type).toBe(PacketType.SUBSCRIBE)
      expect(packet.packetId).toBe(1)
      expect(packet.subscriptions).toHaveLength(1)
      expect(packet.subscriptions[0].topicFilter).toBe("sensors/#")
    })

    it("builds SUBSCRIBE with multiple topics", () => {
      const packet = subscribe(1).topic("a/#", 0).topic("b/#", 1).topic("c/#", 2).build()

      expect(packet.subscriptions).toHaveLength(3)
      expect(packet.subscriptions[0].options.qos).toBe(0)
      expect(packet.subscriptions[1].options.qos).toBe(1)
      expect(packet.subscriptions[2].options.qos).toBe(2)
    })

    it("supports subscription options", () => {
      const packet = subscribe(1)
        .topic("topic", 1)
        .noLocal()
        .retainAsPublished()
        .retainHandling(1)
        .build()

      const opts = packet.subscriptions[0].options
      expect(opts.noLocal).toBe(true)
      expect(opts.retainAsPublished).toBe(true)
      expect(opts.retainHandling).toBe(1)
    })
  })

  describe("suback", () => {
    it("builds SUBACK with granted QoS", () => {
      const packet = suback(1).granted(0, 1, 2).build()

      expect(packet.type).toBe(PacketType.SUBACK)
      expect(packet.packetId).toBe(1)
      expect(packet.reasonCodes).toEqual([0, 1, 2])
    })

    it("supports failure reason codes", () => {
      const packet = suback(1).granted(1).failed().build()

      expect(packet.reasonCodes).toEqual([1, 0x80])
    })
  })

  describe("unsubscribe", () => {
    it("builds UNSUBSCRIBE with topics", () => {
      const packet = unsubscribe(1, "a/#").topic("b/#").build()

      expect(packet.type).toBe(PacketType.UNSUBSCRIBE)
      expect(packet.packetId).toBe(1)
      expect(packet.topicFilters).toEqual(["a/#", "b/#"])
    })
  })

  describe("unsuback", () => {
    it("builds UNSUBACK with success codes", () => {
      const packet = unsuback(1).success(2).build()

      expect(packet.type).toBe(PacketType.UNSUBACK)
      expect(packet.packetId).toBe(1)
      expect(packet.reasonCodes).toEqual([0x00, 0x00])
    })
  })

  describe("pingreq/pingresp", () => {
    it("builds PING packets", () => {
      const req = pingreq()
      const resp = pingresp()

      expect(req.type).toBe(PacketType.PINGREQ)
      expect(resp.type).toBe(PacketType.PINGRESP)
    })
  })

  describe("disconnect", () => {
    it("builds DISCONNECT packet", () => {
      const packet = disconnect().normal().sessionExpiry(3600).build()

      expect(packet.type).toBe(PacketType.DISCONNECT)
      expect(packet.reasonCode).toBe(0x00)
      expect(packet.properties?.sessionExpiryInterval).toBe(3600)
    })
  })

  describe("auth", () => {
    it("builds AUTH packet", () => {
      const packet = auth().continueAuth().method("SCRAM-SHA-256").build()

      expect(packet.type).toBe(PacketType.AUTH)
      expect(packet.reasonCode).toBe(0x18)
      expect(packet.properties?.authenticationMethod).toBe("SCRAM-SHA-256")
    })

    it("builds AUTH with success", () => {
      const packet = auth().success().build()
      expect(packet.reasonCode).toBe(0x00)
    })

    it("builds AUTH with re-authenticate", () => {
      const packet = auth().reAuth().build()
      expect(packet.reasonCode).toBe(0x19)
    })

    it("builds AUTH with all properties", () => {
      const data = new Uint8Array([1, 2, 3])
      const packet = auth()
        .reasonCode(0x18)
        .properties({ authenticationMethod: "override" })
        .method("SCRAM-SHA-256")
        .data(data)
        .reasonString("auth reason")
        .userProperty("auth-key", "auth-value")
        .build()

      expect(packet.properties?.authenticationMethod).toBe("SCRAM-SHA-256")
      expect(packet.properties?.authenticationData).toEqual(data)
      expect(packet.properties?.reasonString).toBe("auth reason")
      expect(packet.properties?.userProperties).toEqual([["auth-key", "auth-value"]])
    })

    it("creates AuthBuilder with custom reason code", () => {
      const packet = new AuthBuilder(0x19).build()
      expect(packet.reasonCode).toBe(0x19)
    })
  })

  describe("additional connect coverage", () => {
    it("sets connect properties with maxPacketSize", () => {
      const packet = connect().maxPacketSize(65535).build()
      expect(packet.properties?.maximumPacketSize).toBe(65535)
    })

    it("uses ConnectBuilder with properties", () => {
      const packet = connect().properties({ sessionExpiryInterval: 100 }).build()
      expect(packet.properties?.sessionExpiryInterval).toBe(100)
    })

    it("sets will directly", () => {
      const packet = connect()
        .will({
          topic: "direct/will",
          payload: new Uint8Array([1, 2]),
          qos: 1,
          retain: false
        })
        .build()
      expect(packet.will?.topic).toBe("direct/will")
    })
  })

  describe("additional connack coverage", () => {
    it("sets all CONNACK properties", () => {
      const packet = connack()
        .properties({ receiveMaximum: 10 })
        .maxPacketSize(1024)
        .assignedClientId("assigned-id")
        .retainAvailable(true)
        .userProperty("server", "info")
        .build()

      expect(packet.properties?.maximumPacketSize).toBe(1024)
      expect(packet.properties?.assignedClientIdentifier).toBe("assigned-id")
      expect(packet.properties?.retainAvailable).toBe(true)
      expect(packet.properties?.userProperties).toEqual([["server", "info"]])
    })

    it("creates ConnackBuilder directly", () => {
      const packet = new ConnackBuilder().reasonCode(0x87).build()
      expect(packet.reasonCode).toBe(0x87)
    })
  })

  describe("additional publish coverage", () => {
    it("sets all PUBLISH properties", () => {
      const correlationData = new Uint8Array([4, 5, 6])
      const packet = publish("topic")
        .properties({ topicAlias: 5 })
        .correlationData(correlationData)
        .subscriptionId(42)
        .dup()
        .payload(new Uint8Array([1, 2, 3]))
        .build()

      expect(packet.dup).toBe(true)
      expect(packet.properties?.correlationData).toEqual(correlationData)
      expect(packet.properties?.subscriptionIdentifiers).toEqual([42])
      expect(packet.payload).toEqual(new Uint8Array([1, 2, 3]))
    })

    it("creates PublishBuilder directly", () => {
      const packet = new PublishBuilder("test/topic").qos(2).packetId(5).build()
      expect(packet.topic).toBe("test/topic")
      expect(packet.qos).toBe(2)
      expect(packet.packetId).toBe(5)
    })

    it("adds user properties to PUBLISH", () => {
      const packet = publish("topic")
        .userProperty("pub-key-1", "pub-value-1")
        .userProperty("pub-key-2", "pub-value-2")
        .build()

      expect(packet.properties?.userProperties).toEqual([
        ["pub-key-1", "pub-value-1"],
        ["pub-key-2", "pub-value-2"]
      ])
    })
  })

  describe("additional subscribe coverage", () => {
    it("sets SUBSCRIBE properties", () => {
      const packet = subscribe(1)
        .properties({ subscriptionIdentifier: 100 })
        .subscriptionId(200)
        .userProperty("sub-key", "sub-value")
        .topic("test/#", 1)
        .build()

      expect(packet.properties?.subscriptionIdentifier).toBe(200)
      expect(packet.properties?.userProperties).toEqual([["sub-key", "sub-value"]])
    })

    it("creates SubscribeBuilder directly", () => {
      const packet = new SubscribeBuilder(5, "initial/#").topic("second/#", 2).build()
      expect(packet.packetId).toBe(5)
      expect(packet.subscriptions).toHaveLength(2)
    })

    it("allows empty initial topic then add via topic()", () => {
      const packet = new SubscribeBuilder(1).topic("added/#", 1).build()
      expect(packet.subscriptions).toHaveLength(1)
    })

    it("throws when no subscriptions provided", () => {
      expect(() => new SubscribeBuilder(1).build()).toThrow(
        "SUBSCRIBE packet requires at least one subscription"
      )
    })
  })

  describe("additional suback coverage", () => {
    it("sets SUBACK properties", () => {
      const packet = suback(1)
        .properties({ reasonString: "suback reason" })
        .reasonString("override")
        .userProperty("suback-key", "suback-value")
        .granted(1)
        .build()

      expect(packet.properties?.reasonString).toBe("override")
      expect(packet.properties?.userProperties).toEqual([["suback-key", "suback-value"]])
    })

    it("creates SubackBuilder directly", () => {
      const packet = new SubackBuilder(10).granted(0, 1).build()
      expect(packet.packetId).toBe(10)
      expect(packet.reasonCodes).toEqual([0, 1])
    })

    it("adds reason codes individually", () => {
      const packet = suback(1).reasonCode(0x00).reasonCode(0x01).reasonCode(0x80).build()
      expect(packet.reasonCodes).toEqual([0x00, 0x01, 0x80])
    })
  })

  describe("additional unsubscribe coverage", () => {
    it("sets UNSUBSCRIBE properties", () => {
      const packet = unsubscribe(1, "first/#")
        .properties({ userProperties: [["init", "value"]] })
        .userProperty("unsub-key", "unsub-value")
        .build()

      expect(packet.properties?.userProperties).toEqual([
        ["init", "value"],
        ["unsub-key", "unsub-value"]
      ])
    })

    it("creates UnsubscribeBuilder directly", () => {
      const packet = new UnsubscribeBuilder(20).topic("a/#").topic("b/#").build()
      expect(packet.packetId).toBe(20)
      expect(packet.topicFilters).toEqual(["a/#", "b/#"])
    })

    it("throws when no topics provided", () => {
      expect(() => new UnsubscribeBuilder(1).build()).toThrow(
        "UNSUBSCRIBE packet requires at least one topic filter"
      )
    })
  })

  describe("additional unsuback coverage", () => {
    it("sets UNSUBACK properties", () => {
      const packet = unsuback(1)
        .properties({ reasonString: "unsuback reason" })
        .reasonString("override")
        .userProperty("unsuback-key", "unsuback-value")
        .reasonCode(0x11)
        .build()

      expect(packet.properties?.reasonString).toBe("override")
      expect(packet.properties?.userProperties).toEqual([["unsuback-key", "unsuback-value"]])
      expect(packet.reasonCodes).toEqual([0x11])
    })

    it("creates UnsubackBuilder directly", () => {
      const packet = new UnsubackBuilder(30).success(3).build()
      expect(packet.packetId).toBe(30)
      expect(packet.reasonCodes).toEqual([0x00, 0x00, 0x00])
    })
  })

  describe("additional disconnect coverage", () => {
    it("sets all DISCONNECT properties", () => {
      const packet = disconnect()
        .withWill()
        .properties({ sessionExpiryInterval: 100 })
        .reasonString("disconnect reason")
        .serverReference("other.server.com")
        .userProperty("disc-key", "disc-value")
        .build()

      expect(packet.reasonCode).toBe(0x04)
      expect(packet.properties?.reasonString).toBe("disconnect reason")
      expect(packet.properties?.serverReference).toBe("other.server.com")
      expect(packet.properties?.userProperties).toEqual([["disc-key", "disc-value"]])
    })

    it("sets reason code directly", () => {
      const packet = disconnect().reasonCode(0x81).build()
      expect(packet.reasonCode).toBe(0x81)
    })

    it("creates DisconnectBuilder directly", () => {
      const packet = new DisconnectBuilder().normal().build()
      expect(packet.reasonCode).toBe(0x00)
    })
  })

  describe("WillBuilder coverage", () => {
    it("creates WillBuilder directly with all options", () => {
      const correlationData = new Uint8Array([7, 8, 9])
      const will = new WillBuilder("will/topic", new Uint8Array([1, 2, 3]))
        .qos(2)
        .retain(true)
        .properties({ willDelayInterval: 10 })
        .delay(60)
        .expiry(3600)
        .contentType("text/plain")
        .responseTopic("response/will")
        .correlationData(correlationData)
        .build()

      expect(will.topic).toBe("will/topic")
      expect(will.payload).toEqual(new Uint8Array([1, 2, 3]))
      expect(will.qos).toBe(2)
      expect(will.retain).toBe(true)
      expect(will.properties?.willDelayInterval).toBe(60)
      expect(will.properties?.messageExpiryInterval).toBe(3600)
      expect(will.properties?.contentType).toBe("text/plain")
      expect(will.properties?.responseTopic).toBe("response/will")
      expect(will.properties?.correlationData).toEqual(correlationData)
    })
  })

  describe("puback/pubrec/pubrel/pubcomp additional coverage", () => {
    it("sets properties directly on puback", () => {
      const packet = puback(1).properties({ reasonString: "puback reason" }).build()
      expect(packet.properties?.reasonString).toBe("puback reason")
    })

    it("sets properties directly on pubrec", () => {
      const packet = pubrec(2).properties({ reasonString: "pubrec reason" }).build()
      expect(packet.properties?.reasonString).toBe("pubrec reason")
    })

    it("sets properties and reason on pubrel", () => {
      const packet = pubrel(3)
        .success()
        .reasonString("pubrel reason")
        .userProperty("rel-key", "rel-value")
        .build()

      expect(packet.reasonCode).toBe(0x00)
      expect(packet.properties?.reasonString).toBe("pubrel reason")
      expect(packet.properties?.userProperties).toEqual([["rel-key", "rel-value"]])
    })

    it("sets properties and reason on pubcomp", () => {
      const packet = pubcomp(4)
        .success()
        .reasonString("pubcomp reason")
        .userProperty("comp-key", "comp-value")
        .build()

      expect(packet.reasonCode).toBe(0x00)
      expect(packet.properties?.reasonString).toBe("pubcomp reason")
      expect(packet.properties?.userProperties).toEqual([["comp-key", "comp-value"]])
    })
  })
})
