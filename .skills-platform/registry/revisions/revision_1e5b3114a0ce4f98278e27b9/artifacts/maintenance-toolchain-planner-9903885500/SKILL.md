---
name: maintenance-toolchain-planner
description: Convert a selected maintenance method into an executable toolchain by matching required capabilities to available tool bindings and filtering by lifecycle stage, environment, responsibility, authority, evidence quality, reversibility, intrusiveness, cost, and fallback. Use before horizontal exploration, vertical diagnosis, mutation, validation, release, or governance execution.
---

# Maintenance Toolchain Planner

## 역할

행동이 선택한 Method를 실제 Tool Binding 순서로 변환한다.

```text
Method
→ Required Capabilities
→ Candidate Tools
→ Policy Filtering
→ Ordered Toolchain Plan
```

## 입력

- behavior run ID와 lifecycle stage
- selected Method
- published Context Snapshot
- Responsibility Envelope
- available environments
- Tool Registry
- evidence requirement
- 비용·시간·침습성 제한

## 선택 기준

1. Capability 충족
2. lifecycle stage 적합성
3. responsibility mode 호환성
4. 환경·버전 호환성
5. 입력·출력 타입 연결 가능성
6. 필요한 evidence grade
7. 가역성
8. 침습성·side effect
9. 비용과 실행량 제한
10. 실패 시 fallback

## 출력

```yaml
plan_id: TOOLCHAIN-runtime-order-003
behavior_run_id: HRUN-lifecycle-005
method_id: method.runtime-event-order-analysis
required_capabilities: []
bindings:
  - capability: capability.capture-runtime-events
    tool_id: tool.chrome-cdp-trace-capture
    order: 1
    input_from: context.runtime_target
  - capability: capability.normalize-timeline
    tool_id: tool.event-timeline-normalizer
    order: 2
    input_from: binding.1.output
context_ref: {}
responsibility_envelope_ref: RESP-001
approvals: []
fallbacks: []
```

## 계획 규칙

- observe-only 수평 탐색에서는 mutate/control Tool을 배제한다.
- 수직 변경 전 diagnosis와 validation Capability를 함께 계획한다.
- Tool output type이 다음 Tool input type과 호환되는지 확인한다.
- 동일 Capability 후보가 여러 개면 evidence·권한·비용을 비교한다.
- fallback은 실패 모드별로 연결한다.
- 외부 Tool 호출에는 데이터 노출 정책을 포함한다.

## 금지 규칙

- 편의상 첫 번째 Tool을 선택하지 않는다.
- Context에 없는 target이나 credential을 생성하지 않는다.
- mutate Tool을 rollback/validation 없이 단독 계획하지 않는다.
- deprecated/retired Tool을 기본 선택하지 않는다.
- responsibility gate를 Planner 내부 판단만으로 대체하지 않는다.

## 완료 게이트

- 모든 required capability가 바인딩되거나 gap으로 명시됨
- 순서와 데이터 흐름이 유효함
- 책임·환경·증거·가역성 조건을 통과함
- Invocation Guard가 검사할 정보가 완비됨
