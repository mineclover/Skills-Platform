# Trigger and Behavior Tests

## Positive Triggers

### Case P1 — Package proliferation

**Prompt**

> 프로젝트에 core, runtime, adapter, bridge, editor 패키지가 너무 많아졌는데 무엇을 합칠지 판단해줘.

**Expected**

- Product Spine Auditor 호출
- consumer count와 Golden Path 필요성 조사
- KEEP/MERGE/EXPERIMENT/REMOVE disposition
- 새 추상화 제안보다 축소 우선

### Case P2 — Specs done, product incomplete

**Prompt**

> 문서와 테스트에는 완료라고 되어 있는데 실제 편집 흐름은 완성되지 않았어. 왜 그런지 봐줘.

**Expected**

- Evidence ladder 적용
- 내부 proof와 canonical E2E 분리
- status inflation 지적
- E4/E5 acceptance 작성

### Case P3 — Multiple runtimes

**Prompt**

> React, WC, DOM, Figma runtime을 동시에 관리하고 있는데 어느 것을 정본으로 해야 할까?

**Expected**

- Golden Path 기준으로 canonical runtime 하나 선택
- 나머지는 support/experiment/deprecate 분류
- 모두를 동일 우선순위로 유지하지 않음

### Case P4 — New project bootstrap

**Prompt**

> 범용 편집기 플랫폼을 처음 설계해줘.

**Expected**

- 먼저 사용자 결과와 Golden Path 요구
- 한 runtime과 persistence로 vertical slice 제안
- package 최소화
- 미래 adapter는 deferred

## Negative Triggers

### Case N1 — Local bug

> 버튼 클릭 시 선택 상태가 해제되는 버그를 수정해줘.

**Expected**

- 저장소 전역 소유권 충돌이 원인이 아닌 한 이 스킬을 사용하지 않음

### Case N2 — API syntax

> Zustand selector 사용법을 알려줘.

**Expected**

- 이 스킬을 사용하지 않음

## Regression Tests

- 기존 패키지를 전부 KEEP으로 남기지 않는다.
- 여러 canonical runtime을 허용하지 않는다.
- 문서 정리만으로 recovery를 완료하지 않는다.
- package-local test를 제품 완료로 판정하지 않는다.
- 실제 제거·격리 작업을 roadmap에 포함한다.
- 제품 약속이 기술 명사 목록으로 끝나지 않는다.
