---
name: baseline-convention-registry
description: Register and compose global, domain, product, element, and topic conventions for vertical contexts without copying rules into behavior instructions. Use when problem-solving must follow architecture, identity, coding, testing, data, compatibility, or operational conventions with explicit precedence and exceptions.
---

# Convention Registry

## 역할

수직 컨텍스트에 주입할 규칙을 안정적인 ID와 적용 범위로 관리한다. 행동 스킬에 프로젝트별 컨벤션을 하드코딩하지 않는다.

## 레코드

```yaml
convention_id: CONV-resource-id-001
scope_level: domain
scope_refs: [browser-editing]
category: identity
statement: URL 문자열을 영구 리소스 식별자로 사용하지 않는다.
modality: MUST
status: active
precedence: 300
owner_ref: architecture-board
exceptions: []
source_refs: []
```

## 계층

```text
global
→ domain
→ product / element
→ topic
```

하위 규칙이 상위 규칙을 임의로 덮어쓰지 않는다. override는 다음을 요구한다.

- 명시적 `overrides` 관계
- 승인 owner
- 적용 범위
- 만료 또는 재검토 조건
- 호환성 영향

## 컴파일

Vertical Context Builder는 다음 순서로 컨벤션을 조립한다.

1. 전역 필수 규칙
2. 활성 도메인 규칙
3. subject element 규칙
4. topic-specific 규칙
5. 승인된 예외
6. 충돌 검사

동일 의미는 하나의 canonical rule로 병합하고 출처를 합친다.

## 카테고리

- architecture
- identity
- data-state
- interface
- runtime
- implementation
- testing
- security
- operations
- release
- documentation

## 금지 규칙

- 실행 절차를 convention으로 등록하지 않는다.
- 단기 해결 계획을 영구 규칙으로 승격하지 않는다.
- status가 draft인 규칙을 published context에 필수로 주입하지 않는다.
- 동일 우선순위 충돌을 자동 해결하지 않는다.
- 행동 결과가 registry를 직접 갱신하게 하지 않는다.

## 완료 게이트

- 모든 적용 규칙에 ID, owner, status, scope가 있음
- precedence와 override 관계가 검증됨
- Vertical Context가 규칙을 복사하지 않고 ref와 필요한 compact projection을 가짐
- unresolved conflict가 명시됨
