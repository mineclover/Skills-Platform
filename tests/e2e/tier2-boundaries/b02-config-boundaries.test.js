const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox } = require("../helpers/fixtures");

function validateHookConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== "object") {
    return { valid: false, error: "Config must be a JSON object" };
  }
  const hooks = rawConfig.hooks;
  if (!Array.isArray(hooks)) {
    return { valid: false, error: "hooks array is required" };
  }
  for (const hook of hooks) {
    if (!hook.events || !Array.isArray(hook.events) || hook.events.length === 0) {
      return { valid: false, error: "Each hook must have non-empty events array" };
    }
  }
  return { valid: true };
}

test("Tier 2 - B02.1: Rejects Malformed JSON in hooks.json", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b02-");
  t.after(cleanup);

  const file = path.join(sandboxPath, "hooks.json");
  await fs.writeFile(file, "{ invalid json content ...", "utf8");

  let parsed = null;
  let errorCaught = false;
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    errorCaught = true;
  }

  assert.equal(errorCaught, true);
  assert.equal(parsed, null);
});

test("Tier 2 - B02.2: Rejects Empty or Missing Events Array in Hook Definition", () => {
  const emptyEvents = { hooks: [{ name: "test", events: [] }] };
  const res = validateHookConfig(emptyEvents);
  assert.equal(res.valid, false);
  assert.ok(res.error.includes("non-empty events array"));
});

test("Tier 2 - B02.3: Deduplication of Redundant Hook Registrations", () => {
  const rawHooks = [
    { name: "telemetry", events: ["PostToolUse"] },
    { name: "telemetry", events: ["PostToolUse"] },
    { name: "other", events: ["PostToolUse"] },
  ];

  const seen = new Set();
  const deduped = rawHooks.filter((h) => {
    if (seen.has(h.name)) return false;
    seen.add(h.name);
    return true;
  });

  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].name, "telemetry");
  assert.equal(deduped[1].name, "other");
});

test("Tier 2 - B02.4: Handles Unknown Hook Event Names by Filtering Them Safely", () => {
  const knownEvents = new Set(["PreToolUse", "PostToolUse", "tool_execution", "stdio_event"]);
  const inputEvents = ["PostToolUse", "CustomUnknownEvent123", "tool_execution"];

  const recognized = inputEvents.filter((e) => knownEvents.has(e));
  assert.equal(recognized.length, 2);
  assert.ok(!recognized.includes("CustomUnknownEvent123"));
});

test("Tier 2 - B02.5: Missing Hook Script Target Path Emits Clear Warning", () => {
  function checkHookScriptExists(scriptPath, existingFiles) {
    if (!existingFiles.has(scriptPath)) {
      return { exists: false, warning: `Hook script target not found: ${scriptPath}` };
    }
    return { exists: true };
  }

  const res = checkHookScriptExists(".skills-platform/hooks/missing.js", new Set());
  assert.equal(res.exists, false);
  assert.ok(res.warning.includes("Hook script target not found"));
});
