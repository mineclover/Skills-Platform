---
name: maintenance-closure-learning
description: Close maintenance cases with explicit outcomes, residual risks, handoffs, temporary-measure removal conditions, and learning artifacts; propose updates to contexts, conventions, ownership, methods, tools, and baselines without mutating them directly. Use after stabilization or non-resolution routing.
---

# Closure and Learning Controller

## 역할

케이스를 단순 “완료”가 아니라 구체적 결과로 폐쇄하고, 유지보수 체계가 배운 내용을 정본 변경 제안으로 변환한다.

## 폐쇄 결과

```text
resolved
mitigated
handed-off
accepted-risk
not-a-defect
superseded
deferred
rejected
```

## Closure Record

```yaml
closure:
  outcome: resolved
  topic_id: TOPIC-resource-mapping
  acceptance_summary: []
  production_evidence_refs: []
  residual_risks: []
  temporary_measures: []
  external_handoffs: []
  follow_up_refs: []
```

## 학습 추출

다음을 별도로 평가한다.

- 누락되거나 부정확했던 Context
- 새로 필요한 Convention
- 잘못된 ownership 정보
- 비효율적인 Method
- 부족한 Tool Capability
- 관찰 지표와 acceptance의 누락
- 반복 문제 패턴
- baseline과 구현 drift

각 항목은 직접 registry를 수정하지 않고 Patch Proposal 또는 governance request로 생성한다.

## 임시 조치

임시 폴백·feature flag·manual workaround에는 다음을 기록한다.

- owner
- 제거 조건
- 만료 시점
- 근본 해결 Topic
- 잔여 위험

## 재개 조건

폐쇄 레코드에는 재발, 외부 이슈 해결, 특정 버전 도입, 지표 악화 등 `reopen_conditions`를 둔다.

## 금지 규칙

- 외부 handoff를 해결 완료로 위장하지 않는다.
- 남은 위험과 임시 조치를 숨기지 않는다.
- 행동 결과를 바로 Convention Registry에 쓰지 않는다.
- production evidence 없이 안정화 해결을 확정하지 않는다.

## 완료 게이트

- outcome과 근거가 있음
- residual risk·handoff·follow-up이 있음
- patch proposal과 tool/method review가 분리 생성됨
- 케이스 상태 전이가 감사 가능함
