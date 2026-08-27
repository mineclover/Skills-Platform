---
name: baseline-responsibility-resolution-gate
description: Gate vertical problem solving and mutating tool use against explicit responsibility envelopes. Use before changing code, data, configuration, contracts, infrastructure, or external dependencies to ensure the selected resolution location is managed, delegated, or boundary-managed.
---

# Responsibility Resolution Gate

## 역할

문제가 발견된 위치와 현재 작업이 해결할 수 있는 위치를 분리하고, 허용되지 않은 내부 변경을 차단한다.

## 입력

- canonical Topic
- Vertical Context Snapshot
- Responsibility Envelope
- proposed Change Set
- Toolchain Plan
- 대상 Element/relationship/contract

## 라우팅 결과

```text
OWNED_RESOLUTION
DELEGATED_RESOLUTION
BOUNDARY_MITIGATION
HANDOFF_REQUIRED
OBSERVE_ONLY
OUT_OF_SCOPE
OWNERSHIP_UNRESOLVED
```

## 판정 절차

1. 증상 위치, 의심 원인, 제안 해결 위치를 별도로 기록한다.
2. 해결 위치의 responsibility mode를 조회한다.
3. proposed mutation이 allowed pattern 안에 있는지 확인한다.
4. shared contract 변경이면 contract owner와 수평 변경 절차를 확인한다.
5. 외부 요소라면 관리 경계에서 가능한 완화와 이관을 평가한다.
6. 툴 effect class와 책임 모드가 호환되는지 검사한다.
7. 허용 결과와 금지 대상을 명시한다.

## 효과별 최소 책임

| effect | 최소 조건 |
|---|---|
| observe | observed 이상 또는 합법적 공개 접근 |
| analyze | 읽기 권한과 데이터 사용 정책 |
| propose | 변경 대상 owner에게 전달 경로 |
| mutate | managed / delegated-managed / boundary-managed |
| control | 명시적 운영 권한과 롤백 |
| govern | 정책 owner 또는 위임된 승인 권한 |

## 외부 원인 처리

```text
외부 내부 수정 금지
→ 재현·증거 수집
→ 계약 위반 또는 제약 판정
→ 관리 경계 폴백/격리/기능 감지
→ 실제 owner에게 handoff
```

## 출력

```yaml
responsibility_gate:
  status: PASS | BLOCK | ROUTE
  route: BOUNDARY_MITIGATION
  allowed_targets: []
  forbidden_targets: []
  required_approvals: []
  handoff_target: null
  rationale: []
```

## 금지 규칙

- 문제 원인과 해결 권한이 같다고 가정하지 않는다.
- 테스트 목적이라는 이유로 production mutation을 허용하지 않는다.
- 외부 소스 접근 가능성을 변경 권한으로 해석하지 않는다.
- gate 실패 후 태스크 범위를 조용히 확장하지 않는다.

## 완료 게이트

- 해결 위치가 명확함
- 허용·금지 대상이 명시됨
- 필요한 승인·이관이 있음
- mutating tool 호출 전에 PASS를 받음
