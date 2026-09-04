#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const {
  executeHook,
  hookMatchesPayload,
  listHooks,
} = require("./hooks-manager");

const MAX_STDIN_BYTES = 10 * 1024 * 1024;
const CODEX_EVENT_MAP = Object.freeze({
  SessionStart: ["session_start"],
  SessionEnd: ["session_stop"],
  PreToolUse: ["pre_tool_use"],
  PermissionRequest: ["permission_request"],
  PostToolUse: ["post_tool_use"],
  PreCompact: ["pre_compact"],
  PostCompact: ["post_compact"],
  UserPromptSubmit: ["user_prompt_submit", "pre_invocation"],
  SubagentStart: ["subagent_start"],
  SubagentStop: ["subagent_stop"],
  Stop: ["stop", "post_invocation"],
  Interrupt: ["interrupt"],
});

function parseArguments(argv) {
  const options = { projectPath: null, eventName: null, failClosed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--fail-closed") {
      options.failClosed = true;
      continue;
    }
    if (value === "--project" || value === "--event") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${value} requires a value`);
      if (value === "--project") options.projectPath = next;
      else options.eventName = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function readAllStdin(stream = process.stdin) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    stream.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_STDIN_BYTES) {
        reject(new Error(`Codex hook input exceeds ${MAX_STDIN_BYTES} bytes`));
        stream.destroy();
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

function extractPatchFiles(command) {
  if (typeof command !== "string") return [];
  const files = [];
  const header = /^(?:\*\*\* (?:Add|Update|Delete) File:\s*|\*\*\* Move to:\s*|\+\+\+\s+(?:b\/)?|---\s+(?:a\/)?)(.+?)\s*$/gm;
  for (const match of command.matchAll(header)) {
    let candidate = match[1].trim().split("\t", 1)[0];
    if (!candidate) continue;
    if (candidate.startsWith('"') && candidate.endsWith('"')) {
      try { candidate = JSON.parse(candidate); } catch { /* keep the literal path */ }
    }
    candidate = path.posix.normalize(candidate.replace(/\\/g, "/"));
    if (candidate !== "." && candidate !== "/dev/null" && !files.includes(candidate)) files.push(candidate);
  }
  return files;
}

function normalizedToolName(toolName) {
  const value = typeof toolName === "string" ? toolName : "";
  if (/^(?:Bash|exec_command)$/i.test(value)) return "run_command";
  if (/^(?:apply_patch|Edit|Write)$/i.test(value)) return "replace_file_content";
  if (/^(?:Agent|spawn_agent|invoke_subagent)$/i.test(value)) return "invoke_subagent";
  return value;
}

function normalizeCodexPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Codex hook input must be a JSON object");
  }
  const toolInput = input.tool_input && typeof input.tool_input === "object"
    ? input.tool_input
    : {};
  const command = typeof toolInput.command === "string" ? toolInput.command : null;
  const toolName = typeof input.tool_name === "string" ? input.tool_name : null;
  const files = /^(?:apply_patch|Edit|Write)$/i.test(toolName ?? "")
    ? extractPatchFiles(command)
    : [];
  const normalized = {
    ...input,
    provider_id: "codex",
    tool: normalizedToolName(toolName),
    tool_name: toolName,
    parameters: { ...toolInput, ...(files.length ? { files } : {}) },
    arguments: toolInput,
    codex: input,
  };
  if (command && /^(?:Bash|exec_command)$/i.test(toolName ?? "")) normalized.CommandLine = command;
  if (command && /^(?:apply_patch|Edit|Write)$/i.test(toolName ?? "")) {
    normalized.CodeContent = command;
    normalized.files = files;
    if (files[0]) normalized.TargetFile = files[0];
  }
  if (toolName && /^(?:Agent|spawn_agent|invoke_subagent)$/i.test(toolName)) {
    normalized.action = "invoke_subagent";
  }
  return normalized;
}

function looksLikeTestCommand(payload) {
  const command = payload?.CommandLine;
  return typeof command === "string" && /(?:^|\s)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|(?:^|\s)(?:pytest|cargo\s+test|go\s+test|node\s+--test)\b/i.test(command);
}

function platformEventsForCodex(eventName, payload) {
  const events = [...(CODEX_EVENT_MAP[eventName] ?? [])];
  if (eventName === "PreToolUse" && looksLikeTestCommand(payload)) events.push("on_test_run");
  return [...new Set(events)];
}

function compareHookEntries(left, right) {
  const priority = (left.hook.priority ?? 100) - (right.hook.priority ?? 100);
  if (priority !== 0) return priority;
  return left.hook.id.localeCompare(right.hook.id);
}

function hooksForCodexEvent({ projectPath, eventName, payload }) {
  const entries = [];
  const seen = new Set();
  for (const platformEvent of platformEventsForCodex(eventName, payload)) {
    for (const hook of listHooks({ projectPath, eventName: platformEvent })) {
      if (seen.has(hook.id)) continue;
      if (Array.isArray(hook.providers) && !hook.providers.includes("codex")) continue;
      if (!hookMatchesPayload(hook, platformEvent, payload)) continue;
      seen.add(hook.id);
      entries.push({ hook, platformEvent });
    }
  }
  return entries.sort(compareHookEntries);
}

function reasonForResult(result) {
  return result?.interception?.reason
    || result?.reason
    || result?.error
    || `Hook '${result?.hookId ?? "unknown"}' blocked the Codex event`;
}

function codexBlockOutput(eventName, reason) {
  if (eventName === "PreToolUse") {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    };
  }
  if (eventName === "PermissionRequest") {
    return {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "deny", message: reason },
      },
    };
  }
  if (["PostToolUse", "UserPromptSubmit", "SubagentStop", "Stop"].includes(eventName)) {
    return { decision: "block", reason };
  }
  if (["PreCompact", "PostCompact", "SessionStart"].includes(eventName)) {
    return { continue: false, stopReason: reason, systemMessage: reason };
  }
  return { systemMessage: reason };
}

async function runCodexHookEvent({ projectPath, eventName, input }) {
  if (!CODEX_EVENT_MAP[eventName]) throw new Error(`Unsupported Codex hook event: ${eventName}`);
  const resolvedProjectPath = path.resolve(projectPath || input.cwd || process.cwd());
  if (!fs.statSync(resolvedProjectPath).isDirectory()) throw new Error("Codex hook project path must be a directory");
  const payload = normalizeCodexPayload(input);
  const results = [];
  for (const entry of hooksForCodexEvent({ projectPath: resolvedProjectPath, eventName, payload })) {
    const hook = {
      ...entry.hook,
      handler: {
        ...entry.hook.handler,
        env: {
          ...(entry.hook.handler.env ?? {}),
          SKILLS_PROVIDER_ID: "codex",
        },
      },
    };
    const result = await executeHook({
      hook,
      eventName: entry.platformEvent,
      payload,
      projectPath: resolvedProjectPath,
    });
    results.push(result);
    if (result.allow === false || result.status === "blocked") {
      return {
        blocked: true,
        output: codexBlockOutput(eventName, reasonForResult(result)),
        results,
      };
    }
  }
  return { blocked: false, output: null, results };
}

async function main(argv = process.argv.slice(2), streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const stderr = streams.stderr ?? process.stderr;
  const stdin = streams.stdin ?? process.stdin;
  const options = parseArguments(argv);
  const raw = await readAllStdin(stdin);
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error("Codex hook stdin must contain one JSON object");
  }
  const eventName = options.eventName ?? input.hook_event_name;
  if (!eventName) throw new Error("Codex hook event name is required");
  const outcome = await runCodexHookEvent({
    projectPath: options.projectPath ?? input.cwd,
    eventName,
    input,
  });
  if (outcome.output) stdout.write(`${JSON.stringify(outcome.output)}\n`);
  return { ...outcome, failClosed: options.failClosed, stderr };
}

if (require.main === module) {
  let failClosed = process.argv.includes("--fail-closed");
  main()
    .catch((error) => {
      if (failClosed) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 2;
      } else {
        process.stdout.write(`${JSON.stringify({ systemMessage: `Skills Platform hook dispatcher failed open: ${error.message}` })}\n`);
        process.exitCode = 0;
      }
    });
}

module.exports = {
  CODEX_EVENT_MAP,
  MAX_STDIN_BYTES,
  codexBlockOutput,
  extractPatchFiles,
  hooksForCodexEvent,
  looksLikeTestCommand,
  main,
  normalizeCodexPayload,
  parseArguments,
  platformEventsForCodex,
  readAllStdin,
  runCodexHookEvent,
};
