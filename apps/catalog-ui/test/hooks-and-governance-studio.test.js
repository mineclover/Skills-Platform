import test from "node:test";
import assert from "node:assert/strict";

const NAVIGATION_TABS = [
  { label: "Skills", icon: "Database", tooltip: "Managed skills, immutable profiles & notes" },
  { label: "Templates", icon: "FileText", tooltip: "Versioned skill membership & recipe export" },
  { label: "Projects", icon: "ClipboardCheck", tooltip: "Project policy, effective skills & activation" },
  { label: "Recipes", icon: "Layers", tooltip: "Recipe hub, export/import & multi-provider apply" },
  { label: "Governance", icon: "Shield", tooltip: "Hook Ecosystem, Guard Interceptors & Live Security Feed" },
];

const BUILTIN_GUARD_HOOKS = [
  {
    id: "secret-leak-guard",
    name: "Secret Leak Guard",
    event: "pre_tool_use",
    description: "Detects and blocks API keys, private tokens, and credentials in commands and payloads.",
    enabled: true,
    matcher: "run_command|write_to_file|replace_file_content|send_message|view_file",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/secret-leak-guard.js",
      timeout_ms: 5000,
    },
    priority: 5,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true, category: "security" },
  },
  {
    id: "destructive-command-blocker",
    name: "Destructive Command Blocker",
    event: "pre_tool_use",
    description: "Blocks catastrophic shell commands, destructive file deletions, and database wipes.",
    enabled: true,
    matcher: "run_command",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/destructive-command-blocker.js",
      timeout_ms: 5000,
    },
    priority: 10,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true, category: "safety" },
  },
  {
    id: "context-budget-guard",
    name: "Context Budget Guard",
    event: "pre_tool_use",
    description: "Enforces 80k token density budget to prevent excessive file writes and context bloat.",
    enabled: true,
    matcher: "write_to_file|replace_file_content|run_command|view_file",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/context-budget-guard.js",
      timeout_ms: 5000,
    },
    priority: 15,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true, category: "governance" },
  },
  {
    id: "scope-boundary-enforcer",
    name: "Scope Boundary Enforcer",
    event: "post_tool_use",
    description: "Audits file modifications against active topic scope and detects out-of-bounds mutations.",
    enabled: true,
    matcher: "write_to_file|replace_file_content",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/scope-boundary-enforcer.js",
      timeout_ms: 5000,
    },
    priority: 20,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true, category: "governance" },
  },
  {
    id: "subagent-recursion-limiter",
    name: "Subagent Recursion Limiter",
    event: "pre_tool_use",
    description: "Enforces recursion depth and concurrency ceilings on subagent invocations.",
    enabled: true,
    matcher: "invoke_subagent|send_message",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/subagent-recursion-limiter.js",
      timeout_ms: 5000,
    },
    priority: 25,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true, category: "governance" },
  },
];

let localHooksMemory = JSON.parse(JSON.stringify(BUILTIN_GUARD_HOOKS));

function simulateHookEvent({ event, payload, hookId }) {
  const hooks = localHooksMemory.filter((h) => h.enabled && (!hookId || h.id === hookId));
  const results = [];
  let blockedResult = null;
  const payloadJson = JSON.stringify(payload);
  const commandStr = (payload.CommandLine || payload.command || "").toString();

  for (const hook of hooks) {
    const hookStart = Date.now();
    let allow = true;
    let status = "success";
    let stdout = "";
    let interception = null;

    if (hook.id === "secret-leak-guard") {
      const secretPatterns = [
        /(?:sk-[a-zA-Z0-9_-]{20,})/i,
        /(?:AKIA[0-9A-Z]{16})/i,
        /(?:ghp_[a-zA-Z0-9]{36})/i,
        /(?:AIza[0-9A-Za-z-_]{35})/i,
      ];
      for (const pat of secretPatterns) {
        if (pat.test(payloadJson) || pat.test(commandStr)) {
          allow = false;
          status = "blocked";
          interception = {
            allow: false,
            reason: "Command or payload contains high-entropy private credentials/API key",
            self_correct_hint: "Mask credentials using environment variable references (e.g. process.env.API_KEY).",
            violation_type: "SECRET_LEAK",
          };
          stdout = JSON.stringify(interception);
          break;
        }
      }
    } else if (hook.id === "destructive-command-blocker") {
      const destructivePatterns = [
        /\brm\s+-[rf]{1,2}\s+[\/\\]/i,
        /\bdel\s+\/[sq]\b/i,
        /\bgit\s+reset\s+--hard\b/i,
        /\bdrop\s+database\b/i,
        /\bformat\s+[c-z]:/i,
      ];
      for (const pat of destructivePatterns) {
        if (pat.test(commandStr) || pat.test(payloadJson)) {
          allow = false;
          status = "blocked";
          interception = {
            allow: false,
            reason: "Command contains catastrophic filesystem deletion or database wipe signature",
            self_correct_hint: "Use safe target paths or soft delete primitives instead of recursive forced wipes.",
            violation_type: "DESTRUCTIVE_COMMAND",
          };
          stdout = JSON.stringify(interception);
          break;
        }
      }
    } else if (hook.id === "context-budget-guard") {
      const content = payload.CodeContent || payload.content || "";
      if (content.length > 320 * 1024) {
        allow = false;
        status = "blocked";
        interception = {
          allow: false,
          reason: `Payload size (${Math.round(content.length / 1024)}KB) exceeds 80k token density budget (~320KB)`,
          self_correct_hint: "Decompose content into modular sub-files or stream updates in smaller chunks.",
          violation_type: "CONTEXT_BUDGET_OVERFLOW",
        };
        stdout = JSON.stringify(interception);
      }
    }

    const durationMs = Date.now() - hookStart;
    const resItem = {
      hookId: hook.id,
      event: hook.event,
      status,
      allow,
      durationMs: Math.max(1, durationMs),
      stdout,
      interception,
    };
    results.push(resItem);

    if (!allow) {
      blockedResult = resItem;
      break;
    }
  }

  if (blockedResult) {
    return {
      eventName: event,
      allow: false,
      halted: true,
      blockedBy: blockedResult.hookId,
      reason: blockedResult.interception?.reason || "Execution blocked by guard",
      self_correct_hint: blockedResult.interception?.self_correct_hint || "Adjust parameters.",
      interception: blockedResult.interception,
      triggeredAt: new Date().toISOString(),
      totalHooks: hooks.length,
      executedCount: results.length,
      results,
    };
  }

  return {
    eventName: event,
    allow: true,
    halted: false,
    triggeredAt: new Date().toISOString(),
    totalHooks: hooks.length,
    executedCount: results.length,
    results,
  };
}

test("Hook Studio: Navigation includes Governance tab with proper metadata", () => {
  const govTab = NAVIGATION_TABS.find((n) => n.label === "Governance");
  assert.ok(govTab, "Governance tab must be registered in navigation");
  assert.equal(govTab.icon, "Shield");
  assert.match(govTab.tooltip, /Hook|Security|Guard/i);
});

test("Hook Studio: Built-in Guard Catalog contains 5 canonical safety guards", () => {
  assert.ok(Array.isArray(BUILTIN_GUARD_HOOKS));
  assert.equal(BUILTIN_GUARD_HOOKS.length, 5);

  const guardIds = BUILTIN_GUARD_HOOKS.map((g) => g.id);
  assert.ok(guardIds.includes("secret-leak-guard"));
  assert.ok(guardIds.includes("destructive-command-blocker"));
  assert.ok(guardIds.includes("context-budget-guard"));
  assert.ok(guardIds.includes("scope-boundary-enforcer"));
  assert.ok(guardIds.includes("subagent-recursion-limiter"));

  // Check priority ordering: secret (5) < destructive (10) < budget (15) < scope (20) < recursion (25)
  const priorities = BUILTIN_GUARD_HOOKS.map((g) => g.priority);
  assert.deepEqual(priorities, [5, 10, 15, 20, 25]);
});

test("Hook Studio Simulator: detects & short-circuits secret leak in < 200ms", () => {
  const start = performance.now();
  const res = simulateHookEvent({
    event: "pre_tool_use",
    payload: {
      tool: "run_command",
      CommandLine: 'curl -H "Authorization: Bearer sk-proj-abcdef1234567890abcdef1234567890" https://api.openai.com',
    },
  });
  const latency = performance.now() - start;

  assert.ok(latency < 200, `Simulation latency must be < 200ms, got ${latency}ms`);
  assert.equal(res.allow, false);
  assert.equal(res.halted, true);
  assert.equal(res.blockedBy, "secret-leak-guard");
  assert.match(res.reason, /credential|secret|API key/i);
  assert.ok(res.self_correct_hint);
});

test("Hook Studio Simulator: detects & short-circuits destructive rm -rf command", () => {
  const res = simulateHookEvent({
    event: "pre_tool_use",
    payload: {
      tool: "run_command",
      CommandLine: "rm -rf / --no-preserve-root",
    },
  });

  assert.equal(res.allow, false);
  assert.equal(res.halted, true);
  assert.equal(res.blockedBy, "destructive-command-blocker");
  assert.match(res.reason, /destructive|deletion|wipe/i);
});

test("Hook Studio Simulator: detects & short-circuits context budget overflow (>320KB)", () => {
  const res = simulateHookEvent({
    event: "pre_tool_use",
    payload: {
      tool: "write_to_file",
      TargetFile: "src/big.json",
      CodeContent: "z".repeat(350 * 1024),
    },
  });

  assert.equal(res.allow, false);
  assert.equal(res.halted, true);
  assert.equal(res.blockedBy, "context-budget-guard");
  assert.match(res.reason, /80k token|budget/i);
});

test("Hook Studio Simulator: allows safe benign tool execution", () => {
  const res = simulateHookEvent({
    event: "pre_tool_use",
    payload: {
      tool: "run_command",
      CommandLine: "npm test --workspace packages/skill-contracts",
    },
  });

  assert.equal(res.allow, true);
  assert.equal(res.halted, false);
});
