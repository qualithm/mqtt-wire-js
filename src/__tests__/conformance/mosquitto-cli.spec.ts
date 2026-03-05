/**
 * Conformance tests using mosquitto CLI tools.
 *
 * Tests the server-side MqttWire implementation against mosquitto_pub
 * and mosquitto_sub command-line tools.
 *
 * Skipped if mosquitto CLI tools are not installed.
 *
 * @packageDocumentation
 */

import { type ChildProcess, exec, execSync, spawn } from "node:child_process"
import { promisify } from "node:util"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TestServer } from "./test-server.js"

const execAsync = promisify(exec)

/**
 * Check if mosquitto CLI tools are available (sync for module load time).
 */
function hasMosquitto(): boolean {
  try {
    execSync("which mosquitto_pub", { stdio: "ignore" })
    execSync("which mosquitto_sub", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const mosquittoAvailable = hasMosquitto()

describe.runIf(mosquittoAvailable)("mosquitto CLI conformance", () => {
  // server is assigned in beforeEach when tests run
  let server: TestServer = undefined!
  let processes: ChildProcess[] = []

  beforeEach(async () => {
    server = new TestServer()
    await server.start()
  })

  afterEach(async () => {
    // Kill any lingering processes
    for (const p of processes) {
      try {
        p.kill("SIGTERM")
      } catch {
        // Ignore
      }
    }
    processes = []

    await server.stop()
  })

  describe("mosquitto_pub [§3.3]", () => {
    it("publishes QoS 0 message", async () => {
      await execAsync(
        `mosquitto_pub -h 127.0.0.1 -p ${String(server.port)} -t test/mosquitto -m "hello from mosquitto" -q 0`
      )

      await server.waitForPublishes(1)

      expect(server.publishedMessages).toContainEqual({
        topic: "test/mosquitto",
        payload: "hello from mosquitto"
      })
    })

    it("publishes QoS 1 message", async () => {
      await execAsync(
        `mosquitto_pub -h 127.0.0.1 -p ${String(server.port)} -t test/qos1 -m "qos1 message" -q 1`
      )

      await server.waitForPublishes(1)

      expect(server.publishedMessages).toContainEqual({
        topic: "test/qos1",
        payload: "qos1 message"
      })
    })

    it("publishes QoS 2 message", async () => {
      await execAsync(
        `mosquitto_pub -h 127.0.0.1 -p ${String(server.port)} -t test/qos2 -m "qos2 message" -q 2`
      )

      await server.waitForPublishes(1)

      expect(server.publishedMessages).toContainEqual({
        topic: "test/qos2",
        payload: "qos2 message"
      })
    })

    it("publishes retained message", async () => {
      await execAsync(
        `mosquitto_pub -h 127.0.0.1 -p ${String(server.port)} -t test/retained -m "retained" -r`
      )

      await server.waitForPublishes(1)

      const publishEvent = server.events.find((e) => e.type === "publish")
      if (publishEvent?.type === "publish") {
        expect(publishEvent.packet.retain).toBe(true)
      }
    })

    it("publishes with client ID", async () => {
      await execAsync(
        `mosquitto_pub -h 127.0.0.1 -p ${String(server.port)} -i my-mosquitto-client -t test/id -m "with id"`
      )

      await server.waitForEvent("connect")

      const connectEvent = server.events.find((e) => e.type === "connect")
      if (connectEvent?.type === "connect") {
        expect(connectEvent.clientId).toBe("my-mosquitto-client")
      }
    })

    it("publishes with MQTT 5.0 protocol", async () => {
      await execAsync(
        `mosquitto_pub -h 127.0.0.1 -p ${String(server.port)} -V 5 -t test/v5 -m "mqtt5"`
      )

      await server.waitForEvent("connect")

      const connectEvent = server.events.find((e) => e.type === "connect")
      if (connectEvent?.type === "connect") {
        expect(connectEvent.packet.protocolVersion).toBe("5.0")
      }
    })

    it("publishes with MQTT 3.1.1 protocol", async () => {
      await execAsync(
        `mosquitto_pub -h 127.0.0.1 -p ${String(server.port)} -V 311 -t test/v311 -m "mqtt311"`
      )

      await server.waitForEvent("connect")

      const connectEvent = server.events.find((e) => e.type === "connect")
      if (connectEvent?.type === "connect") {
        expect(connectEvent.packet.protocolVersion).toBe("3.1.1")
      }
    })

    it("handles multiple publishes", async () => {
      // mosquitto_pub can send multiple messages
      await execAsync(
        `mosquitto_pub -h 127.0.0.1 -p ${String(server.port)} -t test/multi -m "message 1" -q 0`
      )
      await execAsync(
        `mosquitto_pub -h 127.0.0.1 -p ${String(server.port)} -t test/multi -m "message 2" -q 0`
      )

      await server.waitForPublishes(2)

      expect(server.publishedMessages).toHaveLength(2)
    })
  })

  describe("mosquitto_sub [§3.8]", () => {
    it("subscribes to topic", async () => {
      // Start subscriber in background
      const sub = spawn("mosquitto_sub", [
        "-h",
        "127.0.0.1",
        "-p",
        String(server.port),
        "-t",
        "test/sub",
        "-C",
        "1" // Exit after 1 message
      ])
      processes.push(sub)

      // Wait for subscribe
      await server.waitForEvent("subscribe")

      const subEvent = server.events.find((e) => e.type === "subscribe")
      if (subEvent?.type === "subscribe") {
        expect(subEvent.packet.subscriptions[0].topicFilter).toBe("test/sub")
      }

      // Cleanup
      sub.kill("SIGTERM")
    })

    it("subscribes with QoS level", async () => {
      const sub = spawn("mosquitto_sub", [
        "-h",
        "127.0.0.1",
        "-p",
        String(server.port),
        "-t",
        "test/qos-sub",
        "-q",
        "2",
        "-C",
        "1"
      ])
      processes.push(sub)

      await server.waitForEvent("subscribe")

      const subEvent = server.events.find((e) => e.type === "subscribe")
      if (subEvent?.type === "subscribe") {
        expect(subEvent.packet.subscriptions[0].options.qos).toBe(2)
      }

      sub.kill("SIGTERM")
    })

    it("receives message from server", async () => {
      const received: string[] = []

      const sub = spawn("mosquitto_sub", [
        "-h",
        "127.0.0.1",
        "-p",
        String(server.port),
        "-t",
        "server/push",
        "-C",
        "1"
      ])
      processes.push(sub)

      sub.stdout.on("data", (data: Buffer) => {
        received.push(data.toString().trim())
      })

      // Wait for subscribe
      await server.waitForEvent("subscribe")

      // Small delay to ensure subscription is active
      await new Promise((r) => setTimeout(r, 100))

      // Get any connected client (mosquitto generates random client IDs)
      const wire = server.getAnyConnectedWire()
      if (!wire) {
        throw new Error("no connected clients")
      }

      // Server publishes to subscriber
      await wire.publish("server/push", new TextEncoder().encode("hello subscriber"))

      // Wait for subscriber to receive and exit
      await new Promise<void>((resolve) => {
        sub.on("close", () => {
          resolve()
        })
        setTimeout(resolve, 2000)
      })

      expect(received).toContain("hello subscriber")
    })

    it("subscribes with wildcard #", async () => {
      const sub = spawn("mosquitto_sub", [
        "-h",
        "127.0.0.1",
        "-p",
        String(server.port),
        "-t",
        "test/#",
        "-C",
        "1"
      ])
      processes.push(sub)

      await server.waitForEvent("subscribe")

      const subEvent = server.events.find((e) => e.type === "subscribe")
      if (subEvent?.type === "subscribe") {
        expect(subEvent.packet.subscriptions[0].topicFilter).toBe("test/#")
      }

      sub.kill("SIGTERM")
    })

    it("subscribes with wildcard +", async () => {
      const sub = spawn("mosquitto_sub", [
        "-h",
        "127.0.0.1",
        "-p",
        String(server.port),
        "-t",
        "test/+/data",
        "-C",
        "1"
      ])
      processes.push(sub)

      await server.waitForEvent("subscribe")

      const subEvent = server.events.find((e) => e.type === "subscribe")
      if (subEvent?.type === "subscribe") {
        expect(subEvent.packet.subscriptions[0].topicFilter).toBe("test/+/data")
      }

      sub.kill("SIGTERM")
    })
  })
})
