const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function defaultManagerRoot() {
  return path.resolve(__dirname, "..", "..", "skills-manager");
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function defaultInspectorBinary(managerRoot) {
  return path.join(managerRoot, "src-tauri", "target", "debug", `skills-manager-inspect${process.platform === "win32" ? ".exe" : ""}`);
}

function stateSummary(bindings = []) {
  const states = { enabled: 0, disabled: 0, missing: 0, conflict: 0, unavailable: 0 };
  for (const binding of bindings) {
    if (Object.hasOwn(states, binding.state)) states[binding.state] += 1;
  }
  return { total: bindings.length, ...states };
}

function parseInspectorJson(stdout, command) {
  try {
    const firstObject = stdout.indexOf("{");
    const firstArray = stdout.indexOf("[");
    const firstJson = [firstObject, firstArray].filter((index) => index >= 0).sort((left, right) => left - right)[0];
    if (!Number.isInteger(firstJson)) throw new Error("no JSON value found");
    return JSON.parse(stdout.slice(firstJson));
  } catch (error) {
    throw new Error(`Skills Manager inspector returned invalid JSON for ${command}: ${error.message}`);
  }
}

function createSkillsManagerCli({
  managerRoot = process.env.SKILLS_MANAGER_DIR ?? defaultManagerRoot(),
  binaryPath = process.env.SKILLS_MANAGER_INSPECT_PATH,
  fileExists = fs.existsSync,
  execute: executeOverride,
  timeoutMs = 45_000,
} = {}) {
  const executeFile = executeOverride ?? execFileAsync;
  async function run(args) {
    if (!Array.isArray(args) || args.length === 0 || args.some((arg) => typeof arg !== "string" || arg.trim() === "")) {
      throw new Error("Skills Manager CLI arguments must be non-empty strings");
    }
    const resolvedBinary = binaryPath ?? defaultInspectorBinary(managerRoot);
    const usingBinary = fileExists(resolvedBinary);
    // On Windows npm.cmd needs a shell, where the standard npm separator is
    // preserved for the inspector's own option parser.
    const commandArgs = [...args, "--json"];
    const invocationArgs = usingBinary ? commandArgs : ["run", "inspect", "--", ...commandArgs];
    try {
      const { stdout } = await executeFile(usingBinary ? resolvedBinary : npmCommand(), invocationArgs, {
        cwd: managerRoot,
        timeout: timeoutMs,
        windowsHide: true,
        shell: !usingBinary && process.platform === "win32",
        maxBuffer: 2 * 1024 * 1024,
      });
      return parseInspectorJson(stdout, args[0]);
    } catch (error) {
      const detail = error.stderr?.trim() || error.message;
      throw new Error(`Skills Manager ${args[0]} command failed: ${detail}`);
    }
  }

  return {
    execute: run,
    async inspect({ projectId } = {}) {
      if (projectId && !/^[A-Za-z0-9._-]+$/.test(projectId)) throw new Error("Upstream Skills Manager project id contains unsupported shell characters");
      const [inventory, bindings] = await Promise.all([
        run(["providers", ...(projectId ? ["--project", projectId] : [])]),
        run(["bindings", ...(projectId ? ["--project", projectId] : [])]),
      ]);
      return {
        source: "skills-manager-inspect",
        checked_at: new Date().toISOString(),
        scope: projectId ? "project" : "global",
        manager_project_id: projectId ?? null,
        inventory,
        bindings,
        summary: stateSummary(bindings),
      };
    },
  };
}

function createSkillsManagerInspector(options = {}) {
  return createSkillsManagerCli(options);
}

module.exports = { createSkillsManagerCli, createSkillsManagerInspector, stateSummary };
