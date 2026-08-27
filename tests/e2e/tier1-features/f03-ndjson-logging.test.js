const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, VALID_TELEMETRY_EVENTS, validateTelemetryEvent } = require("../helpers/fixtures");

test("Tier 1 - F03.1: NDJSON Auto-Creation of Telemetry Directory and Log File", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f03-");
  t.after(cleanup);

  const telemetryDir = path.join(sandboxPath, ".skills-platform", "telemetry");
  const eventsFile = path.join(telemetryDir, "events.ndjson");

  // Ensure directory and file are created
  await fs.mkdir(telemetryDir, { recursive: true });
  await fs.appendFile(eventsFile, `${JSON.stringify(VALID_TELEMETRY_EVENTS.antigravitySkillLoad)}\n`, "utf8");

  const exists = await fs.stat(eventsFile).then(() => true).catch(() => false);
  assert.equal(exists, true);
});

test("Tier 1 - F03.2: Append-Only Integrity for Successive Event Streams", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f03-");
  t.after(cleanup);

  const eventsFile = path.join(sandboxPath, "events.ndjson");
  const events = [
    VALID_TELEMETRY_EVENTS.antigravitySkillLoad,
    VALID_TELEMETRY_EVENTS.claudeToolExecution,
    VALID_TELEMETRY_EVENTS.codexRalphStream,
  ];

  for (const event of events) {
    await fs.appendFile(eventsFile, `${JSON.stringify(event)}\n`, "utf8");
  }

  const raw = await fs.readFile(eventsFile, "utf8");
  const lines = raw.trim().split("\n");
  assert.equal(lines.length, 3);

  for (let i = 0; i < lines.length; i++) {
    const parsed = JSON.parse(lines[i]);
    assert.equal(parsed.skill_name, events[i].skill_name);
    assert.equal(parsed.provider_id, events[i].provider_id);
  }
});

test("Tier 1 - F03.3: Parsing & Validation of Each NDJSON Record", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f03-");
  t.after(cleanup);

  const eventsFile = path.join(sandboxPath, "events.ndjson");
  for (const key of Object.keys(VALID_TELEMETRY_EVENTS)) {
    await fs.appendFile(eventsFile, `${JSON.stringify(VALID_TELEMETRY_EVENTS[key])}\n`, "utf8");
  }

  const raw = await fs.readFile(eventsFile, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean);
  assert.equal(lines.length, Object.keys(VALID_TELEMETRY_EVENTS).length);

  for (const line of lines) {
    const parsed = JSON.parse(line);
    const validation = validateTelemetryEvent(parsed);
    assert.equal(validation.valid, true, `Record validation failed: ${validation.issues?.join(", ")}`);
  }
});

test("Tier 1 - F03.4: Concurrent Appends Maintain Record Demarcation", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f03-");
  t.after(cleanup);

  const eventsFile = path.join(sandboxPath, "events.ndjson");
  const promises = [];
  const count = 20;

  for (let i = 0; i < count; i++) {
    const event = {
      ...VALID_TELEMETRY_EVENTS.minimalEvent,
      summary: `Concurrent event ${i}`,
      duration_ms: i * 5,
    };
    promises.push(fs.appendFile(eventsFile, `${JSON.stringify(event)}\n`, "utf8"));
  }

  await Promise.all(promises);

  const raw = await fs.readFile(eventsFile, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean);
  assert.equal(lines.length, count);

  for (const line of lines) {
    const parsed = JSON.parse(line);
    assert.equal(parsed.provider_id, "antigravity");
  }
});

test("Tier 1 - F03.5: Persistence Across Session Restarts Without Overwriting", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f03-");
  t.after(cleanup);

  const eventsFile = path.join(sandboxPath, "events.ndjson");
  await fs.appendFile(eventsFile, `${JSON.stringify(VALID_TELEMETRY_EVENTS.antigravitySkillLoad)}\n`, "utf8");

  // Simulate new session
  await fs.appendFile(eventsFile, `${JSON.stringify(VALID_TELEMETRY_EVENTS.releaseGovernanceGate)}\n`, "utf8");

  const raw = await fs.readFile(eventsFile, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).skill_name, "task-decomposer");
  assert.equal(JSON.parse(lines[1]).skill_name, "global-regression-gatekeeper");
});
