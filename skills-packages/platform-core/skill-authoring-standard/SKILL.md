---
name: skill-authoring-standard
description: >-
  Authoritative convention and comprehensive standard for authoring, structuring, and maintaining
  first-class skills in Google Antigravity (AGY) and Skills Platform. Use when authoring new skills,
  refactoring existing skills, auditing skill frontmatter, or implementing full-lifecycle workflow patterns
  (Ralph loops, teamwork elicitation, generative UI, and subagent orchestration).
---

# Google Antigravity (AGY) Skill Authoring Standard

Authoritative standard for authoring high-signal, executable, and portable skills optimized for the Antigravity agent architecture.

---

## 🏗️ 1. Standard Skill Directory Anatomy

Every skill package in the repository MUST adhere to this modular directory layout:

```text
skills/<skill_name>/
├── 📄 SKILL.md            # [Required] Main procedural runbook with YAML frontmatter
├── 📚 references/         # [Optional] Progressive disclosure: Deep schemas, policies, API specs
├── 🛠️ scripts/            # [Optional] Deterministic helpers, CLI wrappers, test runners
├── 🎨 resources/          # [Optional] Boilerplates, Generative UI templates, prompt scaffolds
└── 💡 examples/           # [Optional] Concrete input/output pairs, execution walkthroughs
```

---

## 📋 2. Frontmatter Standards (`SKILL.md`)

Every `SKILL.md` MUST begin with a strict YAML frontmatter block:

```markdown
---
name: <lowercase-kebab-name>
description: >-
  Concise 3rd-person summary of capabilities and explicit activation conditions.
  Format: "[Action/Capability]. Use when [Trigger Conditions / Scenarios]..."
invocation_mode: hybrid # model_invoked | user_invoked | hybrid
---
```

### Frontmatter Rules:
1. **`name`**: Alphanumeric and hyphens only (`^[a-z0-9-]+$`). Must match the parent folder name.
2. **`description`**: **The primary routing mechanism**. The agent reads this description during initial prompt evaluation. It MUST:
   - Use **third-person** phrasing (never "I will", "You can").
   - Clearly state **what** the skill does AND **when** to activate it.
   - Include specific domain keywords, command triggers, or error conditions.

---

## 🏛️ 3. The 4 Advanced Workflow Archetypes

AGY skills typically implement one or more of the following 4 structural archetypes:

### Archetype A: Ralph Autonomous Inner Loop (`ralph-loop`)
* **Core Philosophy**: Mechanical forcing function. Never allow the agent to guess or self-certify success.
* **Key Steps**:
  1. Define the isolated target test command (e.g. `npm test -- test/target.test.js`).
  2. Implement surgical changes using `replace_file_content`.
  3. Execute tests via `run_command` and parse output.
  4. Loop iteratively until exit code is `0`, then verify global regression suite.

### Archetype B: Teamwork Elicitation & Delegation (`teamwork-preview`)
* **Core Philosophy**: "What, Not How". Maintain a live draft artifact (`prompt_draft.md`) and gate progression through user approval.
* **Key Steps**:
  1. Initialize `prompt_draft.md` immediately with `UserFacing: true`.
  2. Probe ambiguous requirements using `ask_question` with structured options.
  3. Define objective acceptance criteria and verification guardrails.
  4. Upon user approval, delegate to subagents via `invoke_subagent`.

### Archetype C: Generative UI & Visual Reporting (`generative_ui`)
* **Core Philosophy**: Seamless visual communication using host theme tokens.
* **Key Steps**:
  1. Write standalone HTML artifact with allowlisted Tailwind (`https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js`).
  2. Use semantic CSS variables (`bg-[var(--card)]`, `text-[var(--foreground)]`, `border-[var(--border)]`).
  3. Embed compact widgets (≤500px) inline using `<agent-embed src="file:///..."></agent-embed>`.

### Archetype D: Background Task & Cron Orchestration (`schedule`)
* **Core Philosophy**: Non-blocking asynchronous execution.
* **Key Steps**:
  1. Schedule one-shot timers or recurring cron jobs via the `schedule` tool.
  2. Yield execution without calling busy `sleep` loops.
  3. Handle reactive notification wakeups when background tasks complete.

---

## 🎯 4. Core Authoring Principles

### ① High-Signal Procedural Flow
- Keep `SKILL.md` actionable: use numbered steps, condition branches, and concrete tool commands.
- Focus on the unique domain workflow; do not teach basic programming concepts the LLM already knows.

### ② Progressive Disclosure
- Keep `SKILL.md` under 200 lines whenever possible.
- Offload extensive reference tables, API specs, and edge-case guides into `references/*.md`.
- Link referenced documents using markdown links (e.g. `[Schema Spec](./references/schema-spec.md)`).

### ③ Deterministic Verification Gates
- Always conclude procedures with a mechanical verification step (exit code `0`, log assertion, checksum comparison).

---

## 🚫 5. Critical Anti-Patterns & Guardrails

| ❌ Anti-Pattern | Operational Risk | ✅ Correct AGY Convention |
| :--- | :--- | :--- |
| **Self-Certification** | Agent assumes code works without running tests | Require `run_command` exit code 0 verification |
| **Over-Prescribing "How"** | Over-constrains subagents with rigid implementation details | Specify "What" and Acceptance Criteria |
| **Busy Polling Loops** | Wastes context and CPU waiting on background jobs | Rely on Reactive Wakeup / `schedule` tool |
| **Hardcoded UI Colors** | `bg-white`, `text-black` breaks in dark mode | Use semantic CSS tokens (`text-[var(--foreground)]`) |
| **Viewport Height on Embeds** | `100vh` or `h-screen` collapses `<agent-embed>` | Use intrinsic padding & card containers |

---

## 📚 6. Sub-References & Guides

- **Frontmatter & Trigger Schema**: [references/frontmatter-schema.md](./references/frontmatter-schema.md)
- **Advanced Workflow Archetypes**: [references/workflow-archetypes.md](./references/workflow-archetypes.md)
- **Generative UI Design System Guide**: [references/generative-ui-guide.md](./references/generative-ui-guide.md)
- **Directory Layout & File Types**: [references/directory-layout.md](./references/directory-layout.md)
- **Complete Sample Skill**: [examples/sample-skill-structure.md](./examples/sample-skill-structure.md)
