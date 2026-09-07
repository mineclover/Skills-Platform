---
name: write-connector
description: Add a new built-in OpenWiki source connector. Use when a user asks to create or implement an OpenWiki connector.
---

# Write An OpenWiki Connector

OpenWiki connectors are built-in TypeScript modules in the OSS repository. Do not create a plugin marketplace, dynamic connector package, or runtime-loaded untrusted connector. Add normal source files and tests.

## 1. Prefer Custom MCP For Arbitrary Servers

If the knowledge source already exposes a read-only MCP server (HTTP or stdio), use the built-in `custom-mcp` connector instead of adding a new ConnectorId:

- Configure `~/.openwiki/connectors/custom-mcp/config.json` with `enabled`, `transport`, optional `allowedTools`, and optional `readOnlyOperations`.
- Put secrets in `~/.openwiki/.env` and reference them as `${ENV_NAME}` in transport headers/env.
- Agent tools `openwiki_list_mcp_tools` / `openwiki_call_mcp_tool` accept `custom-mcp`.

Add a dedicated built-in connector only when you need provider-specific auth, scoping UI, or deterministic API pulls that MCP cannot express.

## 2. Required Shape & Filesystem Layout

- Connectors must implement `ConnectorRuntime` and store config, state, and raw artifacts in well-defined paths under `~/.openwiki/connectors/<id>/`.
- For complete interface types and storage paths, read the [ConnectorRuntime Specification](./references/connector-runtime-spec.md).

## 3. Security Rules

- Never read, print, log, return, or hardcode secret values.
- Do not store credentials in connector config, raw files, state, logs, or tests.
- Validate connector IDs and raw file paths so reads and writes stay inside `~/.openwiki/connectors/<id>/`.
- Use deterministic ingestion code for credentialed external fetching.
- If wrapping MCP, treat the MCP server as read-only and call only allowlisted read/dump operations from connector config.
- Do not let untrusted connector manifests instantiate arbitrary commands or arbitrary network endpoints without explicit built-in code review.
- For `custom-mcp`, users configure a reviewed built-in wrapper; still require allowedTools and/or MCP readOnlyHint before agentic tool calls.

## 4. Ingestion Rules

- Git/local repos should write compact manifests and let the agent inspect the local repo as the source of truth.
- Sources with timestamps should store per-stream cursors.
- Sources with object metadata should store IDs, last edited timestamps, and content hashes.
- Sources with pagination should store enough state to continue without refetching everything.
- Raw dumps should preserve source IDs, timestamps, URLs, authors, and enough provenance for citations.

## 5. User-Facing Finish

When done, inform the user:
- which connector files changed,
- which env vars to set in `~/.openwiki/.env`,
- what config file to create or edit,
- how to run `openwiki personal --update` to trigger ingestion,
- which scopes/permissions the source provider requires.

---

## 6. 스킬 거버넌스 및 유지보수 워크플로 (Skills Platform Maintenance & Golden Path)

본 스킬은 Skills Platform의 불변 레지스트리 및 참조 링크(`symlink`) 아키텍처에 의해 관리됩니다:

- **원본 패키지 (Canonical Source)**: `~/workflow/Skills-Platform/skills-packages/openwiki/write-connector/`
- **배포 및 관리 방식**: Skills Platform Registry 불변 스냅샷 $\to$ Skills Manager 어댑터 참조 링크(`symlink`) 배포
- **업데이트 사이클 (Golden Path)**:
  1. **원본 수정**: 커넥터 인터페이스 변경 시 원본 패키지(`skills-packages/openwiki/write-connector/`)를 편집합니다.
  2. **정적 거버넌스 검증**:
     ```bash
     node apps/skills-catalog/src/cli.js skill validate skills-packages/openwiki/write-connector --provider antigravity
     node apps/skills-catalog/src/cli.js skill validate skills-packages/openwiki/write-connector --provider codex
     ```
  3. **새 불변 리비전 임포트 (필요 시)**:
     ```bash
     node apps/skills-catalog/src/cli.js import-local skills-packages/openwiki/write-connector
     ```
  4. **프로젝트 참조 링크 최신화**:
     ```bash
     node apps/skills-catalog/src/cli.js project link openwiki write-connector --latest
     ```
  5. **참조 링크 직접 수정 시의 동기화**: 프로젝트 작업 중 심볼릭 링크를 통해 직접 수정한 경우라도, 작업 완료 후 원본 패키지에 변경 사항을 반영하고 위 절차를 통해 레지스트리 무결성을 유지합니다.
