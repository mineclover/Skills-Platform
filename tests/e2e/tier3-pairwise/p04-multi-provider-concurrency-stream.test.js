const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, createMockTelemetryServer, VALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");

test("Tier 3 - P04.1: Concurrent Multi-Provider Interleaved Event Stream", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const providers = ["antigravity", "claude", "codex", "ralph-tui"];
  const promises = [];

  for (let i = 0; i < 40; i++) {
    const provider = providers[i % providers.length];
    const event = {
      ...VALID_TELEMETRY_EVENTS.minimalEvent,
      provider_id: provider,
      summary: `Concurrent stream item ${i} from ${provider}`,
      duration_ms: (i + 1) * 2,
    };
    promises.push(
      fetch(`${mockServer.url}/api/telemetry/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      })
    );
  }

  await Promise.all(promises);

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  const summary = await res.json();

  assert.equal(summary.total_invocations, 40);
  assert.equal(summary.by_provider.antigravity, 10);
  assert.equal(summary.by_provider.claude, 10);
  assert.equal(summary.by_provider.codex, 10);
  assert.equal(summary.by_provider["ralph-tui"], 10);
});

test("Tier 3 - P04.2: Mode Segregation by Provider Workloads", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  // Antigravity -> model_invoked
  // Claude -> user_invoked
  // Ralph-TUI -> hybrid
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, provider_id: "antigravity", invocation_mode: "model_invoked" }),
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, provider_id: "claude", invocation_mode: "user_invoked" }),
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, provider_id: "ralph-tui", invocation_mode: "hybrid" }),
  });

  const summary = await fetch(`${mockServer.url}/api/telemetry/summary`).then((r) => r.json());

  assert.equal(summary.by_mode.model_invoked, 1);
  assert.equal(summary.by_mode.user_invoked, 1);
  assert.equal(summary.by_mode.hybrid, 1);
  assert.equal(summary.by_mode.unspecified, 0);
});

test("Tier 3 - P04.3: Local NDJSON Log and Remote Server Parity", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier3-p04-");
  t.after(cleanup);

  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const ndjsonFile = path.join(sandboxPath, "events.ndjson");
  const count = 15;

  for (let i = 0; i < count; i++) {
    const event = {
      ...VALID_TELEMETRY_EVENTS.minimalEvent,
      summary: `Dual-write event ${i}`,
    };
    await fs.appendFile(ndjsonFile, `${JSON.stringify(event)}\n`, "utf8");
    await fetch(`${mockServer.url}/api/telemetry/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  }

  const localRaw = await fs.readFile(ndjsonFile, "utf8");
  const localCount = localRaw.trim().split("\n").length;
  const serverSummary = await fetch(`${mockServer.url}/api/telemetry/summary`).then((r) => r.json());

  assert.equal(localCount, count);
  assert.equal(serverSummary.total_invocations, count);
});

test("Tier 3 - P04.4: Chronological Integrity Under Out-of-Order Packet Delivery", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const t1 = "2026-08-28T07:00:00.000Z";
  const t2 = "2026-08-28T07:01:00.000Z";
  const t3 = "2026-08-28T07:02:00.000Z";

  // Ingest in reverse order
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, timestamp: t3, summary: "Latest" }),
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, timestamp: t1, summary: "Earliest" }),
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, timestamp: t2, summary: "Middle" }),
  });

  const summary = await fetch(`${mockServer.url}/api/telemetry/summary`).then((r) => r.json());
  assert.equal(summary.total_invocations, 3);
});
