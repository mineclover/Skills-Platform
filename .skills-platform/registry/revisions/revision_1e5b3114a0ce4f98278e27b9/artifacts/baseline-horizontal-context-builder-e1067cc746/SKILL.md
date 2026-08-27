---
name: baseline-horizontal-context-builder
description: Build immutable horizontal prior-context snapshots that describe exploration scope, available methods and capabilities, method-selection rules, source authority, comparison criteria, topic-selection rules, ownership-discovery methods, and stop conditions. Use before any horizontal topic exploration behavior.
---

# Horizontal Context Builder

## 역할

수평 행동이 **어떻게 탐색할지 판단할 수 있는 사전 컨텍스트**를 만든다. 실제 후보나 조사 결과를 작성하지 않는다.

## 필수 입력

- 탐색 root와 relation plane
- seed question 또는 Signal
- 활성 도메인
- Method Registry Projection
- Tool Capability availability
- 출처 권위 규칙
- 기존 Element/Topic Registry Projection
- 책임 탐색 방법
- 80k 예산

## 출력 계약

```yaml
context_id: HC-browser-editing-001
context_version: 3
context_type: horizontal
state: published
snapshot_hash: sha256:...
scope:
  root_id: browser-live-editing
  relation_plane: possible-save-paths
  seed_question: 안정적인 로컬 저장 경로는 무엇인가?
exploration_methods:
  allowed_method_ids: []
  selection_rules: []
comparison_criteria: []
topic_selection_rules: []
ownership_discovery: {}
stop_conditions: []
expansion_conditions: []
```

## 빌드 절차

1. Task Mode Route가 horizontal인지 확인한다.
2. 탐색 root와 포함·제외 범위를 명시한다.
3. 질문 유형을 분류하고 적합 Method 후보를 가져온다.
4. `when → use method` 규칙을 작성한다.
5. 공식 문서, 코드, 런타임 증거, 제안 등의 권위 우선순위를 명시한다.
6. 후보가 가져야 할 필드를 정의한다.
7. 비교·중복·선별·종료 기준을 작성한다.
8. ownership discovery 방법을 포함한다.
9. 전체 문맥을 72k 작업 목표로 조립한다.
10. 검증 후 불변 snapshot을 발행한다.

## 포함하지 않는 것

- 실제 검색어와 도구 호출 로그
- 발견된 후보 목록
- 특정 후보의 구현 설계
- 수직 목표와 수용 기준
- 조사 후 새로 알게 된 사실

## 품질 규칙

- Method 이름과 특정 Tool Binding을 구분한다.
- 탐색 범위를 넓힐 조건과 종료할 조건을 모두 둔다.
- 후보 선별 기준에 `responsibility_clarity`와 `resolvability`를 포함한다.
- 기존 토픽 중복 탐지를 필수 단계로 둔다.
- 비관리 요소도 조사할 수 있으나 변경 권한을 부여하지 않는다.

## 완료 게이트

- 탐색 수단과 선택 규칙이 있음
- 비교·선별·중단 기준이 있음
- 출처 권위와 책임 탐색 방법이 있음
- 실제 탐색 결과가 섞이지 않음
- snapshot hash와 버전이 발행됨
