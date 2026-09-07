---
name: openwiki-cli
description: Install, configure, and operate the OpenWiki CLI to generate, update, and visualize codebase or personal knowledge documentation with grounded claims and live graphs. Use when the user asks to run OpenWiki, document repositories or monorepos, update docs after code changes, export the static visualizer graph, or configure LLM providers.
---

# OpenWiki CLI Usage & Operation Skill

OpenWiki is an agent-driven CLI tool that writes and maintains structured documentation (OKF standard Markdown, Mermaid diagrams, grounded claims, and internal links) inside the `openwiki/` directory.

## 1. Prerequisites & Installation

### Requirements
- **Node.js**: `>= 22` (or `>= 20`)
- **Git** & **pnpm** (or npm)

### Installation Methods
1. **Global npm / npx Install**:
   ```sh
   npm install -g openwiki
   # or run directly with npx
   npx openwiki --help
   ```

2. **Local Repository Build & Global Link (Development)**:
   ```sh
   cd /path/to/openwiki
   pnpm install
   pnpm run build
   pnpm link --global
   ```

3. **Shell Alias**:
   ```sh
   alias openwiki='node /path/to/openwiki/dist/cli/cli.js'
   ```

---

## 2. Configuration & Supported Providers

Credentials and preferences are stored in `~/.openwiki/.env`.

- For complete environment variables, supported LLM providers (OpenAI, Gemini, Anthropic, Bedrock, Ollama, etc.), and reasoning token configurations, see the [Providers and Environment Guide](./references/providers-and-env.md).

---

## 3. Core CLI Workflows

1. **Initial Repository Wiki Generation (`--init`)**:
   Generates a full wiki under `openwiki/`, writes `AGENTS.md`, and initializes durable run tracking.
   ```sh
   openwiki code --init
   # Or with explicit guiding instructions:
   openwiki code --init "Focus heavily on architecture, authentication flows, and API endpoints."
   ```

2. **Update Wiki (`--update` / `-u`)**:
   Inspects Git diff/log since the last update, verifies grounded claims sparsely, and refreshes changed pages and diagrams.
   OpenWiki v0.5.0 supports durable page-level resumability across local, CI, and host runs via `.page-manifest.json`.
   ```sh
   openwiki --update
   # Or focus on specific changes:
   openwiki --update "Updated auth middleware to use OAuth2 PKCE flow."
   ```

3. **One-Shot Print Mode (`-p` / `--print`)**:
   Runs non-interactively, writes the final assistant output to stdout, and exits (ideal for CI/scripts).
   ```sh
   openwiki -p "Summarize the major components in this repo"
   ```

4. **Multi-language Generation (`--language` / `-l`)**:
   Note: OpenWiki strictly validates language codes and rejects unrecognized values instead of falling back to English.
   ```sh
   openwiki code --init -l ko "전체 아키텍처와 핵심 모듈 중심으로 작성해줘"
   openwiki --update -l ko
   ```

- For detailed subcommands (monorepo noise reduction, visualizer options, coding agent installations including Cursor, connector auth, and cron scheduling), see the [CLI Command Reference](./references/cli-commands.md).

---

## 4. Grounded Claims & Sparse Reconciliation

OpenWiki incorporates a **Grounded Claims Engine** (`src/claims/`) that validates assertions made across wiki documentation against actual repository evidence:

1. **Evidence Grounding**: Claims made in wiki pages are resolved and checked against code symbols, AST structure, test suites, and file paths.
2. **Sparse Reconciliation (v0.5.0)**: Updates retain unaffected, issue-free Claims automatically without round-tripping statements and evidence through the model. Only rechecked, revised, or retracted claims are explicitly decided.
3. **Deterministic Provenance (OKF v0.2)**: Every modified concept page deterministically receives a code-owned provenance stamp:
   ```yaml
   generated: { by: "openwiki/0.5.0", at: "2026-09-06T10:00:00.000Z" }
   ```
4. **Automated Verification Loop**:
   - `skeleton_critic`: Evaluates proposed wiki structure against codebase architecture during `--init`.
   - `wiki_question_finder` & `wiki_answer_verifier`: Synthesize queries from source invariants and verify the generated documentation accurately answers them.

---

## 5. Spec Placement & Layering Policy

OpenWiki operates on the principle that **Source code, tests, and human design specs are authoritative (1차 진실의 원천)**, while `openwiki/` is an **automatically generated evidence index (도출된 지식 인덱스)**.

### 3-Tier Spec Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Tier 1: Human-Authored Specs & ADRs                         │
│ Location: docs/specs/*.md, docs/adr/*.md, specs/*.md        │
│ Purpose: System requirements, business rules, architectural │
│          decisions (Authored/reviewed manually by engineers)│
└──────────────────────────────┬──────────────────────────────┘
                               │ (Implementation)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Tier 2: Executable Code Specs & Test Invariants             │
│ Location: src/**/schema.ts (Zod/TS), test/**/*.spec.ts      │
│ Purpose: Runtime contracts, type definitions, assertions    │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Scanned & Grounded by OpenWiki)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Tier 3: Generated Wiki Knowledge Index & Graph              │
│ Location: openwiki/** (quickstart.md, architecture/, domain)│
│ Purpose: Generated navigational wiki & interactive graph.   │
│          DO NOT HAND-EDIT. Auto-refreshed via OpenWiki agent│
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Execution Rules & Safety Guidelines for Agents

1. **Never hand-edit `openwiki/` generated pages directly**:
   Modify source code, tests, or `docs/specs/` first, and let OpenWiki regenerate or update them (`openwiki --update`).
2. **Docs-only sandbox**:
   OpenWiki runs inside a safe filesystem jail; it cannot modify source code outside `openwiki/` during documentation runs.
3. **Mermaid Diagram Discipline**:
   Use `sequenceDiagram`, `stateDiagram-v2`, `erDiagram`, or `flowchart TD`. OpenWiki validates diagram syntax after every run.

---

## 7. 스킬 거버넌스 및 유지보수 워크플로 (Skills Platform Maintenance & Golden Path)

본 스킬은 Skills Platform의 불변 레지스트리 및 참조 링크(`symlink`) 아키텍처에 의해 관리됩니다:

- **원본 패키지 (Canonical Source)**: `~/workflow/Skills-Platform/skills-packages/openwiki/openwiki-cli/`
- **배포 및 관리 방식**: Skills Platform Registry 불변 스냅샷 $\to$ Skills Manager 어댑터 참조 링크(`symlink`) 배포
- **업데이트 사이클 (Golden Path)**:
  1. **원본 수정**: 기능 추가 및 수식/옵션 보완 시 원본 패키지(`skills-packages/openwiki/openwiki-cli/`)를 편집합니다.
  2. **정적 거버넌스 검증**:
     ```bash
     node apps/skills-catalog/src/cli.js skill validate skills-packages/openwiki/openwiki-cli --provider antigravity
     node apps/skills-catalog/src/cli.js skill validate skills-packages/openwiki/openwiki-cli --provider codex
     ```
  3. **새 불변 리비전 임포트 (필요 시)**:
     ```bash
     node apps/skills-catalog/src/cli.js import-local skills-packages/openwiki/openwiki-cli
     ```
  4. **프로젝트 참조 링크 최신화**:
     ```bash
     node apps/skills-catalog/src/cli.js project link openwiki openwiki-cli --latest
     ```
  5. **참조 링크 직접 수정 시의 동기화**: 프로젝트 작업 중 심볼릭 링크를 통해 직접 수정한 경우라도, 작업 완료 후 원본 패키지에 변경 사항을 반영하고 위 절차를 통해 레지스트리 무결성을 유지합니다.
