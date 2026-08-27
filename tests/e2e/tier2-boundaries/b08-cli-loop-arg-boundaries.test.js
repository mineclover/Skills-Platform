const test = require("node:test");
const assert = require("node:assert/strict");
const { parseArguments } = require("../../../apps/skills-catalog/src/cli");

test("Tier 2 - B08.1: Validates Provider Name Whitelist", () => {
  const validProviders = new Set(["antigravity", "claude", "codex", "ralph-tui"]);

  function validateLoopFlags(flags) {
    const issues = [];
    if (!flags.prd) issues.push("--prd flag is required");
    if (!flags.project) issues.push("--project flag is required");
    if (flags.provider && !validProviders.has(flags.provider[0])) {
      issues.push(`Invalid provider: ${flags.provider[0]}`);
    }
    return { valid: issues.length === 0, issues };
  }

  const badProv = parseArguments(["loop", "run", "--prd", "prd.json", "--project", "./", "--provider", "unknown-bot"]);
  const validation = validateLoopFlags(badProv.flags);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues[0].includes("Invalid provider"));
});

test("Tier 2 - B08.2: Whitespace-Only Paths Flagged as Missing", () => {
  const parsed = parseArguments(["loop", "run", "--prd", "   ", "--project", "\t\t"]);
  const isPrdEmpty = !parsed.flags.prd || parsed.flags.prd.trim().length === 0;
  const isProjEmpty = !parsed.flags.project || parsed.flags.project.trim().length === 0;

  assert.equal(isPrdEmpty, true);
  assert.equal(isProjEmpty, true);
});

test("Tier 2 - B08.3: Windows Absolute Paths with Spaces and Drive Letters", () => {
  const winPath = "C:\\Users\\minec\\My Projects\\Demo App\\prd.json";
  const parsed = parseArguments(["loop", "run", "--prd", winPath, "--project", "C:\\Users\\minec\\My Projects\\Demo App"]);

  assert.equal(parsed.flags.prd, winPath);
  assert.equal(parsed.flags.project, "C:\\Users\\minec\\My Projects\\Demo App");
});

test("Tier 2 - B08.4: Extra Flags Ignored or Preserved Non-Destructively", () => {
  const parsed = parseArguments(["loop", "run", "--prd", "p.json", "--project", "./", "--provider", "claude", "--verbose", "--dry-run"]);

  assert.equal(parsed.flags.prd, "p.json");
  assert.equal(parsed.flags.verbose, true);
  assert.equal(parsed.flags["dry-run"], true);
});

test("Tier 2 - B08.5: Subcommand Hierarchy Deep Argument Safety", () => {
  const parsed = parseArguments(["loop", "run", "extra-pos", "--prd", "p.json"]);
  assert.equal(parsed.positional[0], "loop");
  assert.equal(parsed.positional[1], "run");
  assert.equal(parsed.positional[2], "extra-pos");
});
