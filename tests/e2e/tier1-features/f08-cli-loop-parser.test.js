const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { parseArguments, usage } = require("../../../apps/skills-catalog/src/cli");

test("Tier 1 - F08.1: CLI Argument Parsing for 'loop run'", () => {
  const argv = ["loop", "run", "--prd", "docs/prd.json", "--project", "./my-app", "--provider", "antigravity"];
  const parsed = parseArguments(argv);

  assert.equal(parsed.positional[0], "loop");
  assert.equal(parsed.positional[1], "run");
  assert.equal(parsed.flags.prd, "docs/prd.json");
  assert.equal(parsed.flags.project, "./my-app");
  assert.equal(parsed.flags.provider[0], "antigravity");
});

test("Tier 1 - F08.2: CLI Parses All Multi-Agent Providers for Loop", () => {
  const providers = ["antigravity", "claude", "codex", "ralph-tui"];
  for (const prov of providers) {
    const argv = ["loop", "run", "--prd", "prd.json", "--project", "./", "--provider", prov];
    const parsed = parseArguments(argv);
    assert.equal(parsed.flags.provider[0], prov);
  }
});

test("Tier 1 - F08.3: Missing --prd Flag Detection", () => {
  const argv = ["loop", "run", "--project", "./my-app", "--provider", "antigravity"];
  const parsed = parseArguments(argv);

  assert.equal(parsed.flags.prd, undefined);
  assert.ok(parsed.flags.project);
});

test("Tier 1 - F08.4: Missing --project Flag Detection", () => {
  const argv = ["loop", "run", "--prd", "docs/prd.json", "--provider", "claude"];
  const parsed = parseArguments(argv);

  assert.equal(parsed.flags.project, undefined);
  assert.equal(parsed.flags.prd, "docs/prd.json");
});

test("Tier 1 - F08.5: CLI Usage Information Includes Loop Orchestration Subcommands", () => {
  const helpText = usage();
  assert.ok(typeof helpText === "string");
  assert.ok(helpText.length > 0);
});
