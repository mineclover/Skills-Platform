---
name: maintenance-lifecycle-controller
description: Control the state machine of maintenance cases from signal intake through horizontal exploration, topic selection, responsibility routing, vertical context, resolution, validation, release, stabilization, closure, and reopening. Use for any maintenance workflow requiring auditable transitions and recursive child cases.
---

# Maintenance Lifecycle Controller

## 역할

하나의 `Maintenance Case`를 상태 전이로 관리한다. 행동을 직접 수행하기보다 필요한 컨텍스트·행동·게이트를 호출하고 전환 조건을 검증한다.

## 기본 상태 머신

```text
SIGNALLED
→ EXPLORING
→ TOPIC_SELECTED
→ ROUTED
→ CONTEXT_READY
→ RESOLVING
→ VALIDATING
→ RELEASING
→ STABILIZING
→ CLOSED
```

보조 상태:

```text
DEFERRED ESCALATED REJECTED ROLLED_BACK REOPENED
```

## 케이스 계약

```yaml
case_id: CASE-save-loss-2026-008
state: exploring
signal_refs: []
parent_case_id: null
selected_topic_id: null
context_refs: []
behavior_run_refs: []
change_set_refs: []
evidence_refs: []
transition_history: []
```

## 전환 게이트

- `SIGNALLED → EXPLORING`: 신호 정규화와 탐색 scope 준비
- `EXPLORING → TOPIC_SELECTED`: 후보·선택 근거·topic ID
- `TOPIC_SELECTED → ROUTED`: responsibility route
- `ROUTED → CONTEXT_READY`: published Vertical Context
- `CONTEXT_READY → RESOLVING`: responsibility/tool invocation gate
- `RESOLVING → VALIDATING`: change or handoff result와 diagnosis
- `VALIDATING → RELEASING`: acceptance pass, rollback, approval
- `RELEASING → STABILIZING`: release evidence와 관찰 창
- `STABILIZING → CLOSED`: production evidence와 closure outcome

## 재귀 케이스

수직 해결 중 새 탐색이 필요하면 child case를 만든다.

```yaml
parent_case_id: CASE-save-loss-2026-008
parent_topic_id: TOPIC-save-event-loss
parent_behavior_run_id: VRUN-save-loss-003
```

부모는 `RESOLVING` 상태에서 paused metadata를 가지며, 자식 결과가 Context Patch로 반영된 뒤 재개한다.

## 긴급 경로

심각한 장애에서는 최소 책임 게이트와 rollback 기준을 가진 containment context로 `RESOLVING`에 진입할 수 있다. 이후 정규 탐색·근본 해결 케이스를 반드시 생성한다.

## 금지 규칙

- 증거 없이 상태를 건너뛰지 않는다.
- 테스트 통과만으로 `CLOSED`로 이동하지 않는다.
- child case 해결을 parent case 자동 완료로 해석하지 않는다.
- 외부 이관을 owned resolution으로 기록하지 않는다.
- 상태 이력과 사용 컨텍스트를 삭제하지 않는다.

## 완료 게이트

- 모든 전환에 timestamp, actor/tool, evidence, reason이 있음
- 현재 상태의 진입 조건이 충족됨
- parent/child 관계가 추적됨
- closure outcome이 구체적으로 기록됨
