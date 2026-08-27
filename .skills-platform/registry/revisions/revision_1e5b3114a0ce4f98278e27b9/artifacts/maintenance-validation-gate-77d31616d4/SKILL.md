---
name: maintenance-validation-gate
description: Validate vertical resolution results against explicit acceptance criteria, regression obligations, contract compatibility, safety, security, and evidence requirements before release. Use after a proposed change or mitigation and before deployment or closure.
---

# Maintenance Validation Gate

## 역할

수직 행동의 결과가 목표와 컨벤션을 충족하는지 증거 기반으로 판정한다.

## 입력

- Vertical Context acceptance criteria
- diagnosis와 Change Set
- test/measurement evidence
- relevant contracts and invariants
- regression scope
- unresolved external issues
- rollback plan

## 검증 층

1. **Problem validation** — 원인과 해결 위치가 증거에 부합하는가
2. **Change validation** — 변경이 허용 범위와 컨벤션을 지키는가
3. **Behavior validation** — 수용 기준을 충족하는가
4. **Regression validation** — 인접 기능과 계약을 깨지 않는가
5. **Operational validation** — 배포·관찰·롤백이 가능한가
6. **Responsibility validation** — 비관리 요소를 몰래 수정하지 않았는가

## 출력

```yaml
validation_gate:
  status: PASS | FAIL | CONDITIONAL
  acceptance_results: []
  evidence_refs: []
  regressions: []
  unresolved_risks: []
  release_conditions: []
  required_rework: []
```

## 증거 등급

```text
reference < declared < implementation < runtime < validated < production
```

각 수용 기준은 요구되는 최소 증거 등급을 선언한다.

## 실패 처리

- 구현 문제면 동일 Vertical Behavior로 반환한다.
- 원인 가설이 무너지면 child Horizontal Exploration을 연다.
- shared contract 문제가 발견되면 수평 변경 Topic으로 라우팅한다.
- 외부 제한이면 Boundary Problem Router로 보낸다.

## 금지 규칙

- 테스트 개수만으로 품질을 판정하지 않는다.
- flaky test를 무시하고 PASS 처리하지 않는다.
- acceptance를 결과에 맞춰 사후 완화하지 않는다.
- 운영 안정성 검증을 단위 테스트로 대체하지 않는다.

## 완료 게이트

- 모든 필수 acceptance가 evidence와 연결됨
- regression, security, compatibility가 검토됨
- release 조건과 rollback이 있음
- PASS/FAIL 근거가 재현 가능함
