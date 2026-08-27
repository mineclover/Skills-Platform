---
name: baseline-context-version-controller
description: Publish immutable context snapshots, review context patch proposals, manage supersession and adoption, and prevent behavior runs from mutating prior context in place. Use when exploration or resolution discovers new facts, conventions, goals, ownership, or acceptance rules.
---

# Context Version Controller

## 역할

Context의 생성·검증·발행·대체·보관 수명주기를 관리한다.

```text
DRAFT
→ VALIDATED
→ PUBLISHED
→ IN_USE
→ SUPERSEDED
→ ARCHIVED
```

## 불변 규칙

- 행동은 `PUBLISHED` snapshot만 사용한다.
- 실행 시작 후 snapshot 내용은 불변이다.
- 행동은 Context Patch Proposal만 제출한다.
- 새 버전은 based_on_version과 변경 이유를 기록한다.
- 동일 run이 새 버전을 자동 채택하지 않는다.

## Patch Proposal 처리

```yaml
proposal_id: CPP-001
target_context_id: VC-resource-mapping
based_on_version: 4
proposed_changes: []
evidence_refs: []
submitted_by_run_id: VRUN-018
status: proposed
```

검토 절차:

1. 기준 버전이 현재 유효한지 확인한다.
2. 변경이 사실, 컨벤션, 목표, 책임, acceptance 중 무엇인지 분류한다.
3. evidence와 authority를 검사한다.
4. 다른 Context와 충돌·영향 범위를 계산한다.
5. accept/reject/supersede를 결정한다.
6. accepted면 새 immutable version과 hash를 발행한다.
7. 영향을 받는 paused/resumable run에 adoption 필요를 알린다.

## 금지 규칙

- 실행 결과 파일을 context 파일 위에 덮어쓰지 않는다.
- rejected proposal을 삭제해 감사 이력을 잃지 않는다.
- 컨텍스트 버전 변경 없이 의미를 바꾸지 않는다.
- 동등 권위 충돌을 임의 병합하지 않는다.

## 완료 게이트

- 모든 published context에 hash와 version이 있음
- patch proposal 이력이 추적됨
- supersession 관계가 있음
- 행동 run과 사용 snapshot이 재현 가능함
