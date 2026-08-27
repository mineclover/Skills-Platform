---
name: baseline-horizontal-exploration-behavior
description: Execute horizontal exploration from a published horizontal context: select methods, plan tools, discover and normalize candidate topics, compare evidence and ownership, deduplicate, rank, and select topics for vertical handoff. Use for broad investigation and topic selection, not implementation.
---

# Horizontal Exploration Behavior

## 역할

발행된 Horizontal Context를 소비해 관련 토픽을 탐색·비교·선별한다.

```text
Horizontal Context
→ Method Selection
→ Toolchain Plan
→ Discovery
→ Candidate Normalization
→ Relationship Mapping
→ Responsibility Scan
→ Ranking
→ Topic Selection
```

## 시작 게이트

- context state가 `published`
- snapshot hash가 고정됨
- 탐색 범위·방법·선별 기준이 존재함
- 행동 run ID가 발행됨
- 허용 Tool Effect가 기본적으로 `observe | analyze | propose`임

## 출력

```yaml
horizontal_result:
  exploration_run_id: HRUN-browser-editing-004
  context_ref: {context_id: HC-browser-editing-001, context_version: 3, snapshot_hash: sha256:...}
  candidates: []
  relationship_map: []
  selected_topics: []
  deferred_topics: []
  external_routes: []
  coverage: {}
  context_patch_proposals: []
```

각 후보는 최소 다음을 가진다.

- candidate ID와 제목
- kind와 subject refs
- 근거와 불확실성
- 관련성·영향도·실현 가능성
- 책임 힌트
- 기존 Topic과의 중복 관계
- 추천 라우팅

## 행동 절차

1. 컨텍스트의 상황별 Method 선택 규칙을 적용한다.
2. Toolchain Planner로 필요한 Capability를 바인딩한다.
3. 서로 다른 권위 출처를 조사한다.
4. 원자 후보를 추출하고 canonical terminology로 정규화한다.
5. 중복 후보와 기존 Topic을 병합한다.
6. 후보 간 의존·대체·포함·차단 관계를 만든다.
7. Responsibility Registry를 조회해 해결 가능성을 판정한다.
8. 컨텍스트의 비교 기준으로 점수 또는 서열을 만든다.
9. 수직 해결에 적합한 후보를 선택한다.
10. Topic Registry와 Topic Handoff Compiler로 전달한다.

## 금지 규칙

- 후보를 직접 구현하거나 수정하지 않는다.
- Toolchain에 mutate/control/govern 툴을 포함하지 않는다.
- 외부 원인을 현재 시스템 owned topic으로 자동 편입하지 않는다.
- 후보 목록만 나열하고 선택 근거 없이 종료하지 않는다.
- 탐색 중 컨텍스트 규칙을 직접 변경하지 않는다.

## 완료 게이트

- 탐색 coverage와 남은 unknown이 있음
- 후보가 동일 기준으로 비교됨
- 중복·관계·책임이 정리됨
- 최소 하나의 선택, 보류, 이관 또는 탐색 종료 결정이 있음
- 선택 토픽이 Topic Handoff로 전환 가능함
