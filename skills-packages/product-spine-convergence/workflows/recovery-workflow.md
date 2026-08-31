# Product Spine Recovery Workflow

## Phase 0. Expansion Freeze

새 package, runtime, adapter, schema axis 추가를 일시 중단한다. 버그와 Golden Path 복구만 허용한다.

산출:

- freeze 범위
- 예외 승인자 또는 승인 조건
- 현재 작업 중단·완료·폐기 목록

## Phase 1. Repository Evidence Inventory

다음을 수집한다.

- apps/packages 목록
- 각 패키지의 실제 consumer
- authoritative stores/models
- runtime 및 persistence 경로
- demo/debug/harness 목록
- roadmap/status/handoff 문서
- CI와 E2E

문서에 적힌 역할과 코드에서 관찰되는 역할을 분리한다.

## Phase 2. Product Promise and Golden Path

사용자 결과 한 문장을 확정하고 5~9단계 Golden Path를 작성한다.

이 단계에서 합의되지 않은 미래 기능은 `DEFER`한다.

## Phase 3. Canonical Stack Selection

model, command, editor host, runtime, persistence, verification surface를 하나씩 선택한다.

선택 기준 우선순위:

1. Golden Path 완성 가능성
2. 현재 실제 동작 증거
3. 상태와 lifecycle 명확성
4. consumer 존재
5. migration 비용
6. 미래 범용성

미래 범용성은 마지막 기준이다.

## Phase 4. Disposition

모든 주요 자산에 KEEP/MERGE/SUPPORT/EXPERIMENT/DEPRECATE/REMOVE/DEFER를 부여한다.

`UNKNOWN`을 장기간 유지하지 않는다. 조사 작업과 결정 기한을 부여한다.

## Phase 5. SSOT Collapse

- 중복 roadmap/status/handoff를 archive
- 제품 정의를 `PRODUCT.md`로 수렴
- 상태 소유권을 `MODEL.md`로 수렴
- 금지 규칙을 `INVARIANTS.md`로 수렴
- 현재 실행 순서를 `ROADMAP.md`로 수렴

## Phase 6. Product Path Isolation

- experiment를 별도 디렉터리 또는 workspace filter로 격리
- product build가 experiment에 의존하지 않게 함
- deprecated path의 writer를 차단
- adapter가 authoritative state를 소유하지 않게 함

## Phase 7. First Vertical Slice

가장 작은 Golden Path를 E5까지 완성한다.

```text
create/import
→ edit
→ preview
→ save
→ reload
```

export 제품이면 export/replay까지 포함한다.

## Phase 8. Governance Automation

- dependency guard
- forbidden imports
- schema migration check
- product E2E
- round-trip test
- experiment isolation check

## Phase 9. Controlled Extraction

수직 slice가 두 번 이상 반복된 뒤 중복 경계를 추출한다. 추출 전에는 모듈, 추출 후에만 package/public contract가 된다.

## Phase 10. Expansion Reopen

다음을 만족하면 freeze를 해제한다.

- Golden Path E5 통과
- canonical stack 명확
- 중복 writer 없음
- experiment 격리
- current-state SSOT 하나
- package/contract/runtime gate 적용
