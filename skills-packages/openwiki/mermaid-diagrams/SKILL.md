---
name: mermaid-diagrams
description: Embed Mermaid diagrams in generated wiki pages. Use whenever documenting a runtime or request flow, a call sequence, a state machine or lifecycle, a data model or entity relationships, or non-trivial control flow, since these are clearer as a diagram than as prose. Also use when an update run touches a page that already contains a mermaid fence, or a page that contains a text fence a previous run degraded.
---

# Mermaid Diagrams In Generated Wiki Pages

Diagrams are part of high-quality wiki generation, not decoration. Where a flow,
lifecycle, or data model is easier to grasp visually, embed a Mermaid diagram in
a fenced ```mermaid block on the most relevant page.

## 1. Choosing a Diagram Type

- `sequenceDiagram` for runtime and request flows across components (auth flows, request lifecycles, agent tool loops).
- `stateDiagram-v2` for lifecycles and state machines (job states, connection states, run phases).
- `erDiagram` for the data model: entities and their relationships.
- `flowchart TD` for branching control flow and decision logic.

## 2. Diagram Discipline

- Ground every diagram in inspected source. Do not invent participants, states, entities, or relationships the code does not support.
- Cover the high-value cases: add a diagram wherever a page documents a request or runtime flow, a call sequence, a lifecycle or state machine, or a data model. Skip pages that are navigation, reference tables, or pure configuration.
- Still prefer a few strong diagrams over decorating every page: one accurate diagram on the page that needs it beats a diagram forced onto every page.
- Give each diagram a one-line caption directly below it stating what it shows.
- OpenWiki validates every mermaid fence after your run and converts fences that fail to parse into plain text fences. A degraded diagram is a quality failure; follow the syntax rules carefully.

## 3. Syntax Safety & Escaping

To prevent parser and renderer breakages across different markdown previewers:
- Review the comprehensive [Mermaid Syntax Safety Rules](./references/syntax-safety-rules.md) for label escaping, participant alias conventions, and reserved keyword conflicts.

## 4. Update Runs

- A wrong diagram is a stale claim, not existing structure to preserve. If a source change makes a diagram inaccurate, update the diagram in the same edit as the surrounding prose.
- Do not rewrite a diagram that is still accurate. Regenerating unchanged diagrams creates diff noise.
- If a page contains a text fence preceded by an HTML comment starting with `openwiki: mermaid parse failed`, that is a diagram a previous run degraded. Fix the syntax using the parser error in the comment, restore the ```mermaid fence, and delete the comment.

---

## 5. 스킬 거버넌스 및 유지보수 워크플로 (Skills Platform Maintenance & Golden Path)

본 스킬은 Skills Platform의 불변 레지스트리 및 참조 링크(`symlink`) 아키텍처에 의해 관리됩니다:

- **원본 패키지 (Canonical Source)**: `~/workflow/Skills-Platform/skills-packages/openwiki/mermaid-diagrams/`
- **배포 및 관리 방식**: Skills Platform Registry 불변 스냅샷 $\to$ Skills Manager 어댑터 참조 링크(`symlink`) 배포
- **업데이트 사이클 (Golden Path)**:
  1. **원본 수정**: 다이어그램 가이드 및 렌더링 규칙 보완 시 원본 패키지(`skills-packages/openwiki/mermaid-diagrams/`)를 편집합니다.
  2. **정적 거버넌스 검증**:
     ```bash
     node apps/skills-catalog/src/cli.js skill validate skills-packages/openwiki/mermaid-diagrams --provider antigravity
     node apps/skills-catalog/src/cli.js skill validate skills-packages/openwiki/mermaid-diagrams --provider codex
     ```
  3. **새 불변 리비전 임포트 (필요 시)**:
     ```bash
     node apps/skills-catalog/src/cli.js import-local skills-packages/openwiki/mermaid-diagrams
     ```
  4. **프로젝트 참조 링크 최신화**:
     ```bash
     node apps/skills-catalog/src/cli.js project link openwiki mermaid-diagrams --latest
     ```
  5. **참조 링크 직접 수정 시의 동기화**: 프로젝트 작업 중 심볼릭 링크를 통해 직접 수정한 경우라도, 작업 완료 후 원본 패키지에 변경 사항을 반영하고 위 절차를 통해 레지스트리 무결성을 유지합니다.
