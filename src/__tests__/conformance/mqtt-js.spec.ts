/**
 * Conformance tests using mqtt.js client.
 *
 * Tests the server-side MqttWire implementation against a real MQTT client
 * (mqtt.js) to verify protocol conformance.
 *
 * @packageDocumentation
 */

import mqtt, { type MqttClient } from "mqtt"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TestServer } from "./test-server.js"

describe("mqtt.js conformance", () => {
  let server: TestServer
  let client: MqttClient | null = null

  beforeEach(async () => {
    server = new TestServer()
    await server.start()
  })

  afterEach(async () => {
    if (client) {
      await new Promise<void>((resolve) => {
        client!.end(true, () => {
          resolve()
        })
      })
      client = null
    }
    await server.stop()
  })

  describe("CONNECT/CONNACK [§3.1, §3.2]", () => {
    it("accepts MQTT 5.0 connection", async () => {
      client = mqtt.connect(server.url, {
        clientId: "test-mqtt5-client",
        protocolVersion: 5
      })

      await server.waitForEvent("connect")

      expect(server.events).toContainEqual(
        expect.objectContaining({
          type: "connect",
          clientId: "test-mqtt5-client"
        })
      )

      const connectEvent = server.events.find((e) => e.type === "connect")
      if (connectEvent?.type === "connect") {
        expect(connectEvent.packet.protocolVersion).toBe("5.0")
      }
    })

    it("accepts MQTT 3.1.1 connection", async () => {
      client = mqtt.connect(server.url, {
        clientId: "test-mqtt311-client",
        protocolVersion: 4
      })

      await server.waitForEvent("connect")

      const connectEvent = server.events.find((e) => e.type === "connect")
      if (connectEvent?.type === "connect") {
        expect(connectEvent.packet.protocolVersion).toBe("3.1.1")
      }
    })

    it("generates client ID if not provided", async () => {
      client = mqtt.connect(server.url, {
        clientId: "",
        protocolVersion: 5
      })

      await server.waitForEvent("connect")

      const connectEvent = server.events.find((e) => e.type === "connect")
      expect(connectEvent?.type).toBe("connect")
    })

    it("handles cleanStart flag", async () => {
      client = mqtt.connect(server.url, {
        clientId: "clean-start-client",
        protocolVersion: 5,
        clean: true
      })

      await server.waitForEvent("connect")

      const connectEvent = server.events.find((e) => e.type === "connect")
      if (connectEvent?.type === "connect") {
        expect(connectEvent.packet.cleanStart).toBe(true)
      }
    })

    it("handles keepAlive setting", async () => {
      client = mqtt.connect(server.url, {
        clientId: "keepalive-client",
        protocolVersion: 5,
        keepalive: 30
      })

      await server.waitForEvent("connect")

      const connectEvent = server.events.find((e) => e.type === "connect")
      if (connectEvent?.type === "connect") {
        expect(connectEvent.packet.keepAlive).toBe(30)
      }
    })
  })

  describe("PUBLISH [§3.3]", () => {
    it("receives QoS 0 publish", async () => {
      client = mqtt.connect(server.url, {
        clientId: "publish-qos0-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      client.publish("test/topic", "hello world", { qos: 0 })

      await server.waitForPublishes(1)

      expect(server.publishedMessages).toContainEqual({
        topic: "test/topic",
        payload: "hello world"
      })
    })

    it("receives QoS 1 publish with PUBACK", async () => {
      client = mqtt.connect(server.url, {
        clientId: "publish-qos1-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      // QoS 1 publish should complete when PUBACK received
      await new Promise<void>((resolve, reject) => {
        client!.publish("test/qos1", "qos1 message", { qos: 1 }, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

      await server.waitForPublishes(1)

      expect(server.publishedMessages).toContainEqual({
        topic: "test/qos1",
        payload: "qos1 message"
      })
    })

    it("receives QoS 2 publish with full flow", async () => {
      client = mqtt.connect(server.url, {
        clientId: "publish-qos2-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      // QoS 2 publish completes after PUBREC → PUBREL → PUBCOMP
      await new Promise<void>((resolve, reject) => {
        client!.publish("test/qos2", "qos2 message", { qos: 2 }, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

      await server.waitForPublishes(1)

      expect(server.publishedMessages).toContainEqual({
        topic: "test/qos2",
        payload: "qos2 message"
      })
    })

    it("handles retained messages", async () => {
      client = mqtt.connect(server.url, {
        clientId: "publish-retain-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      client.publish("test/retained", "retained message", { qos: 0, retain: true })

      await server.waitForPublishes(1)

      const publishEvent = server.events.find((e) => e.type === "publish")
      if (publishEvent?.type === "publish") {
        expect(publishEvent.packet.retain).toBe(true)
      }
    })
  })

  describe("SUBSCRIBE/SUBACK [§3.8, §3.9]", () => {
    it("handles single topic subscription", async () => {
      client = mqtt.connect(server.url, {
        clientId: "subscribe-single-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      await new Promise<void>((resolve, reject) => {
        client!.subscribe("test/topic", { qos: 1 }, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

      const subEvent = server.events.find((e) => e.type === "subscribe")
      if (subEvent?.type === "subscribe") {
        expect(subEvent.packet.subscriptions).toHaveLength(1)
        expect(subEvent.packet.subscriptions[0].topicFilter).toBe("test/topic")
        expect(subEvent.packet.subscriptions[0].options.qos).toBe(1)
      }
    })

    it("handles wildcard subscriptions", async () => {
      client = mqtt.connect(server.url, {
        clientId: "subscribe-wildcard-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      await new Promise<void>((resolve, reject) => {
        client!.subscribe("test/#", { qos: 0 }, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

      const subEvent = server.events.find((e) => e.type === "subscribe")
      if (subEvent?.type === "subscribe") {
        expect(subEvent.packet.subscriptions[0].topicFilter).toBe("test/#")
      }
    })

    it("handles multiple topic subscription", async () => {
      client = mqtt.connect(server.url, {
        clientId: "subscribe-multi-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      await new Promise<void>((resolve, reject) => {
        client!.subscribe(
          {
            "topic/a": { qos: 0 },
            "topic/b": { qos: 1 },
            "topic/c": { qos: 2 }
          },
          (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          }
        )
      })

      const subEvent = server.events.find((e) => e.type === "subscribe")
      if (subEvent?.type === "subscribe") {
        expect(subEvent.packet.subscriptions).toHaveLength(3)
      }
    })
  })

  describe("UNSUBSCRIBE/UNSUBACK [§3.10, §3.11]", () => {
    it("handles unsubscription", async () => {
      client = mqtt.connect(server.url, {
        clientId: "unsubscribe-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      // Subscribe first
      await new Promise<void>((resolve, reject) => {
        client!.subscribe("test/topic", (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

      // Then unsubscribe
      await new Promise<void>((resolve, reject) => {
        client!.unsubscribe("test/topic", (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

      const unsubEvent = server.events.find((e) => e.type === "unsubscribe")
      if (unsubEvent?.type === "unsubscribe") {
        expect(unsubEvent.packet.topicFilters).toContain("test/topic")
      }
    })
  })

  describe("DISCONNECT [§3.14]", () => {
    it("handles graceful disconnect", async () => {
      client = mqtt.connect(server.url, {
        clientId: "disconnect-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      await new Promise<void>((resolve) => {
        client!.end(false, () => {
          resolve()
        })
      })
      client = null

      await server.waitForEvent("disconnect")

      expect(server.events).toContainEqual(
        expect.objectContaining({
          type: "disconnect",
          clientId: "disconnect-client"
        })
      )
    })
  })

  describe("server-to-client publish", () => {
    it("delivers QoS 0 message to subscribed client", async () => {
      const receivedMessages: { topic: string; payload: string }[] = []

      client = mqtt.connect(server.url, {
        clientId: "receive-qos0-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      client.on("message", (topic, payload) => {
        receivedMessages.push({ topic, payload: payload.toString() })
      })

      await new Promise<void>((resolve, reject) => {
        client!.subscribe("server/messages", { qos: 0 }, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

      // Server sends message to client
      await server.serverPublish("receive-qos0-client", "server/messages", "hello from server")

      // Wait for client to receive
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (receivedMessages.length >= 1) {
            clearInterval(checkInterval)
            resolve()
          }
        }, 50)
        setTimeout(() => {
          clearInterval(checkInterval)
          resolve()
        }, 2000)
      })

      expect(receivedMessages).toContainEqual({
        topic: "server/messages",
        payload: "hello from server"
      })
    })
  })

  describe("MQTT 5.0 features", () => {
    it("handles user properties", async () => {
      client = mqtt.connect(server.url, {
        clientId: "user-props-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      client.publish("test/props", "message with props", {
        qos: 0,
        properties: {
          userProperties: {
            key1: "value1",
            key2: "value2"
          }
        }
      })

      await server.waitForPublishes(1)

      const publishEvent = server.events.find((e) => e.type === "publish")
      if (publishEvent?.type === "publish") {
        expect(publishEvent.packet.properties?.userProperties).toBeDefined()
      }
    })

    it("handles content type property", async () => {
      client = mqtt.connect(server.url, {
        clientId: "content-type-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      client.publish("test/json", JSON.stringify({ data: "test" }), {
        qos: 0,
        properties: {
          contentType: "application/json"
        }
      })

      await server.waitForPublishes(1)

      const publishEvent = server.events.find((e) => e.type === "publish")
      if (publishEvent?.type === "publish") {
        expect(publishEvent.packet.properties?.contentType).toBe("application/json")
      }
    })

    it("handles response topic and correlation data", async () => {
      client = mqtt.connect(server.url, {
        clientId: "request-response-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      const correlationData = Buffer.from("request-123")

      client.publish("request/topic", "request data", {
        qos: 0,
        properties: {
          responseTopic: "response/topic",
          correlationData
        }
      })

      await server.waitForPublishes(1)

      const publishEvent = server.events.find((e) => e.type === "publish")
      if (publishEvent?.type === "publish") {
        expect(publishEvent.packet.properties?.responseTopic).toBe("response/topic")
        expect(publishEvent.packet.properties?.correlationData).toBeDefined()
      }
    })

    it("handles message expiry interval", async () => {
      client = mqtt.connect(server.url, {
        clientId: "expiry-client",
        protocolVersion: 5
      })

      await new Promise<void>((resolve) => {
        client!.on("connect", () => {
          resolve()
        })
      })

      client.publish("test/expiring", "expiring message", {
        qos: 0,
        properties: {
          messageExpiryInterval: 60
        }
      })

      await server.waitForPublishes(1)

      const publishEvent = server.events.find((e) => e.type === "publish")
      if (publishEvent?.type === "publish") {
        expect(publishEvent.packet.properties?.messageExpiryInterval).toBe(60)
      }
    })
  })
})
