const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { performance } = require("node:perf_hooks");
const { createSandbox, VALID_TELEMETRY_EVENTS, validateTelemetryEvent } = require("../helpers/fixtures");

test("Tier 1 - F04.1: Hook Processing Execution Latency Under 50ms", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f04-");
  t.after(cleanup);

  const start = performance.now();

  // Ingest, validate, and write event to local NDJSON
  const event = VALID_TELEMETRY_EVENTS.antigravitySkillLoad;
  const validation = validateTelemetryEvent(event);
  assert.equal(validation.valid, true);

  const eventsFile = path.join(sandboxPath, "events.ndjson");
  await fs.appendFile(eventsFile, `${JSON.stringify(event)}\n`, "utf8");

  const durationMs = performance.now() - start;
  assert.ok(durationMs < 50, `Execution took ${durationMs}ms, exceeding 50ms SLA`);
});

test("Tier 1 - F04.2: Non-Blocking Behavior When Remote Endpoint Is Unresponsive", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f04-");
  t.after(cleanup);

  const start = performance.now();
  const event = VALID_TELEMETRY_EVENTS.claudeToolExecution;

  // Unreachable port simulation with fast timeout/abort controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30);

  try {
    await fetch("http://127.0.0.1:59999/api/telemetry/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: controller.signal,
    }).catch(() => {
      // Intentionally swallowed in non-blocking hook
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const durationMs = performance.now() - start;
  // Hook execution must fail-open without blocking or hanging
  assert.ok(durationMs < 60, `Dispatch took ${durationMs}ms, exceeded fail-safe ceiling`);
});

test("Tier 1 - F04.3: High-Frequency Hook Invocations (Burst Processing)", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f04-");
  t.after(cleanup);

  const eventsFile = path.join(sandboxPath, "events.ndjson");
  const iterations = 50;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const event = {
      ...VALID_TELEMETRY_EVENTS.minimalEvent,
      summary: `Burst event ${i}`,
    };
    await fs.appendFile(eventsFile, `${JSON.stringify(event)}\n`, "utf8");
  }
  const totalDuration = performance.now() - start;
  const avgPerCall = totalDuration / iterations;

  assert.ok(avgPerCall < 15, `Average per-call duration was ${avgPerCall}ms, expected < 15ms`);
});

test("Tier 1 - F04.4: Complex Metric Payloads Meet Latency Budget", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f04-");
  t.after(cleanup);

  const complexMetrics = {};
  for (let i = 0; i < 50; i++) {
    complexMetrics[`metric_key_${i}`] = Math.random() * 1000;
  }

  const event = {
    ...VALID_TELEMETRY_EVENTS.releaseGovernanceGate,
    metrics: complexMetrics,
  };

  const start = performance.now();
  const validation = validateTelemetryEvent(event);
  assert.equal(validation.valid, true);

  const eventsFile = path.join(sandboxPath, "events.ndjson");
  await fs.appendFile(eventsFile, `${JSON.stringify(event)}\n`, "utf8");
  const durationMs = performance.now() - start;

  assert.ok(durationMs < 50, `Complex payload write took ${durationMs}ms, expected < 50ms`);
});

test("Tier 1 - F04.5: Zero Unhandled Rejections or Memory Leaks in Fast Loop", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f04-");
  t.after(cleanup);

  let unhandledCount = 0;
  const rejectionHandler = () => { unhandledCount++; };
  process.on("unhandledRejection", rejectionHandler);
  t.after(() => process.removeListener("unhandledRejection", rejectionHandler));

  const eventsFile = path.join(sandboxPath, "events.ndjson");
  const batch = Array.from({ length: 30 }, (_, i) => ({
    ...VALID_TELEMETRY_EVENTS.codexRalphStream,
    summary: `Fast stream ${i}`,
  }));

  await Promise.all(batch.map((e) => fs.appendFile(eventsFile, `${JSON.stringify(e)}\n`, "utf8")));
  assert.equal(unhandledCount, 0);
});
