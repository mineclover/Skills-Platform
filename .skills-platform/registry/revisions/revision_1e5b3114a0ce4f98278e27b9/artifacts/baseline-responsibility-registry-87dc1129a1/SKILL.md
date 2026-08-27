---
name: baseline-responsibility-registry
description: Register ownership and maintenance responsibility for elements, relationships, and contracts independently from access or context inclusion. Use when a task must distinguish managed, delegated, boundary-managed, consumed, observed, external, and excluded scope.
---

# Responsibility Registry

## 역할

누가 무엇의 정확성·변경·호환성·장애 대응·수명주기를 관리하는지 정본으로 기록한다.

```text
Ownership ≠ Access
Ownership ≠ Context Inclusion
Ownership ≠ Source Availability
```

## 책임 대상

세 종류를 독립적으로 등록한다.

```text
Element Ownership
Relationship Ownership
Contract Ownership
```

예를 들어 integration team은 A–B 관계와 어댑터를 소유할 수 있지만 A와 B 내부를 모두 소유하지 않는다.

## 레코드

```yaml
responsibility_id: RESP-extension-local-sync
subject_type: relationship
subject_ref: extension-to-local-sync
owner_ref: team.integration
mode: boundary-managed
scope:
  includes:
    - adapter
    - validation
    - retry
    - compatibility-tests
  excludes:
    - extension-internals
    - local-host-internals
mutation_authority:
  allowed_patterns: []
  forbidden_patterns: []
escalation_target: architecture-board
status: active
```

## 책임 모드

- `managed`
- `delegated-managed`
- `boundary-managed`
- `consumed`
- `observed`
- `external`
- `excluded`

## 등록 절차

1. Element/relationship/contract ID를 확인한다.
2. owner source와 authority를 기록한다.
3. mode와 포함·제외 범위를 분리한다.
4. 변경 권한과 승인 조건을 기록한다.
5. 장애·보안·호환성 escalation target을 지정한다.
6. 임시 위임에는 만료 조건을 둔다.
7. 동등 권위 충돌은 unresolved로 유지한다.

## 금지 규칙

- CODEOWNERS 한 자료만으로 모든 설계 책임을 확정하지 않는다.
- 호출자가 provider 내부 유지 책임을 가진다고 가정하지 않는다.
- 관리자가 없다는 이유로 현재 태스크가 자동 소유권을 취득하지 않는다.
- shared ownership을 구체적 역할 없이 사용하지 않는다.
- 외부 오픈소스 포크 가능성을 현재 관리 권한으로 해석하지 않는다.

## 출력

- `RESPONSIBILITY_REGISTRY.yaml|jsonl`
- responsibility projection
- ownership conflict list
- orphaned responsibility list
- delegation expiry report

## 완료 게이트

- 중요 요소·관계·계약의 owner 또는 unresolved 상태가 있음
- mode, mutation authority, escalation이 구분됨
- 수직 컨텍스트가 envelope를 만들 수 있음
- context inclusion만으로 권한이 발생하지 않음
