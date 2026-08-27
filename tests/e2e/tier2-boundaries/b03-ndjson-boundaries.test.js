const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, VALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");

function parseNdjsonSafe(content) {
  const lines = content.split("\n");
  const records = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch (err) {
      errors.push({ lineIndex: i, raw: line, error: err.message });
    }
  }
  return { records, errors };
}

test("Tier 2 - B03.1: Skips Empty and Whitespace-Only Lines", () => {
  const raw = `{"skill_name":"task-1"}\n\n   \n\t\n{"skill_name":"task-2"}\n`;
  const result = parseNdjsonSafe(raw);

  assert.equal(result.records.length, 2);
  assert.equal(result.errors.length, 0);
  assert.equal(result.records[0].skill_name, "task-1");
  assert.equal(result.records[1].skill_name, "task-2");
});

test("Tier 2 - B03.2: Isolates Corrupted or Truncated Trailing Line", () => {
  const raw = `{"skill_name":"task-1"}\n{"skill_name":"task-2"}\n{"incomplete_json":\n`;
  const result = parseNdjsonSafe(raw);

  assert.equal(result.records.length, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].lineIndex, 2);
});

test("Tier 2 - B03.3: Zero-Byte File Returns Empty Records Array", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b03-");
  t.after(cleanup);

  const file = path.join(sandboxPath, "empty.ndjson");
  await fs.writeFile(file, "", "utf8");

  const content = await fs.readFile(file, "utf8");
  const result = parseNdjsonSafe(content);

  assert.equal(result.records.length, 0);
  assert.equal(result.errors.length, 0);
});

test("Tier 2 - B03.4: High-Throughput Write and Read (1,000 Records)", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b03-");
  t.after(cleanup);

  const file = path.join(sandboxPath, "bulk.ndjson");
  const count = 1000;
  const chunk = [];

  for (let i = 0; i < count; i++) {
    chunk.push(JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, id: i }));
  }
  await fs.writeFile(file, `${chunk.join("\n")}\n`, "utf8");

  const content = await fs.readFile(file, "utf8");
  const result = parseNdjsonSafe(content);

  assert.equal(result.records.length, count);
  assert.equal(result.records[999].id, 999);
});

test("Tier 2 - B03.5: UTF-8 Multi-Byte Character and Emoji Preservation", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b03-");
  t.after(cleanup);

  const event = {
    ...VALID_TELEMETRY_EVENTS.minimalEvent,
    summary: "🚀 Multi-agent telemetry 測試 技能 プラットフォーム with special chars: <>&'\"`",
  };

  const file = path.join(sandboxPath, "unicode.ndjson");
  await fs.writeFile(file, `${JSON.stringify(event)}\n`, "utf8");

  const content = await fs.readFile(file, "utf8");
  const result = parseNdjsonSafe(content);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].summary, event.summary);
});
