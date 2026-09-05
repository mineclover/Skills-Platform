# Advanced AGY Workflow Archetypes & Loop Matrix

Detailed architectural guide for implementing four core Antigravity workflow archetypes in custom skills.

> **Scope**: This package-local reference is self-contained. If a project maintains a separate
> loop or skill-preset matrix, treat that document as project policy and load it from the project
> rather than resolving a path outside this skill package.

---

## 1. Ralph Autonomous Inner Loop

### Purpose
Force rigorous, iterative test-driven development without premature termination.

### Implementation Checklist
1. **Target Identification**:
   - Establish an exact test command that fails on the current codebase.
   - Example: `npm test -- test/unit/catalog.test.js`
2. **Surgical Diffs**:
   - Instruct the agent to use `replace_file_content` targeting small contiguous chunks.
   - Forbid sweeping multi-file rewrites in a single iteration.
3. **Mechanical Verification**:
   - Parse stdout/stderr.
   - If exit code != 0, extract stack trace, log the failure point, and loop back.
4. **Invariant Check**:
   - Run the broader regression test suite before concluding the skill execution.

---

## 2. Teamwork Elicitation & Multi-Agent Swarm

### Purpose
Guide the user through complex requirements gathering, maintain a live specification artifact, and delegate work to specialized subagent topologies.

### Implementation Checklist
1. **Living Artifact**:
   - Create `prompt_draft.md` at `<appDataDir>\brain\<conversation-id>/prompt_draft.md`.
   - Update the artifact after every user interaction.
2. **Interactive Gating**:
   - Use `ask_question` for trade-off decisions with explicit choices.
3. **What, Not How**:
   - Specify goals, invariants, and acceptance criteria.
   - Avoid prescribing file paths or internal function signatures unless requested.
4. **Subagent Delegation**:
   - When the user approves, extract prompt text and invoke `invoke_subagent`.

---

## 3. Generative UI & Visual Artifacts

### Purpose
Deliver interactive visual status dashboards, diagrams, and controls natively inside the Antigravity conversation.

### Implementation Checklist
1. **HTML Boilerplate**:
   - Must include `<script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>`.
2. **Theme Variable Compliance**:
   - Use `bg-[var(--card)]`, `text-[var(--foreground)]`, `text-[var(--muted-foreground)]`, `border-[var(--border)]`.
   - Never use static color classes like `bg-white` or `text-black`.
3. **Embed Placement**:
   - For compact widgets (<500px): `<agent-embed src="file:///<path>"></agent-embed>`.
   - For complex dashboards: write artifact and reference path in chat.

---

## 4. Background Scheduling & Monitoring

### Purpose
Orchestrate timers, polling jobs, and health check monitors asynchronously.

### Implementation Checklist
1. **Native Tool Usage**:
   - Call `schedule` with either `DurationSeconds` (one-shot) or `CronExpression` (recurring).
2. **Never Call Sleep**:
   - Prohibit shell `sleep` commands.
3. **Reactive Wakeup**:
   - End turn immediately after scheduling to allow the AGY runtime to notify upon job trigger.
