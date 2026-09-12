const test = require("node:test");
const assert = require("node:assert/strict");
const { main } = require("../src/cli");

async function invoke(args, execute) {
  let stdout = "";
  let stderr = "";
  const exitCode = await main(args, {
    execute,
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  return { exitCode, stdout, stderr };
}

test("CLI prints failed delivery reports intact and returns a nonzero exit code", async () => {
  const failed = { status: "failed", error: "Source approval revoked", results: [] };
  for (const [args, result] of [
    [["recipe", "apply", "recipe.json", "--confirm"], { recipe_id: "recipe", delivery: { applied: false, report: failed } }],
    [["project", "apply", "project", "--confirm"], { applied: false, report: failed }],
    [["apply", "plan.json", "--confirm"], failed],
  ]) {
    const output = await invoke(args, async (received) => { assert.deepEqual(received, args); return result; });
    assert.equal(output.exitCode, 1);
    assert.deepEqual(JSON.parse(output.stdout), result);
    assert.equal(output.stderr, "");
  }
});

test("CLI preserves zero exit codes for successful application and unapplied previews", async () => {
  for (const result of [
    { delivery: { applied: true, report: { status: "completed" } } },
    { delivery: { applied: false, preview: { operations: [] } } },
    { status: "preview", preview: { operations: [] } },
  ]) {
    const output = await invoke(["recipe", "apply", "recipe.json"], async () => result);
    assert.equal(output.exitCode, 0);
    assert.deepEqual(JSON.parse(output.stdout), result);
    assert.equal(output.stderr, "");
  }
});

test("CLI keeps skill validation and thrown-error failures nonzero", async () => {
  const invalid = await invoke(["skill", "validate", "skill"], async () => ({ valid: false, issues: [] }));
  assert.equal(invalid.exitCode, 1);
  assert.equal(JSON.parse(invalid.stdout).valid, false);
  const failed = await invoke(["recipe", "apply"], async () => {
    const error = new Error("Invalid recipe");
    error.issues = [{ field: "skills", message: "must be an array" }];
    throw error;
  });
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.stdout, "");
  assert.match(failed.stderr, /Invalid recipe/);
  assert.match(failed.stderr, /"field": "skills"/);
});
