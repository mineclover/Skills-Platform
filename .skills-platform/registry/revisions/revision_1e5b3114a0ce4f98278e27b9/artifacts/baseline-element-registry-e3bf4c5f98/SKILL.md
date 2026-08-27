---
name: baseline-element-registry
description: Register system elements as independent, stable objects with identity, purpose, lifecycle, ownership, public surface, and typed relations. Use when horizontal or vertical contexts must refer to products, services, modules, contracts, adapters, data objects, or external systems without making the context their source of identity.
---

# Element Registry

## 역할

`Element`를 컨텍스트와 독립적으로 등록한다. 수평·수직 컨텍스트는 Element를 생성하거나 소유하지 않고 선택·투영한다.

```text
Element ≠ Context
Element ≠ Topic
```

Element는 제품, 서비스, 모듈, 패키지, 기능, 데이터 모델, 계약, 어댑터, 외부 시스템 등 지속적으로 식별할 가치가 있는 대상을 나타낸다.

## 필수 레코드

```yaml
element_id: browser-editing.local-sync-host
element_kind: product
purpose:
  summary: 브라우저 편집 변경을 로컬 파일에 반영한다.
owner_ref: team.local-sync
lifecycle:
  independently_versioned: true
  independently_released: true
public_surface:
  - persist-change
  - resolve-resource
relations:
  - type: consumes
    target: browser-extension.change-event
```

## 정체성 규칙

- 이름이 바뀌어도 동일한 책임과 수명주기면 `element_id`를 유지한다.
- 책임·수명주기가 분리되면 새 ID를 발행하고 supersession/split 관계를 기록한다.
- 외부 공급자 요소도 로컬 registry ID를 가질 수 있으나 `owner_ref`와 authority를 외부로 표시한다.
- URL, 경로, 표시명만을 영구 ID로 사용하지 않는다.
- 동일 요소가 여러 컨텍스트에 등장해도 복제 레코드를 만들지 않는다.

## 관계 타입

최소 다음 관계를 지원한다.

```text
contains
contained_by
depends_on
provides
consumes
implements
governs
observes
adapts
projects_to
supersedes
```

관계 자체가 별도 관리 대상이면 relationship ID와 owner를 부여한다.

## 출력

- `ELEMENT_REGISTRY.jsonl`
- 요소별 Public Projection
- alias/supersession map
- 소유권 불명확 목록

## 절차

1. 출처에서 설명 대상을 추출한다.
2. 기존 registry에서 동일 정체성을 검색한다.
3. 목적·책임·수명주기 기준으로 병합 또는 신규 발행을 판정한다.
4. owner와 public surface를 기록한다.
5. 관계를 타입화한다.
6. 컨텍스트에 필요한 Projection 깊이를 계산한다.

## 금지 규칙

- 폴더 구조만 보고 element hierarchy를 확정하지 않는다.
- 컨텍스트에 포함되었다는 이유로 owner를 현재 작업자로 지정하지 않는다.
- 단순 라이브러리 사용을 내부 관리 책임으로 승격하지 않는다.
- 한 요소의 내부 상세를 여러 컨텍스트에 복사해 이중 정본을 만들지 않는다.

## 완료 게이트

- 모든 중요 대상에 안정적인 ID가 있음
- 목적·owner·lifecycle·public surface가 구분됨
- 관계가 자유 텍스트가 아니라 타입으로 표현됨
- 수평·수직 컨텍스트가 ID로 참조 가능함
