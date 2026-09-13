#!/usr/bin/env node

const { main } = require("../src/cli");

const args = process.argv.slice(2);

// Check if help is requested
if (args.includes("--help") || args.includes("-h") || args[0] === "help") {
  main(["hook", "help"]).then((exitCode) => {
    process.exitCode = exitCode;
  });
} else {
  // If first arg is not "hook", prepend "hook"
  const cliArgs = args[0] === "hook" ? args : ["hook", ...args];

  // If no subaction is specified (e.g. `sp-hooks`), default to `list`
  if (cliArgs.length === 1) {
    cliArgs.push("list");
  }

  // If --json is NOT passed, and neither --table nor --format is passed, default to --table for terminal readability
  const hasJson = cliArgs.some((arg) => (
    arg === "--json" ||
    arg === "--json=true" ||
    arg === "--format=json" ||
    (arg === "json" && cliArgs[cliArgs.indexOf(arg) - 1] === "--format")
  ));
  const hasTable = cliArgs.some((arg) => (
    arg === "--table" ||
    arg === "--table=true" ||
    arg === "--format=table" ||
    (arg === "table" && cliArgs[cliArgs.indexOf(arg) - 1] === "--format")
  ));
  if (!hasJson && !hasTable && !cliArgs.includes("--format")) {
    cliArgs.push("--table");
  }

  main(cliArgs).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
