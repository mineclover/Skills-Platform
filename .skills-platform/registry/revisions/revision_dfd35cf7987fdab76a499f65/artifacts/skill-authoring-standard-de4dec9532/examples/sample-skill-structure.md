# Complete Sample Skill Structure

A reference implementation demonstrating a production-grade, full-lifecycle AGY skill combining prompt elicitation, Ralph-style testing loops, and Generative UI widgets.

---

```markdown
---
name: service-refactor-engine
description: >-
  Refactor backend service modules, enforce TDD regression invariants, and render live migration status widgets.
  Use when modernizing legacy services, modularizing monolith code, or executing multi-step architecture migrations.
invocation_mode: hybrid
---

# Service Refactor Engine

Complete runbook for refactoring services with continuous mechanical test verification.

---

## Phase 1: Planning & Target Test Setup

1. **Scan Service Boundaries**: Identify callers and dependencies using `grep_search`.
2. **Establish Target Test**:
   Confirm the target test suite runs cleanly on the baseline:
   \`\`\`bash
   npm test -- test/services/auth-service.test.js
   \`\`\`
3. **Initialize Living Artifact**:
   Create `<appDataDir>\brain\<conversation-id>/refactor_plan.md` with current baseline metrics.

---

## Phase 2: Autonomous Ralph Execution Loop

Execute changes sequentially. Never commit or finish without exit code `0`.

\`\`\`mermaid
graph LR
    A[Apply Refactor Diff] --> B[Run Target Test]
    B -->|Fail| C[Fix Compile/Assertion Errors]
    C --> A
    B -->|Pass| D[Run Global Regression Suite]
    D -->|Pass| E[Complete]
\`\`\`

1. **Surgical Diffs**: Modify files using `replace_file_content`.
2. **Execute Test**:
   \`\`\`bash
   npm test -- test/services/auth-service.test.js
   \`\`\`
3. **Analyze Logs**: If assertions fail, inspect stack trace and refine implementation.

---

## Phase 3: Generative UI Summary & Walkthrough

1. **Generate Status Widget**:
   Write `<appDataDir>\brain\<conversation-id>/refactor_status.html`:
   \`\`\`html
   <!DOCTYPE html>
   <html>
   <head>
     <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
   </head>
   <body class="bg-transparent text-[var(--foreground)] antialiased p-4">
     <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-2">
       <h3 class="text-base font-semibold text-[var(--foreground)]">AuthService Refactor Complete</h3>
       <p class="text-xs text-[var(--muted-foreground)]">32/32 tests passed (0 regressions)</p>
     </div>
   </body>
   </html>
   \`\`\`
2. **Embed in Chat**:
   \`\`\`html
   <agent-embed src="file:///<appDataDir>/brain/<conversation-id>/refactor_status.html"></agent-embed>
   \`\`\`
3. **Produce Walkthrough**: Update `walkthrough.md` with before/after diffs and performance benchmarks.
```
