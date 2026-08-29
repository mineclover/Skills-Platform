---
name: skill-authoring-standard
description: Comprehensive standard and authoring guide for creating, structuring, and maintaining first-class skills in Skills Platform and Antigravity. Use when authoring new skills, refactoring existing skills, auditing skill frontmatter, or structuring references and helper scripts.
---

# Skill Authoring Standard (Skills Platform & Antigravity)

Authoritative convention and quality standard for authoring high-signal, executable, and portable skills.

## 🏗️ 1. Standard Skill Directory Anatomy

Every skill package in the repository MUST follow this structured layout:

```text
skills/<skill_name>/
├── 📄 SKILL.md            # Required: Main instruction runbook with YAML frontmatter
├── 📚 references/         # Optional: Deep schemas, variant policies, large API references
├── 🛠️ scripts/            # Optional: Executable helpers, validators, deterministic converters
├── 💡 examples/           # Optional: Concrete walkthroughs, sample payloads, input/output pairs
└── 🎨 assets/             # Optional: Templates, starter boilerplate, static assets
```

---

## 📋 2. Frontmatter Standards (`SKILL.md`)

Every `SKILL.md` file MUST begin with a YAML frontmatter block containing:

```markdown
---
name: <lowercase-kebab-name>
description: >-
  Concise 3rd-person summary of what this skill does and the exact scenarios when the agent should activate it.
  Format: "Do X when Y. Use when Z..."
---
```

### Frontmatter Rules:
- **`name`**: Lowercase alphanumeric and hyphens (e.g. `vertical-spec-documenter`, `worktree-lifecycle-orchestrator`).
- **`description`**: The most critical selector. Always use **third-person** and specify concrete activation triggers (`"Use when authoring new skills, refactoring..."`).

---

## 🎯 3. Core Authoring Principles

### ① High-Signal Procedural Flow
- Make `SKILL.md` the central runbook: clear numbered steps, decision branches, and concrete tool commands.
- Focus on the **unique procedure** of the workflow; do not duplicate generic coding knowledge that the LLM already knows.

### ② Pragmatic Progressive Disclosure
- Keep the main `SKILL.md` clean and focused on action steps.
- Move bulky tables, extensive API schemas, or niche edge-case manuals into `references/<topic>.md` and link them using standard markdown links (e.g. `[Frontmatter Schema](./references/frontmatter-schema.md)`).
- The agent reads referenced files only when needed, maintaining optimal context efficiency.

### ③ Grounding in Executable Tooling
- Encapsulate complex or multi-step command pipelines into CLI tools or `scripts/` helpers rather than asking the agent to assemble raw shell commands.

### ④ Deterministic Verification Gate
- Always conclude with a verification section explaining how the agent (or operator) proves the procedure succeeded (e.g. CLI exit code, log assertion, test suite run).

---

## 📚 4. Sub-References & Guides

- **Frontmatter & Trigger Phrasing**: [references/frontmatter-schema.md](./references/frontmatter-schema.md)
- **Directory Layout & Subfolder Usage**: [references/directory-layout.md](./references/directory-layout.md)
- **Complete Sample Skill**: [examples/sample-skill-structure.md](./examples/sample-skill-structure.md)
