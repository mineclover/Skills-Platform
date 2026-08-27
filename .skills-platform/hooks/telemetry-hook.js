#!/usr/bin/env node
/**
 * Universal Skill Usage Telemetry Hook Engine
 * Zero-dependency, ultra-fast (<50ms), resilient telemetry hook script.
 * Compatible with Google Antigravity, Anthropic Claude Code, Codex CLI, and Ralph-TUI.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const readline = require("node:readline");

const VALID_INVOCATION_MODES = new Set(["model_invoked", "user_invoked", "hybrid", "unspecified"]);
const VALID_OUTCOMES = new Set(["success", "correction", "scope_mismatch", "freshness", "risk", "neutral"]);
const VALID_EVIDENCE_TYPES = new Set(["manual", "evaluation", "activation_report", "user_feedback", "incident"]);
const VALID_PROVIDERS = new Set(["antigravity", "claude", "codex", "ralph-tui", "gemini", "openai", "custom"]);

/**
 * Finds the project/repo root directory looking upward for .skills-platform or package.json.
 */
function findRepoRoot(startDir = process.cwd()) {
  try {
    let current = path.resolve(startDir);
    while (current) {
      if (fs.existsSync(path.join(current, ".skills-platform")) || fs.existsSync(path.join(current, "PROJECT.md"))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch {
    // ignore
  }
  return process.cwd();
}

/**
 * Extract skill name from path string using heuristics.
 */
function extractSkillFromPath(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) return null;
  const normalized = filePath.replace(/\\/g, "/");

  // Heuristic 1: artifacts/skill-name-<digest>
  const artifactMatch = normalized.match(/\/artifacts\/([a-zA-Z0-9_\-]+?)-[a-f0-9]{8,}(?:\/|$)/i);
  if (artifactMatch) return artifactMatch[1];

  // Heuristic 2: .agents/skills/<name>, .claude/skills/<name>, skills/<name>
  const skillDirMatch = normalized.match(/(?:^|\/)(?:\.agents\/skills|\.claude\/skills|skills|\.skills-platform\/registry\/skills)\/([a-zA-Z0-9_\-]+)(?:\/|$)/i);
  if (skillDirMatch) return skillDirMatch[1];

  // Heuristic 3: <name>/SKILL.md or <name>/skill.json
  const skillFileMatch = normalized.match(/(?:^|\/)([a-zA-Z0-9_\-]+)\/(?:SKILL\.md|skill\.json|metadata\.json)$/i);
  if (skillFileMatch) return skillFileMatch[1];

  return null;
}

/**
 * Extract skill or recipe from command line string.
 */
function extractFromCommand(commandStr) {
  if (typeof commandStr !== "string" || !commandStr.trim()) return {};
  const cmd = commandStr.trim();
  const result = {};

  // Check recipe flags
  const recipeMatch = cmd.match(/--(?:recipe|recipe-id)[=\s]+([a-zA-Z0-9_\-]+)/i);
  if (recipeMatch) result.recipe_id = recipeMatch[1];

  // Check skill flags
  const skillMatch = cmd.match(/--(?:skill|skill-name)[=\s]+([a-zA-Z0-9_\-]+)/i);
  if (skillMatch) result.skill_name = skillMatch[1];

  // Check scoped test command
  if (/run_scoped_test|scoped-tdd-executor/i.test(cmd)) {
    result.skill_name = result.skill_name || "scoped-tdd-executor";
    result.evidence_type = "evaluation";
  } else if (/task-planning|task-decomposer/i.test(cmd)) {
    result.skill_name = result.skill_name || "task-decomposer";
    result.recipe_id = result.recipe_id || "mlc-task-planning";
  } else if (/release-governance|global-regression-gatekeeper/i.test(cmd)) {
    result.skill_name = result.skill_name || "global-regression-gatekeeper";
    result.recipe_id = result.recipe_id || "mlc-release-governance";
  } else if (/skills-platform\s+loop/i.test(cmd)) {
    result.skill_name = result.skill_name || "lifecycle-phase-controller";
  }

  return result;
}

/**
 * Parses raw input payload (from Antigravity, Claude, Codex, Ralph-TUI, or CLI) into standard telemetry event fields.
 */
function parseHookInput(rawInput, cliArgs = {}, env = process.env) {
  let data = {};
  if (typeof rawInput === "string" && rawInput.trim()) {
    try {
      data = JSON.parse(rawInput);
    } catch {
      data = { raw_message: rawInput };
    }
  } else if (typeof rawInput === "object" && rawInput !== null) {
    data = rawInput;
  }

  const result = {
    timestamp: data.timestamp || cliArgs.timestamp || new Date().toISOString(),
    provider_id: cliArgs.platform || cliArgs.provider || cliArgs.provider_id || cliArgs["provider-id"] || data.platform || data.provider_id || data.provider || env.SKILLS_PROVIDER_ID || env.PROVIDER_ID || null,
    project_id: cliArgs.project || cliArgs.project_id || cliArgs["project-id"] || data.project_id || env.SKILLS_PROJECT_ID || env.PROJECT_ID || path.basename(findRepoRoot()),
    recipe_id: cliArgs.recipe || cliArgs.recipe_id || cliArgs["recipe-id"] || data.recipe_id || env.SKILLS_RECIPE_ID || null,
    skill_name: cliArgs.skill || cliArgs.skill_name || cliArgs["skill-name"] || data.skill_name || null,
    lineage_id: cliArgs.lineage || cliArgs.lineage_id || cliArgs["lineage-id"] || data.lineage_id || null,
    invocation_mode: cliArgs.mode || cliArgs.invocation_mode || cliArgs["invocation-mode"] || data.invocation_mode || env.SKILLS_INVOCATION_MODE || null,
    duration_ms: typeof cliArgs.duration === "number" ? cliArgs.duration : (typeof cliArgs.duration_ms === "number" ? cliArgs.duration_ms : (typeof cliArgs["duration-ms"] === "number" ? cliArgs["duration-ms"] : (typeof data.duration_ms === "number" ? data.duration_ms : (typeof data.duration === "number" ? data.duration : 0)))),
    tool_calls_count: typeof cliArgs.tool_calls === "number" ? cliArgs.tool_calls : (typeof cliArgs.tool_calls_count === "number" ? cliArgs.tool_calls_count : (typeof cliArgs["tool-calls-count"] === "number" ? cliArgs["tool-calls-count"] : (typeof data.tool_calls_count === "number" ? data.tool_calls_count : 1))),
    outcome: cliArgs.outcome || data.outcome || null,
    evidence_type: cliArgs.evidence || cliArgs.evidence_type || cliArgs["evidence-type"] || data.evidence_type || null,
    summary: cliArgs.summary || data.summary || null,
    metrics: typeof data.metrics === "object" && data.metrics !== null ? { ...data.metrics } : {},
  };

  // Antigravity PostToolUse structure
  if (data.event === "PostToolUse" || data.tool) {
    result.provider_id = result.provider_id || "antigravity";
    const tool = data.tool || data.tool_name;
    const params = data.parameters || data.args || data.input || {};

    if (tool === "view_file" || params.AbsolutePath || params.path) {
      const targetPath = params.AbsolutePath || params.path || "";
      const extractedSkill = extractSkillFromPath(targetPath);
      if (extractedSkill) {
        result.skill_name = result.skill_name || extractedSkill;
        result.invocation_mode = result.invocation_mode || "model_invoked";
        result.evidence_type = result.evidence_type || "activation_report";
        result.summary = result.summary || `Antigravity loaded skill definition for ${extractedSkill}`;
      }
    } else if (tool === "run_command" || params.CommandLine || params.command) {
      const commandStr = params.CommandLine || params.command || "";
      const cmdInfo = extractFromCommand(commandStr);
      if (cmdInfo.skill_name) result.skill_name = result.skill_name || cmdInfo.skill_name;
      if (cmdInfo.recipe_id) result.recipe_id = result.recipe_id || cmdInfo.recipe_id;
      if (cmdInfo.evidence_type) result.evidence_type = result.evidence_type || cmdInfo.evidence_type;
      result.invocation_mode = result.invocation_mode || "model_invoked";
    }

    // Inspect result status
    if (!result.outcome) {
      const res = data.result || data.output;
      if (res && (res.status === "error" || res.error || (typeof res.exit_code === "number" && res.exit_code !== 0))) {
        result.outcome = "risk";
      } else {
        result.outcome = "success";
      }
    }
  }

  // Claude post_tool_execution structure
  if (data.event === "post_tool_execution" || data.tool_name) {
    result.provider_id = result.provider_id || "claude";
    const toolName = data.tool_name || data.tool;
    const input = data.input || data.parameters || {};

    if (input.path || input.file_path) {
      const extractedSkill = extractSkillFromPath(input.path || input.file_path);
      if (extractedSkill) {
        result.skill_name = result.skill_name || extractedSkill;
        result.invocation_mode = result.invocation_mode || "model_invoked";
        result.evidence_type = result.evidence_type || "activation_report";
        result.summary = result.summary || `Claude accessed skill ${extractedSkill}`;
      }
    } else if (input.command) {
      const cmdInfo = extractFromCommand(input.command);
      if (cmdInfo.skill_name) result.skill_name = result.skill_name || cmdInfo.skill_name;
      if (cmdInfo.recipe_id) result.recipe_id = result.recipe_id || cmdInfo.recipe_id;
    }

    if (!result.outcome) {
      if (data.output?.error || data.is_error || data.error) {
        result.outcome = "risk";
      } else {
        result.outcome = "success";
      }
    }
  }

  return result;
}

/**
 * Normalizes telemetry event object according to strict platform contract.
 */
function normalizeTelemetryEvent(rawEvent, options = {}) {
  const parsed = parseHookInput(rawEvent, options.cliArgs || {}, options.env || process.env);

  const timestamp = (typeof parsed.timestamp === "string" && parsed.timestamp.trim()) ? parsed.timestamp.trim() : new Date().toISOString();
  let provider_id = (typeof parsed.provider_id === "string" && parsed.provider_id.trim()) ? parsed.provider_id.trim().toLowerCase() : "antigravity";
  const project_id = (typeof parsed.project_id === "string" && parsed.project_id.trim()) ? parsed.project_id.trim() : path.basename(findRepoRoot());
  const recipe_id = (typeof parsed.recipe_id === "string" && parsed.recipe_id.trim()) ? parsed.recipe_id.trim() : null;
  const skill_name = (typeof parsed.skill_name === "string" && parsed.skill_name.trim()) ? parsed.skill_name.trim() : "general-skill";
  const lineage_id = (typeof parsed.lineage_id === "string" && parsed.lineage_id.trim()) ? parsed.lineage_id.trim() : `lineage-${skill_name}`;

  let invocation_mode = parsed.invocation_mode;
  if (!VALID_INVOCATION_MODES.has(invocation_mode)) {
    invocation_mode = "model_invoked";
  }

  let outcome = parsed.outcome;
  if (!VALID_OUTCOMES.has(outcome)) {
    outcome = "success";
  }

  let evidence_type = parsed.evidence_type;
  if (!VALID_EVIDENCE_TYPES.has(evidence_type)) {
    evidence_type = "activation_report";
  }

  const duration_ms = typeof parsed.duration_ms === "number" && !Number.isNaN(parsed.duration_ms) && parsed.duration_ms >= 0
    ? Math.round(parsed.duration_ms)
    : 0;

  const tool_calls_count = typeof parsed.tool_calls_count === "number" && !Number.isNaN(parsed.tool_calls_count) && parsed.tool_calls_count >= 0
    ? Math.floor(parsed.tool_calls_count)
    : 1;

  const summary = (typeof parsed.summary === "string" && parsed.summary.trim())
    ? parsed.summary.trim()
    : `Telemetry event for ${skill_name} (${outcome})`;

  const metrics = {
    duration_ms,
    tool_calls_count,
    ...(typeof parsed.metrics === "object" && parsed.metrics !== null ? parsed.metrics : {})
  };

  const normalized = {
    timestamp,
    provider_id,
    project_id,
    skill_name,
    lineage_id,
    invocation_mode,
    duration_ms,
    tool_calls_count,
    outcome,
    evidence_type,
    summary,
    metrics
  };

  if (recipe_id) {
    normalized.recipe_id = recipe_id;
  }

  return normalized;
}

/**
 * Synchronously appends normalized event to local append-only NDJSON log file.
 */
function appendTelemetryLog(event, customLogPath = null) {
  try {
    const repoRoot = findRepoRoot();
    const logFile = customLogPath || process.env.SKILLS_TELEMETRY_LOG || path.join(repoRoot, ".skills-platform", "telemetry", "events.ndjson");
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const line = JSON.stringify(event) + "\n";
    fs.appendFileSync(logFile, line, "utf8");
    return true;
  } catch (err) {
    if (process.env.SKILLS_DEBUG === "1") {
      process.stderr.write(`[telemetry-hook] Failed to append log: ${err?.message}\n`);
    }
    return false;
  }
}

/**
 * Fires non-blocking asynchronous HTTP POST to ingestion endpoint.
 */
function dispatchTelemetryHttp(event, options = {}) {
  const endpoint = options.endpoint || process.env.SKILLS_TELEMETRY_ENDPOINT || "http://127.0.0.1:4300/api/telemetry/record";
  const sync = options.syncHttp === true;
  const timeoutMs = options.timeoutMs || 200;

  if (options.disableHttp || process.env.SKILLS_DISABLE_HTTP === "1") {
    return Promise.resolve({ skipped: true });
  }

  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(endpoint);
      const isHttps = parsedUrl.protocol === "https:";
      const client = isHttps ? https : http;
      const payload = JSON.stringify(event);

      const reqOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "User-Agent": "skills-platform-telemetry-hook/0.1.0"
        },
        timeout: timeoutMs
      };

      const req = client.request(reqOptions, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          resolve({ status: res.statusCode, body });
        });
      });

      req.on("error", (err) => {
        if (process.env.SKILLS_DEBUG === "1") {
          process.stderr.write(`[telemetry-hook] HTTP error: ${err?.message}\n`);
        }
        resolve({ error: err?.message, status: null });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({ error: "timeout", status: null });
      });

      // Crucial non-blocking step: unref the socket so Node event loop does not hold for server response
      if (!sync) {
        req.on("socket", (sock) => {
          sock.unref?.();
        });
      }

      req.write(payload);
      req.end();

      if (!sync) {
        // Resolve immediately in non-blocking mode without awaiting response
        resolve({ dispatched: true });
      }
    } catch (err) {
      if (process.env.SKILLS_DEBUG === "1") {
        process.stderr.write(`[telemetry-hook] HTTP dispatch error: ${err?.message}\n`);
      }
      resolve({ error: err?.message });
    }
  });
}

/**
 * Main telemetry recording pipeline: normalizes event, appends to log, and dispatches HTTP POST.
 */
async function recordTelemetryEvent(rawEvent, options = {}) {
  try {
    const event = normalizeTelemetryEvent(rawEvent, options);
    
    if (!options.disableLog && process.env.SKILLS_DISABLE_LOG !== "1") {
      appendTelemetryLog(event, options.logFile);
    }

    if (!options.disableHttp && process.env.SKILLS_DISABLE_HTTP !== "1") {
      await dispatchTelemetryHttp(event, options);
    }

    return event;
  } catch (err) {
    if (process.env.SKILLS_DEBUG === "1") {
      process.stderr.write(`[telemetry-hook] record error: ${err?.message}\n`);
    }
    return null;
  }
}

/**
 * CLI Argument parser (pure standard library).
 */
function parseCliArgs(args) {
  const result = {
    _positionals: []
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--stream" || arg === "--ndjson") {
      result.stream = true;
    } else if (arg === "--debug") {
      result.debug = true;
      process.env.SKILLS_DEBUG = "1";
    } else if (arg === "--no-http" || arg === "--disable-http") {
      result.disableHttp = true;
    } else if (arg === "--no-log" || arg === "--disable-log") {
      result.disableLog = true;
    } else if (arg === "--sync-http") {
      result.syncHttp = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const eqIdx = key.indexOf("=");
      if (eqIdx !== -1) {
        const flagKey = key.slice(0, eqIdx);
        const flagVal = key.slice(eqIdx + 1);
        result[flagKey] = flagVal;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        result[key] = args[++i];
      } else {
        result[key] = true;
      }
    } else {
      result._positionals.push(arg);
    }
  }

  // Parse numeric CLI fields
  if (result.duration !== undefined) result.duration_ms = Number(result.duration);
  if (result["duration-ms"] !== undefined) result.duration_ms = Number(result["duration-ms"]);
  if (result.duration_ms !== undefined) result.duration_ms = Number(result.duration_ms);
  if (result["tool-calls"] !== undefined) result.tool_calls_count = Number(result["tool-calls"]);
  if (result.tool_calls !== undefined) result.tool_calls_count = Number(result.tool_calls);
  if (result["tool-calls-count"] !== undefined) result.tool_calls_count = Number(result["tool-calls-count"]);
  if (result.tool_calls_count !== undefined) result.tool_calls_count = Number(result.tool_calls_count);

  // Map kebab-case aliases to camel/snake properties if unset
  if (result["skill-name"] && !result.skill_name) result.skill_name = result["skill-name"];
  if (result["recipe-id"] && !result.recipe_id) result.recipe_id = result["recipe-id"];
  if (result["lineage-id"] && !result.lineage_id) result.lineage_id = result["lineage-id"];
  if (result["project-id"] && !result.project_id) result.project_id = result["project-id"];
  if (result["provider-id"] && !result.provider_id) result.provider_id = result["provider-id"];
  if (result["invocation-mode"] && !result.invocation_mode) result.invocation_mode = result["invocation-mode"];
  if (result["evidence-type"] && !result.evidence_type) result.evidence_type = result["evidence-type"];
  if (result["log-file"] && !result.logFile) result.logFile = result["log-file"];
  if (result["event-json"] && !result.event_json) result.event_json = result["event-json"];

  return result;
}

/**
 * Read all data from stdin with short timeout.
 */
function readAllStdin(timeoutMs = 8) {
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
 * Process continuous stream of NDJSON from stdin.
 */
function handleStreamMode(cliArgs) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      recordTelemetryEvent(trimmed, {
        cliArgs,
        logFile: cliArgs["log-file"] || cliArgs.log_file || cliArgs.logFile,
        endpoint: cliArgs.endpoint,
        disableHttp: cliArgs.disableHttp || cliArgs["disable-http"] || cliArgs.noHttp || cliArgs["no-http"],
        disableLog: cliArgs.disableLog || cliArgs["disable-log"] || cliArgs.noLog || cliArgs["no-log"],
        syncHttp: false
      });
    } catch {
      // ignore
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

/**
 * CLI Entrypoint
 */
async function main(argv = process.argv.slice(2)) {
  try {
    const cliArgs = parseCliArgs(argv);

    if (cliArgs.stream || cliArgs.ndjson) {
      handleStreamMode(cliArgs);
      return;
    }

    let inputData = null;
    if (cliArgs["event-json"] || cliArgs.event_json) {
      inputData = cliArgs["event-json"] || cliArgs.event_json;
    } else if (cliArgs.skill || cliArgs.skill_name || cliArgs["skill-name"] || cliArgs.summary) {
      // CLI arguments already provide skill details, check if stdin data is ready immediately
      inputData = await readAllStdin(2);
    } else {
      inputData = await readAllStdin(8);
    }

    await recordTelemetryEvent(inputData || {}, {
      cliArgs,
      logFile: cliArgs["log-file"] || cliArgs.log_file || cliArgs.logFile,
      endpoint: cliArgs.endpoint,
      disableHttp: cliArgs.disableHttp || cliArgs["disable-http"] || cliArgs.noHttp || cliArgs["no-http"],
      disableLog: cliArgs.disableLog || cliArgs["disable-log"] || cliArgs.noLog || cliArgs["no-log"],
      syncHttp: cliArgs.syncHttp === true || cliArgs["sync-http"] === true
    });

    process.exit(0);
  } catch (err) {
    if (process.env.SKILLS_DEBUG === "1") {
      process.stderr.write(`[telemetry-hook] Fatal: ${err?.message}\n`);
    }
    process.exit(0);
  }
}

// Auto-run if executed directly
if (require.main === module) {
  // Fail-safe protection: never crash process
  process.on("uncaughtException", (err) => {
    if (process.env.SKILLS_DEBUG === "1") process.stderr.write(`[telemetry-hook] Uncaught: ${err?.message}\n`);
    process.exit(0);
  });
  process.on("unhandledRejection", (err) => {
    if (process.env.SKILLS_DEBUG === "1") process.stderr.write(`[telemetry-hook] Unhandled: ${err?.message}\n`);
    process.exit(0);
  });

  main();
}

module.exports = {
  findRepoRoot,
  extractSkillFromPath,
  extractFromCommand,
  parseHookInput,
  normalizeTelemetryEvent,
  appendTelemetryLog,
  dispatchTelemetryHttp,
  recordTelemetryEvent,
  parseCliArgs,
  main,
  VALID_INVOCATION_MODES,
  VALID_OUTCOMES,
  VALID_EVIDENCE_TYPES,
  VALID_PROVIDERS
};
