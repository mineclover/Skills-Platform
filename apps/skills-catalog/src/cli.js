#!/usr/bin/env node
const path = require("node:path");
const {
  createPlanFromRegistry,
  defaultRegistryRoot,
  importLocalSource,
  listRegistrySkills,
} = require(".");

function parseArguments(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const name = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[name] = true;
      continue;
    }
    index += 1;
    if (name === "skill") {
      flags.skill = [...(flags.skill ?? []), next];
    } else {
      flags[name] = next;
    }
  }
  return { positional, flags };
}

function usage() {
  return [
    "Usage:",
    "  skills-catalog import-local <source-path> [--registry <path>] [--skill <name>]...",
    "  skills-catalog list [--registry <path>]",
    "  skills-catalog plan --skill <registry-skill-id>... --provider <id> --delivery-root <path>",
    "      [--registry <path>] [--project-id <id> --project-path <path> | --global] [--copy]",
  ].join("\n");
}

async function run(argv) {
  const { positional, flags } = parseArguments(argv);
  const [command, sourcePath] = positional;
  const registryRoot = path.resolve(flags.registry ?? defaultRegistryRoot());

  if (command === "import-local") {
    if (!sourcePath) throw new Error("import-local requires a source path");
    return importLocalSource({
      registryRoot,
      sourcePath,
      selectedSkillNames: flags.skill ?? [],
    });
  }

  if (command === "list") return listRegistrySkills(registryRoot);

  if (command === "plan") {
    const isGlobal = flags.global === true;
    return createPlanFromRegistry({
      registryRoot,
      skillIds: flags.skill ?? [],
      deliveryRoot: flags["delivery-root"],
      target: {
        project_id: isGlobal ? undefined : flags["project-id"],
        project_path: isGlobal ? undefined : flags["project-path"],
        provider_id: flags.provider,
        scope: isGlobal ? "global" : "project",
      },
      distribution: { method: flags.copy === true ? "copy" : "symlink" },
    });
  }

  throw new Error(usage());
}

if (require.main === module) {
  run(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      if (error.issues) process.stderr.write(`${JSON.stringify(error.issues, null, 2)}\n`);
      process.exitCode = 1;
    });
}

module.exports = { parseArguments, run, usage };
