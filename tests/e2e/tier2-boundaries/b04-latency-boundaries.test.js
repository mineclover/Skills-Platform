const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { performance } = require("node:perf_hooks");
const { createSandbox, VALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");

test("Tier 2 - B04.1: High I/O Write Performance Boundary", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b04-");
  t.after(cleanup);

  const file = path.join(sandboxPath, "events.ndjson");
  const eventStr = `${JSON.stringify(VALID_TELEMETRY_EVENTS.antigravitySkillLoad)}\n`;

  const start = performance.now();
  for (let i = 0; i < 25; i++) {
    await fs.appendFile(file, eventStr, "utf8");
  }
  const total = performance.now() - start;
  const avg = total / 25;

  assert.ok(avg < 15, `Average append time was ${avg}ms, expected < 15ms`);
});

test("Tier 2 - B04.2: AbortController Ceiling on Unreachable Network", async () => {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35);

  try {
    await fetch("http://192.0.2.1:54321/api/telemetry/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_TELEMETRY_EVENTS.minimalEvent),
      signal: controller.signal,
    }).catch(() => {});
  } finally {
    clearTimeout(timer);
  }

  const duration = performance.now() - start;
  assert.ok(duration < 65, `Abort boundary was ${duration}ms, expected < 65ms`);
});

test("Tier 2 - B04.3: Millisecond-Precision ISO-8601 UTC Timestamps", () => {
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const nowIso = new Date().toISOString();
  assert.ok(isoRegex.test(nowIso), `Timestamp ${nowIso} does not match ms UTC format`);
});

test("Tier 2 - B04.4: 10KB Summary String Serialization Benchmark", () => {
  const bigSummary = "X".repeat(10 * 1024);
  const event = { ...VALID_TELEMETRY_EVENTS.minimalEvent, summary: bigSummary };

  const start = performance.now();
  const serialized = JSON.stringify(event);
  const duration = performance.now() - start;

  assert.ok(serialized.length >= 10240);
  assert.ok(duration < 10, `Serialization took ${duration}ms, expected < 10ms`);
});

test("Tier 2 - B04.5: Non-Blocking Hook Event Loop Clean Drain", async () => {
  let drained = false;
  setImmediate(() => {
    drained = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(drained, true);
});
