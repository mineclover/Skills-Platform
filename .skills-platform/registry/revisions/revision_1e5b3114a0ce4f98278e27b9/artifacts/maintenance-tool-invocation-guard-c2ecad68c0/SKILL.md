---
name: maintenance-tool-invocation-guard
description: Authorize or block each maintenance tool invocation by checking context snapshot, lifecycle stage, method and toolchain membership, responsibility mode, target scope, effect class, approvals, data policy, validation plan, rollback plan, and runtime preconditions. Use immediately before every tool call, especially mutate, control, or govern operations.
---

# Maintenance Tool Invocation Guard

## 역할

실제 Tool 호출 직전에 실행 권한과 안전 조건을 검사한다. Planner가 적합한 툴을 골랐더라도 Guard를 우회할 수 없다.

## 입력

- Toolchain Plan과 binding
- Tool Manifest
- Context Snapshot ref
- Behavior Run과 lifecycle state
- Responsibility Envelope
- concrete target와 arguments
- approvals / credential / data policy
- Change, Validation, Rollback Plan

## 검사

```text
IG-01 Tool이 계획에 포함되는가
IG-02 required Capability를 실제 제공하는가
IG-03 Tool status가 enabled/restricted 조건을 만족하는가
IG-04 현재 lifecycle role에서 허용되는가
IG-05 effect class가 behavior와 일치하는가
IG-06 target이 allowed scope 안에 있는가
IG-07 responsibility mode가 effect를 허용하는가
IG-08 forbidden target을 건드리지 않는가
IG-09 필요한 승인·credential·precondition이 있는가
IG-10 민감 데이터 전송 정책을 지키는가
IG-11 mutate/control이면 validation과 rollback이 있는가
IG-12 context snapshot이 stale하지 않은가
```

## 출력

```yaml
invocation_decision:
  invocation_id: INV-001
  status: ALLOW | BLOCK | REQUIRE_APPROVAL | REPLAN
  tool_id: tool.patch-applier
  capability_id: capability.apply-patch
  allowed_target: packages/resource-identity/**
  violations: []
  required_actions: []
```

## 실행 후 기록

허용된 호출은 다음을 감사 로그에 남긴다.

- 정확한 Tool/version
- 입력 digest와 target
- 시작·종료 시각
- effect와 변경된 자원
- raw output ref
- normalized evidence ref
- failure/rollback state

## 금지 규칙

- read 권한을 write 권한으로 승격하지 않는다.
- dry-run 결과를 실제 적용 승인으로 재사용하지 않는다.
- wildcard target을 구체 검증 없이 허용하지 않는다.
- stale context에서 govern/mutate를 실행하지 않는다.
- 긴급 상황을 이유로 owner와 rollback을 모두 생략하지 않는다.

## 완료 게이트

- 모든 호출에 명시적 decision이 있음
- 변경 호출은 책임·target·rollback·validation을 통과함
- 차단 이유가 actionable함
- 감사 로그가 재현 가능함
