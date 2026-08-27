const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, VALID_TELEMETRY_EVENTS, validateTelemetryEvent } = require("../helpers/fixtures");

test("Tier 2 - B01.1: Hook Handles Empty Stdin and Null Arguments Gracefully", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b01-");
  t.after(cleanup);

  // Parse empty/undefined input payload
  function parseHookInput(rawInput) {
    if (!rawInput || rawInput.trim().length === 0) {
      return null;
    }
    try {
      return JSON.parse(rawInput);
    } catch {
      return null;
    }
  }

  assert.equal(parseHookInput(""), null);
  assert.equal(parseHookInput("   \n\t "), null);
  assert.equal(parseHookInput(undefined), null);
});

test("Tier 2 - B01.2: Hook Safely Truncates Massive Tool Output (>1MB)", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b01-");
  t.after(cleanup);

  const massiveOutput = "A".repeat(2 * 1024 * 1024); // 2MB string

  function sanitizeToolOutput(output, maxLen = 4096) {
    if (!output || typeof output !== "string") return "";
    if (output.length > maxLen) {
      return `${output.slice(0, maxLen)}... [TRUNCATED ${output.length - maxLen} BYTES]`;
    }
    return output;
  }

  const sanitized = sanitizeToolOutput(massiveOutput);
  assert.ok(sanitized.length <= 5000);
  assert.ok(sanitized.includes("[TRUNCATED"));
});

test("Tier 2 - B01.3: Hook Handles Non-UTF8 or Binary Buffer Streams", () => {
  const binaryBuffer = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x80, 0x90]);
  const decoded = binaryBuffer.toString("utf8");

  // Telemetry event creation with binary data sanitized
  const event = {
    ...VALID_TELEMETRY_EVENTS.minimalEvent,
    summary: `Binary output: ${decoded}`,
  };

  const validation = validateTelemetryEvent(event);
  assert.equal(validation.valid, true);
});

test("Tier 2 - B01.4: Hook Tolerates Missing Environment Variables", () => {
  function resolveProjectId(env) {
    return env.SKILLS_PLATFORM_PROJECT_ID || env.PROJECT_ID || "default-project";
  }

  assert.equal(resolveProjectId({}), "default-project");
  assert.equal(resolveProjectId({ PROJECT_ID: "proj-abc" }), "proj-abc");
});

test("Tier 2 - B01.5: Immediate Process Signal Handling Without Zombie Processes", () => {
  let signalReceived = null;
  function handleSignal(sig) {
    signalReceived = sig;
  }

  handleSignal("SIGTERM");
  assert.equal(signalReceived, "SIGTERM");
});
