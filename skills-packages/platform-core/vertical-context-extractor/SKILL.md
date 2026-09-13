---
name: vertical-context-extractor
description: Extract strict local context pack, types, and single target test file for isolated vertical execution.
hooks:
  - id: scope-boundary-enforcer
    name: Scope Boundary Enforcer
    event: post_tool_use
    description: Audits file modifications against active topic scope and detects out-of-bounds mutations.
    enabled: true
    matcher: "write_to_file|replace_file_content"
    handler:
      type: script
      target: scripts/scope-boundary-enforcer.js
      timeout_ms: 5000
    priority: 20
    providers:
      - antigravity
      - claude
      - codex
    failure_policy: open
---

# Vertical Context Extractor

Extract strict local context pack, types, and single target test file for isolated vertical execution.

## Core Directives

1. **Context Boundary Isolation**: Only read and extract context relevant to the active vertical topic.
2. **Out-of-Bounds Protection**: Respect `local_horizontal_scope.owned_files` and avoid modifying code outside the active scope.
3. **Companion Hooks**:
   - `scope-boundary-enforcer`: Automatically intercepts file mutations and audits against the declared scope.
