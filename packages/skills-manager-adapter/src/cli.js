#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { applyActivationPlan, previewActivationPlan } = require(".");

async function run(argv) {
  const [command, planPath, ...flags] = argv;
  if (!planPath || !["preview", "apply"].includes(command)) {
    throw new Error("Usage: skills-manager-adapter preview|apply <activation-plan.json> [--confirm]");
  }
  const plan = JSON.parse(await fs.readFile(path.resolve(planPath), "utf8"));
  if (command === "preview") return previewActivationPlan(plan);
  return applyActivationPlan(plan, { confirm: flags.includes("--confirm") });
}

if (require.main === module) {
  run(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      if (error.preview) process.stderr.write(`${JSON.stringify(error.preview, null, 2)}\n`);
      process.exitCode = 1;
    });
}

module.exports = { run };
