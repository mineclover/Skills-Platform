const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createActivationPlan, digestDirectory } = require("@skills-platform/contracts");
const { main } = require("../src/cli");

function outputSink() {
  let content = "";
  return {
    write(chunk) { content += chunk; },
    read() { return content; },
  };
}

function failedReport() {
  return {
    plan_id: "plan_failed",
    completed_at: "2026-09-04T00:00:00.000Z",
    status: "failed",
    rolled_back: true,
    operations: [],
    summary: { applied: 0, skipped: 0, failed: 1, rolled_back: 1 },
  };
}

test("CLI main preserves a non-event failed report and exits with code 1", async () => {
  const stdout = outputSink();
  const stderr = outputSink();
  const exitCodes = [];
  const report = failedReport();
  const result = await main(["apply", "plan.json", "--confirm"], {
    stdout,
    stderr,
    setExitCode: (code) => exitCodes.push(code),
    execute: async (_argv, options) => {
      options.onReport(report);
      return report;
    },
  });

  assert.deepEqual(result, report);
  assert.deepEqual(JSON.parse(stdout.read()), report);
  assert.equal(stderr.read(), "");
  assert.deepEqual(exitCodes, [1]);
});

test("CLI main preserves a failed complete event and exits with code 1 in event mode", async () => {
  const stdout = outputSink();
  const stderr = outputSink();
  const exitCodes = [];
  const report = failedReport();
  const event = { type: "complete", plan_id: report.plan_id, report };
  const result = await main(["apply", "plan.json", "--confirm", "--events"], {
    stdout,
    stderr,
    setExitCode: (code) => exitCodes.push(code),
    execute: async (_argv, options) => {
      options.stdout.write(`${JSON.stringify(event)}\n`);
      options.onReport(report);
      return undefined;
    },
  });

  assert.equal(result, undefined);
  assert.deepEqual(JSON.parse(stdout.read()), event);
  assert.equal(stderr.read(), "");
  assert.deepEqual(exitCodes, [1]);
});

test("CLI main leaves the exit code unchanged for a completed report", async () => {
  const stdout = outputSink();
  const exitCodes = [];
  const report = { ...failedReport(), status: "completed", rolled_back: false, summary: { applied: 1, skipped: 0, failed: 0 } };
  await main(["apply", "plan.json", "--confirm"], {
    stdout,
    setExitCode: (code) => exitCodes.push(code),
    execute: async (_argv, options) => {
      options.onReport(report);
      return report;
    },
  });

  assert.deepEqual(exitCodes, []);
  assert.deepEqual(JSON.parse(stdout.read()), report);
});

test("CLI executable emits a failed report and exits 1 when materialization fails", {
  skip: process.platform === "win32" ? "mkfifo failure fixture is POSIX-only" : false,
}, async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-manager-adapter-cli-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const canonicalPath = path.join(root, "registry", "revisions", "revision_demo", "artifacts", "demo");
  const projectPath = path.join(root, "project");
  const deliveryPath = path.join(projectPath, "skills", "demo");
  await fs.mkdir(canonicalPath, { recursive: true });
  await fs.writeFile(path.join(canonicalPath, "SKILL.md"), "---\nname: demo\ndescription: Demo.\n---\n", "utf8");
  execFileSync("mkfifo", [path.join(canonicalPath, "unsupported.pipe")]);
  const plan = createActivationPlan({
    target: {
      provider_id: "codex",
      scope: "project",
      project_id: "demo",
      project_path: projectPath,
    },
    distribution: { method: "copy" },
    operations: [{
      registry_skill_id: "skill_demo",
      skill_name: "demo",
      source_revision_id: "revision_demo",
      content_digest: await digestDirectory(canonicalPath),
      canonical_path: canonicalPath,
      delivery_path: deliveryPath,
      desired_state: "enabled",
    }],
  });
  const planPath = path.join(root, "plan.json");
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  const execution = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../src/cli.js"), "apply", planPath, "--confirm"],
    { encoding: "utf8" },
  );
  assert.equal(execution.status, 1, execution.stderr);
  assert.equal(execution.stderr, "");
  const report = JSON.parse(execution.stdout);
  assert.equal(report.status, "failed");
  assert.equal(report.rolled_back, false);
  assert.equal(report.state_unchanged, true);
  assert.equal(report.summary.failed, 1);
  assert.match(report.error, /FIFO|pipe/i);
});
