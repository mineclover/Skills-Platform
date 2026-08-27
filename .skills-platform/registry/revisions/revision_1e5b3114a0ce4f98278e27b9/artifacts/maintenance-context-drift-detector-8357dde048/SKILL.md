---
name: maintenance-context-drift-detector
description: Detect divergence among published baselines, context snapshots, conventions, responsibility records, source code, configuration, contracts, tests, and runtime behavior. Use periodically or after major changes to generate signals and patch proposals without silently rewriting authority.
---

# Context Drift Detector

## 역할

정본으로 선언된 내용과 실제 구현·운영·책임 정보 사이의 드리프트를 탐지한다.

## 비교 축

- MASTER_BASELINE ↔ source code / config
- Convention Registry ↔ implementation patterns
- Interface contracts ↔ provider/consumer behavior
- Responsibility Registry ↔ actual ownership and CODEOWNERS
- Acceptance criteria ↔ active tests
- Tool Registry ↔ available tool versions
- Published Context ↔ newer verified evidence
- Element/Topic status ↔ actual lifecycle

## 드리프트 유형

```text
missing-implementation
undocumented-implementation
contract-drift
state-drift
ownership-drift
convention-drift
test-drift
tool-availability-drift
stale-context
```

## 출력

```yaml
drift_record:
  drift_id: DRIFT-001
  type: contract-drift
  authoritative_ref: CONTRACT-save-v2
  observed_ref: runtime-trace-004
  severity: high
  confidence: runtime
  suggested_route: horizontal-exploration
  direct_mutation_allowed: false
```

## 절차

1. 비교 대상의 authority와 snapshot version을 고정한다.
2. 선언과 관찰을 정규화한다.
3. 의미 차이와 단순 표현 차이를 구분한다.
4. 영향 범위와 책임 주체를 추정한다.
5. confirmed drift는 Signal을 생성한다.
6. authority 변경이 필요하면 Context/Baseline Patch Proposal을 만든다.

## 금지 규칙

- 실제 코드가 다르다는 이유만으로 target baseline을 자동 덮어쓰지 않는다.
- 문서가 최신이라는 이유만으로 runtime evidence를 무시하지 않는다.
- as-is와 target-state를 혼합하지 않는다.
- 드리프트 감지기가 직접 코드를 수정하지 않는다.

## 완료 게이트

- authority, observed state, delta가 분리됨
- severity와 evidence confidence가 있음
- 탐색·해결·patch route가 결정됨
- 자동 정본 변경이 발생하지 않음
