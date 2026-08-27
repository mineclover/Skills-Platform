---
name: baseline-vertical-resolution-behavior
description: Execute problem resolution for one canonical topic from a published vertical context: reproduce and measure, test hypotheses, choose an owned resolution location, design and apply allowed changes, validate evidence, and produce closure or reopen outputs. Use for implementation and verified problem solving.
---

# Vertical Resolution Behavior

## 역할

발행된 Vertical Context에 결박되어 하나의 토픽을 실제로 해결한다.

## 시작 게이트

다음이 모두 있어야 한다.

- canonical `topic_id`
- context snapshot ref
- concrete goal
- applicable conventions
- responsibility envelope
- acceptance criteria
- 허용 Tool Effect 범위

## 실행 절차

```text
Context Gate
→ Reproduce / Measure
→ Separate Facts and Hypotheses
→ Test Root-Cause Candidates
→ Select Resolution Location
→ Design Change Set
→ Responsibility Gate
→ Apply Change
→ Validate
→ Closure or Reopen
```

## 출력

```yaml
vertical_result:
  behavior_run_id: VRUN-resource-mapping-018
  topic_id: TOPIC-browser-resource-mapping
  context_ref: {}
  diagnosis: {}
  change_set_refs: []
  validation_evidence_refs: []
  closure:
    status: resolved
    acceptance_passed: true
  exploration_requests: []
  context_patch_proposals: []
  external_routes: []
```

## 문제 해결 규칙

- 증상 위치, 원인 위치, 해결 위치를 분리한다.
- 원인 가설은 반증 가능한 검사와 연결한다.
- 변경은 managed/delegated/boundary-managed 범위에만 적용한다.
- 공유 계약 변경 필요 시 별도 수평 변경 토픽을 생성한다.
- 외부 원인은 증거, 이관, 관리 경계 완화로 처리한다.
- 새 후보 비교가 필요하면 child horizontal exploration을 생성한다.
- 하위 작업이 끝난 뒤 부모 작업은 새 Context Snapshot으로 재개한다.

## 금지 규칙

- 목표를 실행 중 임의 확장하지 않는다.
- consumed/observed/external 요소 내부를 수정하지 않는다.
- Context에 없는 컨벤션을 편의상 무시하지 않는다.
- 테스트 없이 해결을 선언하지 않는다.
- 새 탐색을 현재 수직 run 안에서 무제한 수행하지 않는다.
- 행동이 Context Registry를 직접 수정하지 않는다.

## 완료 게이트

- 재현 또는 명시적 비재현 근거가 있음
- 원인과 해결 위치가 구분됨
- 변경 또는 이관 결과가 책임 범위와 일치함
- acceptance evidence가 있음
- resolved, mitigated, escalated, deferred, reopen 중 하나로 종료됨
