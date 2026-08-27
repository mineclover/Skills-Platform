---
name: baseline-topic-registry
description: Register exploration and resolution topics as stable work objects with canonical IDs, roles, parent-child links, subject references, ownership hints, lifecycle state, and duplicate or supersession relations. Use before creating vertical contexts or tracking recursive maintenance work.
---

# Topic Registry

## 역할

`Topic`은 탐색하거나 해결할 독립 작업 초점이다. Element가 시스템 대상이라면 Topic은 해당 대상을 둘러싼 문제, 목표, 결정, 기능 또는 연구 질문이다.

```text
Element: resource-identity-core
Topic: 네트워크 리소스와 로컬 파일의 매핑 불안정 해결
```

## 필수 레코드

```yaml
topic_id: TOPIC-browser-resource-mapping
topic_kind: defect
subject_refs:
  - browser-editing.resource-identity
role:
  summary: 지속 저장과 버전 관리가 동일 원본을 추적하게 한다.
parent_topic_id: TOPIC-browser-live-editing
status: selected
owner_hint: team.browser-editing
```

## 상태

```text
discovered
candidate
selected
context-ready
resolving
resolved
deferred
escalated
superseded
rejected
reopened
```

Maintenance Case 상태와 Topic 상태를 동일시하지 않는다. 하나의 Topic은 여러 케이스에서 재사용될 수 있다.

## 등록 절차

1. 수평 행동의 후보를 기존 토픽과 비교한다.
2. statement, subject_refs, role, acceptance intent를 기준으로 중복을 판정한다.
3. 동일 문제면 기존 ID에 증거와 case reference를 추가한다.
4. 별도 해결 폐쇄가 필요하면 새 ID를 발행한다.
5. 부모·자식·depends_on·blocks·supersedes 관계를 기록한다.
6. 수직 컨텍스트 생성 가능 여부를 표시한다.

## 토픽 분할 기준

다음이 다르면 별도 토픽을 고려한다.

- 관리 책임자
- 완료 조건
- 변경 가능한 위치
- 독립 배포·검증 필요성
- 위험 수용 결정
- 수평 탐색과 수직 해결의 실행 단계

## 금지 규칙

- Context ID를 Topic ID로 재사용하지 않는다.
- 실행마다 새 Topic을 만들어 동일 문제 이력을 분절하지 않는다.
- 외부 요소의 내부 결함을 로컬 owned topic으로 위장하지 않는다.
- 모호한 제목만으로 중복을 병합하지 않는다.

## 완료 게이트

- 선택된 모든 수직 작업에 canonical topic ID가 있음
- role과 subject_refs가 있음
- 부모·의존·중복 관계가 기록됨
- 책임 힌트와 현재 상태가 있음
- Topic Handoff가 registry 레코드를 참조함
