---
name: maintenance-method-registry
description: Register tool-independent exploration, diagnosis, validation, release, and governance methods with suitability rules, required capabilities, procedure phases, outputs, evidence, and lifecycle state. Use when horizontal context must know how to explore or vertical behavior must choose a problem-solving method without naming a concrete tool.
---

# Maintenance Method Registry

## 역할

`Method`를 특정 제품·API와 분리된 절차로 관리한다.

```text
Method
= 특정 목적을 달성하기 위한 도구 독립적 조사·진단·해결 방식
```

예:

- `runtime-event-order-analysis`
- `dependency-impact-analysis`
- `contract-compatibility-comparison`
- `state-machine-reproduction`
- `root-cause-hypothesis-elimination`
- `canary-stability-evaluation`

## 매니페스트

```yaml
method_id: method.runtime-event-order-analysis
version: 1.1.0
orientation: both
purpose: 이벤트 순서와 경합 조건을 증거로 확인한다.
suitable_when:
  - lifecycle-order-is-uncertain
not_suitable_when:
  - target-cannot-be-observed
required_capabilities:
  - capability.capture-runtime-events
  - capability.normalize-timeline
optional_capabilities:
  - capability.compare-environments
procedure_phases:
  - define-event-set
  - capture
  - normalize
  - compare
required_outputs:
  - event-order-map
  - evidence-record
completion_evidence:
  - reproducible-trace
status: enabled
owner_ref: team.maintenance-methods
```

## 등록 규칙

- Method는 행동의 판단 단위이고 Tool은 실행 수단이다.
- `suitable_when`과 `not_suitable_when`을 모두 기록한다.
- 필요한 Capability를 최소 단위로 나눈다.
- orientation은 `horizontal | vertical | both`로 선언한다.
- 결과 스키마와 최소 evidence를 정의한다.
- 성공·실패 사례를 효과성 리뷰와 연결한다.

## 수명주기

```text
registered
→ evaluated
→ enabled
→ restricted
→ deprecated
→ retired
```

## 금지 규칙

- Chrome DevTools 같은 특정 툴명을 Method ID로 사용하지 않는다.
- “조사한다”처럼 종료 증거가 없는 Method를 등록하지 않는다.
- mutate 단계가 포함된 Method를 observe-only로 표시하지 않는다.
- 도메인 컨벤션을 Method 내부에 영구 하드코딩하지 않는다.

## 완료 게이트

- 목적·적합 조건·필요 Capability가 있음
- procedure와 output/evidence가 있음
- orientation과 status·owner가 있음
- Horizontal/Vertical Context가 선택 규칙으로 참조 가능함
