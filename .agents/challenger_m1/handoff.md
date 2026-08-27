# Milestone M1 Adversarial Challenge Report

**Verdict**: `REQUEST_CHANGES`

---

## 1. Observation

An adversarial stress-test harness (`.agents/challenger_m1/adversarial-harness.js`) was developed and executed across 5 core stress dimensions, encompassing 32 empirical test assertions.

### 1.1 Stress-Test Results Summary
- **Total Tests**: 32
- **Passed**: 29
- **Failed**: 3
- **Test Output Summary**:
```
=================================================================
STARTING ADVERSARIAL CHALLENGE & STRESS-TEST HARNESS (M1)
=================================================================

=== Suite 1: Performance Under Load ===
Running 100 rapid consecutive CLI executions...
  Performance stats (100 CLI runs):
    Min: 53.52ms, Max: 87.25ms
    Avg: 56.59ms, P50: 55.91ms, P95: 63.18ms, P99: 87.25ms
  [PASS] All 100 CLI runs logged events successfully
  In-process stats (200 calls): Avg: 0.48ms, P95: 0.65ms
  [PASS] In-process latency average < 5ms
  [PASS] In-process latency P95 < 15ms

=== Suite 2: HTTP Endpoint Resilience ===
  [PASS] Resilience to Connection Refused (exits 0 in < 500ms without blocking)
  [PASS] Resilience to Blackhole/Socket Hang (non-blocking, exits 0 promptly)
  [PASS] Resilience to TCP Connection Reset (exits 0 without uncaught exception)
  [PASS] Resilience to Garbage HTTP Response (exits 0 cleanly)
  [PASS] Resilience to Invalid URL string (exits 0 cleanly)
  [PASS] All resilient events persisted to local log despite HTTP failures

=== Suite 3: Malformed & Hostile Inputs ===
  [PASS] Broken JSON syntax on STDIN exits 0
  [PASS] Binary / NUL noise on STDIN exits 0
  [PASS] 2MB Large STDIN payload handled without crash
  [PASS] Whitespace-only STDIN exits 0
  [PASS] Hostile CLI flags parsed safely and exits 0
  [PASS] All logged lines under hostile inputs are strictly valid single-line JSON

=== Suite 4: Concurrent Writes to events.ndjson ===
Spawning 60 simultaneous processes appending to single log file...
  [PASS] All 60 concurrent processes exited code 0
  [PASS] Exactly 60 lines recorded without loss
  [PASS] Zero corrupted/interleaved lines in concurrent log
  [PASS] All unique worker skills captured

=== Suite 5: Multi-Agent Extraction Accuracy & CLI Flag Handling ===
  [PASS] Antigravity Windows path extracts task-decomposer
  [PASS] Antigravity sets model_invoked and activation_report
  [PASS] Antigravity run_command extracts scoped-tdd-executor
  [PASS] Antigravity scoped test sets evaluation evidence_type
  [PASS] Antigravity loop command extracts lifecycle-phase-controller
  [FAIL] Claude post_tool_execution infers provider_id: 'claude' without explicit platform flag { expected: 'claude', actual: 'antigravity' }
  [PASS] Claude post_tool_execution extracts skill_name: 'horizontal-topic-scanner'
  [PASS] Claude tool error mapped to outcome 'risk'
  [FAIL] Kebab-case CLI arguments (--skill-name, --recipe-id, etc.) parsed into telemetry event {
  expectedSkill: 'task-decomposer',
  actualSkill: 'general-skill',
  expectedRecipe: 'mlc-task-planning',
  actualRecipe: undefined,
  expectedMode: 'user_invoked',
  actualMode: 'model_invoked'
}
  [FAIL] extractFromCommand matches flags formatted with '=' equals sign { actual: {} }
  [PASS] Artifact digest path extracts codebase-design
  [PASS] Stream mode processes multi-line NDJSON stream
  [PASS] Stream mode logged all 3 stream events
```

---

### 1.2 Identified Defect Findings

#### Finding 1 (Critical): Provider ID Precedence Shadows Heuristic Extraction for Claude Payloads
- **File**: `.skills-platform/hooks/telemetry-hook.js`, line 113 vs line 164.
- **Code**:
  ```javascript
  // Line 113:
  provider_id: cliArgs.platform || cliArgs.provider || data.platform || data.provider_id || data.provider || env.SKILLS_PROVIDER_ID || "antigravity",

  // Line 163-164:
  if (data.event === "post_tool_execution" || data.tool_name) {
    result.provider_id = result.provider_id || "claude";
  ```
- **Observed Behavior**:
  Because `"antigravity"` is evaluated immediately on line 113 as a fallback default, `result.provider_id` is always truthy (`"antigravity"`). When a Claude payload is received via STDIN or programmatic call (`{ event: "post_tool_execution", tool_name: "ReadFile", input: { path: ".claude/skills/demo/SKILL.md" } }`), line 164 evaluates `result.provider_id || "claude"`, which evaluates to `"antigravity"`.
- **Reproduction**:
  ```bash
  node -e "const { normalizeTelemetryEvent } = require('./.skills-platform/hooks/telemetry-hook.js'); console.log(normalizeTelemetryEvent({ event: 'post_tool_execution', tool_name: 'ReadFile', input: { path: '.claude/skills/demo/SKILL.md' } }));"
  ```
  **Output**:
  ```javascript
  {
    timestamp: '2026-08-27T22:08:35.864Z',
    provider_id: 'antigravity', // BUG: should be 'claude'
    project_id: 'Skills-Platform',
    skill_name: 'demo',
    ...
    summary: 'Claude accessed skill demo'
  }
  ```

#### Finding 2 (High): Kebab-Case CLI Arguments Are Dropped During Normalization
- **File**: `.skills-platform/hooks/telemetry-hook.js`, lines 114–123 & 423–430.
- **Code**:
  In `parseCliArgs()`:
  ```javascript
  // Only duration-ms and tool-calls-count are mapped:
  if (result["duration-ms"]) result.duration_ms = Number(result["duration-ms"]);
  if (result["tool-calls-count"]) result.tool_calls_count = Number(result["tool-calls-count"]);
  ```
  In `parseHookInput()`:
  ```javascript
  project_id: cliArgs.project || cliArgs.project_id || data.project_id || ...
  recipe_id: cliArgs.recipe || cliArgs.recipe_id || data.recipe_id || ...
  skill_name: cliArgs.skill || cliArgs.skill_name || data.skill_name || ...
  lineage_id: cliArgs.lineage || cliArgs.lineage_id || data.lineage_id || ...
  invocation_mode: cliArgs.mode || cliArgs.invocation_mode || data.invocation_mode || ...
  evidence_type: cliArgs.evidence || cliArgs.evidence_type || data.evidence_type || ...
  ```
- **Observed Behavior**:
  Standard CLI arguments such as `--skill-name`, `--recipe-id`, `--lineage-id`, `--project-id`, `--evidence-type`, `--invocation-mode` are stored on `cliArgs` with hyphenated keys (`cliArgs["skill-name"]`), but `parseHookInput()` only accesses underscore keys (`cliArgs.skill_name`). As a result, the provided CLI values are ignored and fallback to `"general-skill"`, `null`, and default enums.
- **Reproduction**:
  ```bash
  node -e "const { normalizeTelemetryEvent, parseCliArgs } = require('./.skills-platform/hooks/telemetry-hook.js'); console.log(normalizeTelemetryEvent({}, { cliArgs: parseCliArgs(['--skill-name', 'task-decomposer', '--recipe-id', 'mlc-task-planning']) }));"
  ```
  **Output**:
  ```javascript
  {
    skill_name: 'general-skill', // BUG: ignored '--skill-name task-decomposer'
    recipe_id: undefined         // BUG: ignored '--recipe-id mlc-task-planning'
  }
  ```

#### Finding 3 (Medium): `extractFromCommand` Fails on Key-Value Arguments Formatted with Equals Sign (`=`)
- **File**: `.skills-platform/hooks/telemetry-hook.js`, lines 72–77.
- **Code**:
  ```javascript
  const recipeMatch = cmd.match(/--(?:recipe|recipe-id)\s+([a-zA-Z0-9_\-]+)/i);
  if (recipeMatch) result.recipe_id = recipeMatch[1];

  const skillMatch = cmd.match(/--(?:skill|skill-name)\s+([a-zA-Z0-9_\-]+)/i);
  if (skillMatch) result.skill_name = skillMatch[1];
  ```
- **Observed Behavior**:
  The regex explicitly requires `\s+` (whitespace). Commands formatted with standard shell equals signs (`--skill=custom-skill --recipe=custom-recipe`) fail to match and return an empty extraction `{}`.
- **Reproduction**:
  ```bash
  node -e "const { extractFromCommand } = require('./.skills-platform/hooks/telemetry-hook.js'); console.log(extractFromCommand('node runner.js --recipe=custom-recipe --skill=custom-skill'));"
  ```
  **Output**:
  ```javascript
  {} // BUG: expected { recipe_id: 'custom-recipe', skill_name: 'custom-skill' }
  ```

---

## 2. Logic Chain

1. *Observation 1.1* confirms that performance under load (100 rapid CLI runs, 200 in-process iterations averaging 0.48ms), HTTP endpoint fault tolerance (connection refused, blackhole socket hang, TCP reset, garbage response, invalid URL), corrupt/malformed STDIN resilience, and multi-process concurrency safety (60 concurrent workers without log interleaving) are robust and meet requirements.
2. *Observation 1.2 (Finding 1)* demonstrates that evaluating `"antigravity"` as a default for `provider_id` at the root object level on line 113 preempts subsequent multi-agent heuristic detection on line 164. Because the variable is already assigned, `result.provider_id || "claude"` is bypassed, causing all Claude tool execution events arriving via payload or STDIN to be misattributed to Antigravity.
3. *Observation 1.2 (Finding 2)* demonstrates that a key naming mismatch exists between `parseCliArgs()` (producing kebab-case properties like `skill-name`) and `parseHookInput()` (only checking snake_case and short flags like `skill` and `skill_name`). This causes CLI arguments supplied in standard POSIX kebab-case syntax to be silently discarded.
4. *Observation 1.2 (Finding 3)* shows that regex patterns in `extractFromCommand()` require space separators and reject `=`-separated CLI options, breaking command introspection for commands like `--recipe=name`.
5. Therefore, while core performance, concurrency, and fault tolerance invariants are satisfied, multi-agent telemetry extraction accuracy and CLI argument ergonomics contain 3 reproducible defects that require correction.

---

## 3. Caveats

- In `.claude/hooks.json`, `--platform claude` is hardcoded in the hook command string, which masked Finding 1 in worker unit tests. However, whenever Claude events are ingested via stdin JSON streams or API endpoints without explicit `--platform claude`, Finding 1 occurs.
- Findings 2 and 3 do not crash the script (which safely falls back to default values), but they cause silent telemetry data degradation.

---

## 4. Conclusion

**Verdict: `REQUEST_CHANGES`**

The implementation of Milestone M1 (`telemetry-hook.js`) demonstrates excellent baseline performance (< 1ms in-process, non-blocking I/O) and robust resilience against hostile inputs and socket errors. However, changes are requested to resolve the 3 empirical defects:

### Recommended Fixes:
1. **Fix Provider Fallback Order**: In `parseHookInput()`, do not default `provider_id` to `"antigravity"` on line 113. Initialize it to `null`, allow agent-specific heuristics (`PostToolUse` -> `"antigravity"`, `post_tool_execution` -> `"claude"`) to set it, and only fall back to `"antigravity"` at the end of normalization if still unset.
2. **Support Kebab-Case CLI Flags**: In `parseHookInput()` and/or `parseCliArgs()`, check both kebab-case and snake_case properties:
   - `cliArgs.skill || cliArgs.skill_name || cliArgs["skill-name"]`
   - `cliArgs.recipe || cliArgs.recipe_id || cliArgs["recipe-id"]`
   - `cliArgs.lineage || cliArgs.lineage_id || cliArgs["lineage-id"]`
   - `cliArgs.project || cliArgs.project_id || cliArgs["project-id"]`
   - `cliArgs.evidence || cliArgs.evidence_type || cliArgs["evidence-type"]`
   - `cliArgs.mode || cliArgs.invocation_mode || cliArgs["invocation-mode"]`
3. **Update Command Extraction Regex**: In `extractFromCommand()`, allow both whitespace and equals delimiters:
   ```javascript
   const recipeMatch = cmd.match(/--(?:recipe|recipe-id)[=\s]+([a-zA-Z0-9_\-]+)/i);
   const skillMatch = cmd.match(/--(?:skill|skill-name)[=\s]+([a-zA-Z0-9_\-]+)/i);
   ```

---

## 5. Verification Method

To independently reproduce and verify all findings:

1. **Run Full Adversarial Stress Harness**:
   ```bash
   node .agents/challenger_m1/adversarial-harness.js
   ```
2. **Reproduce Finding 1 (Claude Provider Fallback Shadowing)**:
   ```bash
   node -e "const { normalizeTelemetryEvent } = require('./.skills-platform/hooks/telemetry-hook.js'); console.log(normalizeTelemetryEvent({ event: 'post_tool_execution', tool_name: 'ReadFile', input: { path: '.claude/skills/demo/SKILL.md' } }));"
   ```
3. **Reproduce Finding 2 (Kebab-Case CLI Argument Drop)**:
   ```bash
   node -e "const { normalizeTelemetryEvent, parseCliArgs } = require('./.skills-platform/hooks/telemetry-hook.js'); console.log(normalizeTelemetryEvent({}, { cliArgs: parseCliArgs(['--skill-name', 'task-decomposer', '--recipe-id', 'mlc-task-planning']) }));"
   ```
4. **Reproduce Finding 3 (Command Flag `=` syntax)**:
   ```bash
   node -e "const { extractFromCommand } = require('./.skills-platform/hooks/telemetry-hook.js'); console.log(extractFromCommand('node runner.js --recipe=custom-recipe --skill=custom-skill'));"
   ```
