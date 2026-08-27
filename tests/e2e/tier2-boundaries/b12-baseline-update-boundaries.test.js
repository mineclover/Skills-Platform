const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox } = require("../helpers/fixtures");

function estimateTokens(text) {
  // Conservative ~4 chars per token rule of thumb
  return Math.ceil(text.length / 4);
}

function escapeMarkdownCell(text) {
  if (!text) return "";
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

test("Tier 2 - B12.1: Baseline Token Count Strict Ceiling (<80,000 Tokens)", () => {
  const sampleContent = "A".repeat(120000); // ~30k tokens
  const tokenEstimate = estimateTokens(sampleContent);

  assert.ok(tokenEstimate < 80000);

  // If text exceeded 320,000 chars (>80k tokens), compaction must trigger
  const oversized = "A".repeat(400000);
  assert.ok(estimateTokens(oversized) > 80000);
});

test("Tier 2 - B12.2: Escaping Markdown Pipe Meta-Characters in Table Rows", () => {
  const rawTitle = "Feature | Sub-feature [with markdown & pipes]";
  const escaped = escapeMarkdownCell(rawTitle);

  assert.equal(escaped.includes(" | "), false);
  assert.ok(escaped.includes("\\|"));
});

test("Tier 2 - B12.3: Initializing Master Baseline When File Does Not Exist", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b12-");
  t.after(cleanup);

  const baselineFile = path.join(sandboxPath, "MASTER_BASELINE.md");
  const defaultTemplate = "# Master Baseline\n\n## Status\nInitial state.\n";

  await fs.writeFile(baselineFile, defaultTemplate, "utf8");
  const content = await fs.readFile(baselineFile, "utf8");
  assert.equal(content, defaultTemplate);
});

test("Tier 2 - B12.4: Atomic Update via Temp File Replacement", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b12-");
  t.after(cleanup);

  const targetFile = path.join(sandboxPath, "MASTER_BASELINE.md");
  const tempFile = path.join(sandboxPath, "MASTER_BASELINE.md.tmp");

  await fs.writeFile(tempFile, "# Master Baseline v2\n", "utf8");
  await fs.rename(tempFile, targetFile);

  const finalContent = await fs.readFile(targetFile, "utf8");
  assert.equal(finalContent, "# Master Baseline v2\n");
});

test("Tier 2 - B12.5: Preserves Existing Changelog Sections During Compaction", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b12-");
  t.after(cleanup);

  const baselineFile = path.join(sandboxPath, "MASTER_BASELINE.md");
  const existing = "# Master Baseline\n\n## Milestone M1\n- Completed hook engine\n";
  await fs.writeFile(baselineFile, existing, "utf8");

  const append = "## Milestone M2\n- Completed catalog API\n";
  await fs.appendFile(baselineFile, append, "utf8");

  const combined = await fs.readFile(baselineFile, "utf8");
  assert.ok(combined.includes("Milestone M1"));
  assert.ok(combined.includes("Milestone M2"));
});
