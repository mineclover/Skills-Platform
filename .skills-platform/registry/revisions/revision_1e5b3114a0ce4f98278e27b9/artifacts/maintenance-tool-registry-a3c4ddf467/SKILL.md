---
name: maintenance-tool-registry
description: Register atomic capabilities and concrete tool bindings with effects, environments, inputs, outputs, side effects, evidence grade, failure modes, responsibility compatibility, mutation policy, reversibility, ownership, and lifecycle state. Use to define the executable tool layer beneath maintenance behaviors.
---

# Maintenance Tool Registry

## 역할

두 종류를 관리한다.

```text
Capability
= 도구 독립적인 원자 기능

Tool Binding
= 하나 이상의 Capability를 실제 환경에서 제공하는 실행체
```

## Capability 예

```yaml
capability_id: capability.capture-runtime-trace
effect_class: observe
input_types: [runtime-target, trace-filter]
output_types: [runtime-trace, timestamped-events]
required_authority: runtime-observation
```

## Tool 예

```yaml
tool_id: tool.chrome-cdp-trace-capture
tool_version: 1.4.0
provides_capabilities:
  - capability.capture-runtime-trace
  - capability.inspect-network-events
lifecycle_roles: [observe, explore, diagnose, stabilize]
behavior_orientations: [horizontal, vertical]
effect_class: observe
supported_responsibility_modes: [managed, delegated-managed, boundary-managed, consumed, observed, external]
environments: [chromium]
inputs: []
outputs: []
preconditions: []
side_effects: [runtime-overhead]
failure_modes: [permission-denied, target-detached]
evidence:
  grade: runtime
  reproducibility: environment-dependent
owner_ref: team.browser-tooling
status: enabled
```

## 효과 등급

```text
observe
analyze
propose
mutate
control
govern
```

상위 등급은 하위 권한을 자동 포함하지 않는다. 실제 Capability와 정책을 각각 검사한다.

## 변경 정책

mutate/control/govern Tool은 다음을 가져야 한다.

- required responsibility modes
- allowed/forbidden target patterns
- approval requirements
- Change Set requirement
- Validation Plan requirement
- Rollback Plan requirement
- reversibility level

## 증거 등급

```text
reference
declared
implementation
runtime
validated
production
```

## 수명주기

```text
REGISTERED
→ EVALUATED
→ ENABLED
→ RESTRICTED
→ DEPRECATED
→ RETIRED
```

## 금지 규칙

- Capability와 Tool 이름을 동일시하지 않는다.
- 제공하지 않는 Capability를 설명만으로 추정하지 않는다.
- side effect와 권한 범위를 생략하지 않는다.
- retired Tool을 새 Toolchain에 바인딩하지 않는다.
- mutate Tool을 observe Method에 암묵 삽입하지 않는다.

## 완료 게이트

- Capability와 binding이 별도 ID를 가짐
- 효과·환경·입출력·실패·증거가 정의됨
- 변경 Tool에 responsibility와 rollback 정책이 있음
- 상태와 owner가 있음
