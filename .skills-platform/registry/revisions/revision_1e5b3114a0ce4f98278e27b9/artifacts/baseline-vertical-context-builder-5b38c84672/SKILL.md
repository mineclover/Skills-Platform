---
name: baseline-vertical-context-builder
description: Build an immutable vertical prior-context snapshot for exactly one canonical topic, including its role, concrete measurable goal, applicable conventions, current evidence, responsibility envelope, public projections of dependencies, acceptance criteria, and reopen conditions. Use before vertical problem-solving behavior.
---

# Vertical Context Builder

## 역할

하나의 canonical `topic_id`를 해결하는 데 필요한 사전 컨텍스트를 컴파일한다. 해결 절차나 코드 패치는 작성하지 않는다.

## 필수 입력

- Topic Handoff와 Topic Registry
- subject Element baselines
- Convention Registry
- Responsibility Registry
- 현재 evidence
- 직접 계약·상태·런타임 사실
- 비관리 의존 요소의 Public Projection
- acceptance source

## 필수 출력

```yaml
context_id: VC-resource-mapping-005
context_version: 4
context_type: vertical
state: published
snapshot_hash: sha256:...
topic: {topic_id: TOPIC-browser-resource-mapping}
role: {}
goal: {}
conventions: {}
current_state: {}
responsibility_envelope: {}
dependency_projections: []
acceptance_criteria: []
reopen_conditions: []
```

## 컴파일 절차

1. 정확히 하나의 주 topic ID를 고정한다.
2. 상위 시스템에서의 역할과 non-role을 기록한다.
3. 구체적 목표를 측정 가능한 결과로 작성한다.
4. 전역→도메인→요소→토픽 컨벤션을 조립한다.
5. confirmed, observed, hypothesis를 분리한다.
6. Responsibility Envelope를 생성하고 허용/금지 변경 범위를 기록한다.
7. 관리 요소는 상세 정본, 소비·외부 요소는 Public Projection만 포함한다.
8. 수용 기준과 검증 증거 유형을 정의한다.
9. 새 수평 탐색으로 재개해야 할 조건을 명시한다.
10. 80k 예산 검증 후 snapshot을 발행한다.

## 컨텍스트 깊이

```text
managed             내부 정본과 테스트까지
boundary-managed    어댑터·계약·실패 처리까지
delegated-managed   위임된 하위 범위만
consumed             공개 계약만
observed             관측 규격과 증거만
external             공개 정보·제약·이관 경로만
```

## 금지 규칙

- 실제 변경 계획을 정본 컨텍스트로 고정하지 않는다.
- 복수 주 토픽을 하나의 Vertical Context에 넣지 않는다.
- 탐색 전체 역사와 탈락 후보를 복사하지 않는다.
- 비관리 요소 내부 상세를 필요 이상 포함하지 않는다.
- acceptance 없이 “개선” 목표만 작성하지 않는다.

## 완료 게이트

- 하나의 topic ID, 역할, 목표가 있음
- 적용 컨벤션과 책임 범위가 있음
- 현재 사실·가설·증거가 분리됨
- 수용 기준과 reopen 조건이 있음
- 스냅샷이 80k 이내로 발행됨
