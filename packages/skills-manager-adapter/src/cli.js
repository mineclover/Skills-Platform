#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { applyActivationPlan, applyActivationPlanEvents, previewActivationPlan } = require(".");

async function run(argv, { onReport = () => {}, stdout = process.stdout } = {}) {
  const [command, planPath, ...flags] = argv;
  if (!planPath || !["preview", "apply"].includes(command)) {
    throw new Error("Usage: skills-manager-adapter preview|apply <activation-plan.json> [--confirm] [--events]");
  }
  const plan = JSON.parse(await fs.readFile(path.resolve(planPath), "utf8"));
  if (command === "preview") return previewActivationPlan(plan);
  if (flags.includes("--events")) {
    const events = applyActivationPlanEvents(plan, { confirm: flags.includes("--confirm") });
    for await (const event of events) {
      stdout.write(`${JSON.stringify(event)}\n`);
      if (event.type === "complete") onReport(event.report);
    }
    return undefined;
  }
  const report = await applyActivationPlan(plan, { confirm: flags.includes("--confirm") });
  onReport(report);
  return report;
}

async function main(
  argv,
  {
    stdout = process.stdout,
    stderr = process.stderr,
    setExitCode = (code) => { process.exitCode = code; },
    execute = run,
  } = {},
) {
  let failed = false;
  try {
    const result = await execute(argv, {
      stdout,
      onReport: (report) => { if (report?.status === "failed") failed = true; },
    });
    if (result !== undefined) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (failed) setExitCode(1);
    return result;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    if (error.preview) stderr.write(`${JSON.stringify(error.preview, null, 2)}\n`);
    setExitCode(1);
    return undefined;
  }
}

if (require.main === module) {
  void main(process.argv.slice(2));
}

module.exports = { main, run };
