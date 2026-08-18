# ADR 0002: Separate Platform Artifact Types (Skill, Rule, Hook, Plugin, MCP Server)

**Status:** Accepted  
**Date:** 2026-08-19

## Context

Different AI agent platforms and runtimes introduce specific operational abstractions:
- **Skills (`skill`)**: Task-oriented markdown instructions (`SKILL.md`) discovered and executed progressively by agents (Codex, Claude, Antigravity, etc.).
- **Rules (`rule`)**: Persistent, always-on or workspace-scoped behavioral guidelines (`RULE.md`, `.antigravity/rules/`, `CLAUDE.md`, `.cursorrules`).
- **Hooks (`hook`)**: Event-driven scripts and lifecycle hooks (`HOOK.md`, pre-tool/post-tool handlers, git hooks).
- **Plugins (`plugin`)**: Tool extensions with manifests and runtime declarations (`PLUGIN.md`, `plugin.json`, Codex plugins in `config.toml`).
- **MCP Servers (`mcp_server`)**: Model Context Protocol configurations and endpoint definitions (`MCP.md`, `mcp.json`, `claude_desktop_config.json`).

Treating all artifacts purely as generic skills obscures platform constraints, delivery paths, and execution semantics.

## Decision

1. **First-Class Artifact Types**:
   The shared contracts and catalog introduce an explicit `artifact_type` field across contracts, registry entries, lineages, profiles, and activation plans:
   - Supported types: `skill`, `rule`, `hook`, `plugin`, `mcp_server`.
   - Default: `skill` (for full backward compatibility).

2. **Deterministic Manifest Discovery**:
   - `SKILL.md` / `skill.md` $\rightarrow$ `skill`
   - `RULE.md` / `*.rule.md` $\rightarrow$ `rule`
   - `HOOK.md` / `*.hook.md` / `*.hook.sh` / `*.hook.js` $\rightarrow$ `hook`
   - `PLUGIN.md` / `plugin.json` $\rightarrow$ `plugin`
   - `MCP.md` / `mcp.json` $\rightarrow$ `mcp_server`
   - YAML frontmatter or JSON manifest can explicitly specify `artifact_type`.

3. **Separation of Policy and Delivery**:
   - **Catalog Control Plane**: Owns the provenance, content digest, metadata (`artifact_type`, `provider_constraints`, `runtime_requirements`), evaluation evidence, and versioned presets.
   - **Activation Plans**: Operations retain `artifact_type` and route to appropriate target delivery paths without mutating unmanaged platform roots.
   - **Prompt Injection & Work-Scope Overlays**: Rules and Skills are filtered and injected according to explicit scoping policies.

## Consequences

- Different artifact types share the core immutability and digest-verification model while maintaining type-specific delivery and discovery semantics.
- Platforms with unique structures (such as Codex plugins, Claude hooks, Antigravity rules) can be targeted precisely with `provider_constraints` and `artifact_type`.
- Existing `SKILL.md` repositories and tests remain 100% compatible.
