# OpenWiki CLI Command & Flag Reference

Complete reference for OpenWiki CLI subcommands, execution flags, and workflows.

---

## 1. Repository Documentation Commands

### Initial Wiki Generation (`code --init`)

Scans the repository, traces end-to-end flows, maps dependencies, and generates initial documentation under `openwiki/`, `AGENTS.md`, and `.last-update.json`.

```bash
openwiki code --init
# With domain-specific guiding instructions:
openwiki code --init "Focus heavily on architecture, authentication flows, and API endpoints."
# In specific language (strictly validates BCP-47 locale, rejecting unrecognized codes):
openwiki code --init -l ko "전체 아키텍처와 핵심 모듈 중심으로 작성해줘"
```

### Updating Wiki (`--update` / `-u`)

Inspects Git diff/log since the last recorded update, checks grounded claims, and refreshes changed pages and diagrams.
OpenWiki v0.5.0 maintains durable page progress manifests (`openwiki/.page-manifest.json`) for seamless cross-host and CI/local run resumption:

```bash
openwiki --update
# Focus on specific source edits:
openwiki --update "Updated auth middleware to use OAuth2 PKCE flow."
# Multi-language update:
openwiki --update -l ko
```

### One-Shot Print Mode (`-p` / `--print`)

Runs non-interactively without opening interactive chat, writes the final response to stdout, and terminates immediately (ideal for CI/CD and scripts).

```bash
openwiki -p "Summarize the major components in this repo"
```

### Model Override (`--modelId` / `--model-id`)

Overrides the configured default model for a single run:

```bash
openwiki --modelId openai/gpt-5.6-terra
openwiki --modelId anthropic/claude-3-7-sonnet
openwiki --modelId gemini/gemini-2.5-pro
```

---

## 2. Monorepo Noise Reduction (`.openwikiignore`)

Create `.openwikiignore` at repository root before running `--init`:

```gitignore
**/node_modules/
**/dist/
**/build/
**/.turbo/
**/.next/
**/coverage/
**/*.log
```

---

## 3. Visualizer Commands

### Interactive Web Visualizer

Launches a local loopback server (`127.0.0.1:4321`) with an interactive force-directed graph, side-by-side markdown reader, resizable/collapsible graph panel, decluttered node labels, and SSE live reload:

```bash
openwiki visualize
openwiki visualize ./openwiki --port 3000 --no-open
```

### Static Web Export

Exports a standalone HTML/JS/CSS package hostable on GitHub Pages, Vercel, or S3 with bundled graph snapshot:

```bash
openwiki visualize openwiki --export ./public/wiki-graph
```

---

## 4. Host Integrations & Coding Agents

OpenWiki supports installation targets for major agent environments:

```bash
openwiki install codex     # OpenAI Codex (.agents/skills/openwiki & .codex/config.toml)
openwiki install claude    # Claude Code (.claude/skills/openwiki & .claude.json)
openwiki install opencode  # OpenCode (.opencode/skills/openwiki & opencode.jsonc)
openwiki install cursor    # Cursor (.cursor/skills/openwiki & .cursor/mcp.json)
```

---

## 5. Connectors, Auth & Scheduling Subcommands

### OAuth Connectors (`auth`)

```bash
openwiki auth                      # List auth status
openwiki auth <gmail|notion|slack|x> # Run OAuth login flow
openwiki auth configure <provider> # Configure connector with env
openwiki auth tools <provider>     # List MCP tools for provider
```

### Ingestion (`ingest`)

```bash
openwiki ingest [target]           # Ingest external data from connectors
```

### Scheduled Auto-Sync (`cron`)

```bash
openwiki cron list
openwiki cron pause <source|all>
openwiki cron resume <source|all>
openwiki cron delete <source|all>
```
