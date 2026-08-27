---
name: maintenance-tool-effectiveness-reviewer
description: Evaluate maintenance methods and tools using execution history, success rate, evidence quality, false positives or misses, cost, latency, intrusiveness, failure recovery, security, and operator burden; propose lifecycle or registry changes without editing tool definitions directly. Use periodically and after significant failures.
---

# Maintenance Tool Effectiveness Reviewer

## 역할

Method와 Tool이 실제 유지보수 품질에 기여하는지 운영 이력으로 평가한다.

## 평가 단위

- Method version
- Capability definition
- Tool Binding/version
- Toolchain pattern
- lifecycle stage / environment / domain

## 지표

```text
capability coverage
successful completion rate
evidence usefulness
false-positive / false-negative rate
reproducibility
latency and cost
runtime overhead
mutation rollback success
security / privacy incidents
manual intervention burden
fallback success
```

## 출력

```yaml
effectiveness_review:
  review_id: TOOLREV-001
  subject_ref: tool.chrome-cdp-trace-capture@1.4.0
  sample_window: 90d
  findings: []
  metrics: {}
  recommendation:
    action: restrict
    conditions:
      - high-overhead-on-production
  patch_proposals: []
```

## 권장 조치

- keep enabled
- restrict by environment or scope
- require additional guard
- replace binding
- revise Method suitability rule
- split or merge Capability
- deprecate
- retire
- add fallback

## 평가 규칙

- tool failure와 method misuse를 구분한다.
- 선택 편향과 작은 sample을 명시한다.
- 성공률이 높아도 evidence 품질이 낮으면 별도 위험으로 본다.
- mutate Tool은 rollback·incident 이력을 중점 평가한다.
- 외부 서비스의 가격·정책·버전 변화는 Tool Registry drift로 라우팅한다.

## 금지 규칙

- 단일 실패로 즉시 retire하지 않는다.
- 비용만으로 증거 품질을 희생하지 않는다.
- 리뷰가 Tool Registry를 직접 수정하지 않는다.
- 공급자 마케팅 수치를 내부 효과성 증거로 사용하지 않는다.

## 완료 게이트

- 평가 기간·sample·환경이 있음
- method/tool/capability 원인을 구분함
- lifecycle 변경 제안과 근거가 있음
- Context/Registry Patch Proposal로 전달됨
