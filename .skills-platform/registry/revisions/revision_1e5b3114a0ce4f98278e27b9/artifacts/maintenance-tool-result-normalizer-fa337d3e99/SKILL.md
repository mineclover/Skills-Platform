---
name: maintenance-tool-result-normalizer
description: Normalize heterogeneous outputs from search, runtime, analysis, mutation, test, deployment, and governance tools into typed evidence, observations, change records, and failure records with provenance and confidence. Use after tool execution so behaviors and lifecycle gates do not depend on vendor-specific output shapes.
---

# Maintenance Tool Result Normalizer

## 역할

Tool별 출력 형식을 공통 데이터 객체로 변환한다.

```text
Raw Tool Output
→ Observation | Evidence | Change Evidence | Failure Record
```

Behavior와 Gate는 가능한 한 raw vendor output 대신 normalized record를 사용한다.

## 공통 Evidence

```yaml
evidence_id: EVIDENCE-test-991
evidence_kind: validated
produced_by:
  tool_id: tool.browser-integration-test
  tool_version: 2.1.0
  invocation_id: INV-104
context_ref: {}
subject_refs: []
supports: [AC-save-flush-001]
result: pass
confidence: high
reproducibility: deterministic
raw_output_ref: artifact://...
redactions: []
```

## 정규화 유형

- source/reference evidence
- implementation evidence
- runtime observation
- test result
- performance measurement
- security finding
- change evidence
- release evidence
- rollback evidence
- tool failure

## 정규화 규칙

- 원본 Tool/version/invocation provenance를 유지한다.
- 관찰 사실과 도구의 해석을 분리한다.
- confidence와 reproducibility를 기록한다.
- 시간·환경·버전·샘플 조건을 포함한다.
- 민감 값은 redaction metadata와 함께 제거한다.
- partial output과 failed invocation을 pass evidence로 변환하지 않는다.
- 여러 증거를 집계할 때 개별 refs를 보존한다.

## 실패 레코드

```yaml
tool_failure:
  failure_id: TOOLFAIL-001
  invocation_id: INV-104
  category: permission-denied
  partial_output_ref: null
  retryable: false
  fallback_capability: capability.collect-console-events
```

## 금지 규칙

- 도구 exit code 0을 acceptance PASS로 자동 해석하지 않는다.
- 불완전한 로그를 complete trace로 표시하지 않는다.
- 환경 차이를 제거해 잘못된 비교를 만들지 않는다.
- raw output을 삭제해 provenance를 잃지 않는다.

## 완료 게이트

- normalized record가 스키마와 provenance를 가짐
- evidence grade·confidence·reproducibility가 있음
- raw output과 redaction이 추적됨
- Validation/Lifecycle Gate가 vendor-independent하게 소비 가능함
