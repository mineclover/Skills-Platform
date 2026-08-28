#!/usr/bin/env node
/**
 * Scope Boundary Enforcer (post_tool_use / pre_tool_use, priority 20)
 * 
 * Audits file modifications against VerticalTopicSpec.local_horizontal_scope:
 * - owned_files: Allowed mutable files for current topic
 * - out_of_bounds: Explicitly prohibited files for current topic
 * 
 * Emits drift telemetry and rejection diagnostics when boundary is breached.
 * 
 * Zero external dependencies.
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * Normalizes file paths for cross-platform comparison.
 */
function normalizePath(filePath, projectRoot = process.cwd()) {
  if (!filePath || typeof filePath !== "string") return "";

  let cleaned = filePath.trim();
  // Strip file:// prefix if present
  if (cleaned.startsWith("file:///")) {
    cleaned = cleaned.slice(8);
  } else if (cleaned.startsWith("file://")) {
    cleaned = cleaned.slice(7);
  }

  // Convert Windows backslashes to standard forward slashes
  cleaned = cleaned.replace(/\\/g, "/");

  // If absolute path within project root, make relative
  const normProjectRoot = projectRoot.replace(/\\/g, "/");
  if (cleaned.toLowerCase().startsWith(normProjectRoot.toLowerCase() + "/")) {
    cleaned = cleaned.slice(normProjectRoot.length + 1);
  }

  // Remove leading ./ or /
  cleaned = cleaned.replace(/^\.?\//, "");

  return cleaned;
}

/**
 * Checks if a target file matches a spec pattern (exact match or glob-style).
 */
function matchPattern(targetFile, pattern) {
  const normTarget = normalizePath(targetFile);
  const normPattern = normalizePath(pattern);

  if (!normTarget || !normPattern) return false;

  // Exact normalized match
  if (normTarget.toLowerCase() === normPattern.toLowerCase()) {
    return true;
  }

  // Suffix / basename match if pattern is relative
  if (normTarget.toLowerCase().endsWith("/" + normPattern.toLowerCase())) {
    return true;
  }

  // Extension wildcard matching across subdirectories (e.g. "*.env", "*.secret", "*.pem")
  if (normPattern.startsWith("*.") && !normPattern.includes("/")) {
    const ext = normPattern.slice(1).toLowerCase();
    if (normTarget.toLowerCase().endsWith(ext)) {
      return true;
    }
  }

  // Wildcard support (e.g. "src/auth/*", "packages/core/**", "src/**/*.js")
  if (normPattern.includes("*")) {
    let patternForRegex = normPattern;
    if (!normPattern.includes("/")) {
      patternForRegex = "**/" + normPattern;
    }

    const regexStr = "^" + patternForRegex
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "___GLOBSTAR___")
      .replace(/\*/g, "[^/]*")
      .replace(/___GLOBSTAR___\//g, "(?:.*/)?")
      .replace(/___GLOBSTAR___/g, ".*") + "$";

    const regex = new RegExp(regexStr, "i");
    return regex.test(normTarget);
  }

  return false;
}

/**
 * Resolves active VerticalTopicSpec.
 */
function loadTopicSpec(payload = {}, projectRoot = process.cwd()) {
  // 1. Direct spec in payload
  if (payload.spec && typeof payload.spec === "object") {
    return payload.spec;
  }
  if (payload.topic_spec && typeof payload.topic_spec === "object") {
    return payload.topic_spec;
  }

  // 2. Custom spec path via environment
  if (process.env.TOPIC_SPEC_PATH) {
    const customPath = path.isAbsolute(process.env.TOPIC_SPEC_PATH)
      ? process.env.TOPIC_SPEC_PATH
      : path.resolve(projectRoot, process.env.TOPIC_SPEC_PATH);
    if (fs.existsSync(customPath)) {
      try {
        return JSON.parse(fs.readFileSync(customPath, "utf8"));
      } catch {
        // invalid json
      }
    }
  }

  // 3. Standard location: .skills-platform/specs/current_topic.json
  const defaultSpecPath = path.resolve(projectRoot, ".skills-platform", "specs", "current_topic.json");
  if (fs.existsSync(defaultSpecPath)) {
    try {
      return JSON.parse(fs.readFileSync(defaultSpecPath, "utf8"));
    } catch {
      // invalid json
    }
  }

  return null;
}

/**
 * Extracts target mutated file paths from tool payload.
 */
function extractTargetFiles(payload) {
  const files = [];
  if (!payload) return files;

  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      files.push(...extractTargetFiles(parsed));
    } catch {
      // string payload
    }
    return files;
  }

  if (typeof payload === "object") {
    if (typeof payload.TargetFile === "string") files.push(payload.TargetFile);
    if (typeof payload.targetFile === "string") files.push(payload.targetFile);
    if (typeof payload.target_file === "string") files.push(payload.target_file);
    if (typeof payload.AbsolutePath === "string") files.push(payload.AbsolutePath);
    if (typeof payload.absolutePath === "string") files.push(payload.absolutePath);
    if (typeof payload.path === "string") files.push(payload.path);
    if (typeof payload.file === "string") files.push(payload.file);
    if (typeof payload.filePath === "string") files.push(payload.filePath);

    if (Array.isArray(payload.files)) {
      for (const f of payload.files) {
        if (typeof f === "string") files.push(f);
      }
    }

    if (payload.parameters && typeof payload.parameters === "object") {
      files.push(...extractTargetFiles(payload.parameters));
    }
  }

  return files;
}

/**
 * Appends a drift telemetry event to the project NDJSON log if available.
 */
function recordDriftTelemetry(driftEvent, projectRoot = process.cwd()) {
  try {
    const telemetryDir = path.resolve(projectRoot, ".skills-platform", "telemetry");
    fs.mkdirSync(telemetryDir, { recursive: true });
    const logPath = path.resolve(telemetryDir, "events.ndjson");
    const entry = {
      timestamp: new Date().toISOString(),
      provider_id: process.env.SKILLS_PROVIDER_ID || "antigravity",
      outcome: "scope_mismatch",
      evidence_type: "incident",
      summary: `Scope boundary violation detected on file: ${driftEvent.mutated_file}`,
      ...driftEvent,
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Non-blocking telemetry recording
  }
}

/**
 * Evaluates the payload against topic scope boundary definitions.
 * 
 * @param {object|string} payload 
 * @param {object} [options]
 * @returns {{ allow: boolean, reason?: string, self_correct_hint?: string, violation_type?: string, topic_id?: string, mutated_file?: string }}
 */
function evaluateScopeBoundaryEnforcer(payload, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const spec = options.spec || loadTopicSpec(payload, projectRoot);

  if (!spec || !spec.local_horizontal_scope) {
    // No active topic scope restriction loaded -> pass through
    return { allow: true, decision: "allow" };
  }

  const topicId = spec.topic_id || spec.id || "unspecified-topic";
  const ownedFiles = Array.isArray(spec.local_horizontal_scope.owned_files)
    ? spec.local_horizontal_scope.owned_files
    : [];
  const outOfBounds = Array.isArray(spec.local_horizontal_scope.out_of_bounds)
    ? spec.local_horizontal_scope.out_of_bounds
    : [];

  const targetFiles = options.targetFiles || extractTargetFiles(payload);
  if (targetFiles.length === 0) {
    return { allow: true, decision: "allow" };
  }

  for (const rawFile of targetFiles) {
    const normalizedTarget = normalizePath(rawFile, projectRoot);

    // Check 1: Strictly prohibited out_of_bounds
    for (const forbiddenPattern of outOfBounds) {
      if (matchPattern(normalizedTarget, forbiddenPattern)) {
        const violation = {
          allow: false,
          decision: "block",
          reason: `Scope boundary violation: file '${normalizedTarget}' is strictly in prohibited out_of_bounds list for topic '${topicId}'`,
          self_correct_hint: `Topic '${topicId}' restricts file mutations to owned files: [${ownedFiles.join(", ")}]. Revert edits to out-of-bounds files.`,
          violation_type: "scope_out_of_bounds",
          topic_id: topicId,
          mutated_file: normalizedTarget,
        };
        recordDriftTelemetry(violation, projectRoot);
        return violation;
      }
    }

    // Check 2: If owned_files is defined and restricted
    if (ownedFiles.length > 0) {
      const isOwned = ownedFiles.some((ownedPattern) => matchPattern(normalizedTarget, ownedPattern));
      if (!isOwned) {
        const violation = {
          allow: false,
          decision: "block",
          reason: `Scope boundary violation: file '${normalizedTarget}' is not in owned_files list for topic '${topicId}'`,
          self_correct_hint: `Topic '${topicId}' restricts file mutations to owned files: [${ownedFiles.join(", ")}].`,
          violation_type: "scope_unowned_file",
          topic_id: topicId,
          mutated_file: normalizedTarget,
        };
        recordDriftTelemetry(violation, projectRoot);
        return violation;
      }
    }
  }

  return { allow: true, decision: "allow" };
}

/**
 * Parses CLI arguments into key-value map.
 */
function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        args[key] = argv[++i];
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

/**
 * Reads all data from stdin with short timeout.
 */
function readAllStdin(timeoutMs = 15) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY || process.stdin.readableEnded || !process.stdin.readable) {
      return resolve("");
    }
    let data = "";
    let completed = false;

    function finish() {
      if (!completed) {
        completed = true;
        resolve(data);
      }
    }

    const timer = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      clearTimeout(timer);
      finish();
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      finish();
    });
  });
}

/**
 * Resolves payload from environment variables, CLI arguments, or stdin.
 */
function resolvePayload(cliArgs = {}, env = process.env, stdinData = "") {
  if (env.HOOK_PAYLOAD) {
    try {
      return JSON.parse(env.HOOK_PAYLOAD);
    } catch {
      return { raw: env.HOOK_PAYLOAD };
    }
  }
  if (cliArgs.payload || cliArgs["event-json"] || cliArgs.event_json) {
    const raw = cliArgs.payload || cliArgs["event-json"] || cliArgs.event_json;
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
  if (stdinData && stdinData.trim()) {
    try {
      return JSON.parse(stdinData.trim());
    } catch {
      return { raw: stdinData.trim() };
    }
  }
  return cliArgs;
}

/**
 * CLI Main execution
 */
async function main(argv = process.argv.slice(2)) {
  const cliArgs = parseCliArgs(argv);
  const stdinData = await readAllStdin();
  const payload = resolvePayload(cliArgs, process.env, stdinData);

  const result = evaluateScopeBoundaryEnforcer(payload, {
    projectRoot: cliArgs.project || process.cwd(),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    process.stdout.write(
      JSON.stringify(
        {
          allow: false,
          decision: "block",
          reason: `Scope boundary enforcer internal failure: ${err?.message}`,
          self_correct_hint: "Verify topic scope spec format.",
          violation_type: "scope_enforcer_error",
        },
        null,
        2
      ) + "\n"
    );
    process.exit(0);
  });
}

module.exports = {
  normalizePath,
  matchPattern,
  loadTopicSpec,
  extractTargetFiles,
  recordDriftTelemetry,
  evaluateScopeBoundaryEnforcer,
  parseCliArgs,
  resolvePayload,
  main,
};
