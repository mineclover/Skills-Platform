---
name: product-spine-convergence
version: 0.1.0
description: >-
  Diagnose and recover software projects through Product Spine Alignment (스파인 정렬 / 제품 스파인 정합 / Spine Convergence).
  Use when user requests "스파인 정렬", "제품 스파인 수렴", "Golden Path 정합성 점검", or when specs, packages, contracts,
  and runtimes have expanded faster than one complete user workflow. Establishes a canonical product spine,
  golden path, SSOT boundaries, asset disposition matrix, and evidence-based completion gates.
invocation_mode: hybrid
---

# Product Spine Convergence (스파인 정렬)

## 1. 목적

이 스킬은 **'스파인 정렬(Product Spine Alignment)'**을 통해 다음과 같은 프로젝트를 **제품 중심으로 다시 수렴**시킨다.

- 스펙과 문서는 많지만 무엇이 현재 정본인지 불명확하다.
- 패키지와 계약이 계속 늘어나며 통합 비용이 기능 개발 비용보다 커졌다.
- 여러 런타임·호스트·어댑터·실험 구현이 동시에 유지된다.
- 각 모듈은 테스트되지만 사용자의 핵심 작업은 끝까지 동작하지 않는다.
- `done`, `implemented`, `proof`, `supported`가 같은 의미로 사용된다.
- 에이전트가 지역적으로는 맞는 코드를 만들지만 저장소 전체는 계속 확산된다.

이 스킬은 새 아키텍처를 발명하기 전에 **제품 스파인, Golden Path, 정본, 금지 규칙, 완료 증거**를 고정한다.

## 2. Invocation Gate

### 반드시 사용 (Triggers)

다음 중 하나라도 해당하면 사용한다:

- **사용자가 "스파인 정렬", "스파인 정합", "제품 스파인 수렴", "골든패스 정렬"을 요청할 때**
- 사용자가 프로젝트의 스펙 관리 또는 구현 관리 실패 원인을 묻는다.
- 저장소가 과도하게 모듈화·패키지화되었는지 진단해 달라고 한다.
- 여러 runtime, adapter, editor, host, proof 구현 중 무엇을 남길지 정해야 한다.
- 프로젝트를 MVP 또는 하나의 제품 경험으로 축소하려 한다.
- 문서와 실제 구현 상태가 어긋나거나 source of truth가 여러 개다.
- 아키텍처는 풍부하지만 실제 사용자 workflow 완성도가 낮다.
- 새 기능을 추가하기 전에 제품 구조를 수렴시키려 한다.

### 사용하지 않음

- 범위가 명확한 단일 버그 수정
- 이미 승인된 구조 안에서의 국소 기능 구현
- 일반적인 코드 스타일 리뷰
- 단순 API 사용법 설명
- 제품 경계와 무관한 성능 튜닝

단, 국소 요청처럼 보여도 저장소 전역의 정본·소유권·완료 기준 충돌이 원인이라면 사용한다.

## 3. 운영 모드

| Mode | 사용 조건 | 실행 범위 |
|---|---|---|
| `diagnose` | 실패 원인과 구조적 차이 분석 | Product Spine Auditor |
| `recover` | 기존 프로젝트를 축소·통합 | 전체 워크플로 |
| `govern` | 새 패키지·계약·런타임 추가 판단 | Architecture Governor |
| `accept` | 기능 완료 여부 판정 | Delivery Evidence Auditor |
| `bootstrap` | 새 프로젝트의 초기 구조 수립 | Golden Path + 최소 정본 문서 |

사용자가 모드를 지정하지 않으면 요청 목적에 따라 선택한다. 구조 확산이 이미 발생했다면 기본값은 `recover`다.

## 4. 라우팅

### 4.1 구조와 실패 원인을 분석

읽기:

- `skills/product-spine-auditor/SKILL.md`
- `references/principles.md`

산출:

- Product Spine 진단
- 구조 확산 증상과 원인
- 정본 충돌 목록
- 제품 완료를 방해하는 핵심 병목

### 4.2 회복 계획을 작성

읽기:

- `skills/convergence-planner/SKILL.md`
- `workflows/recovery-workflow.md`
- `templates/convergence-report.md`

산출:

- Golden Path
- Canonical Stack
- 자산 disposition matrix
- 수직 slice 기반 구현 순서
- 삭제·격리·병합 순서

### 4.3 변경을 통제

읽기:

- `skills/architecture-governor/SKILL.md`
- `templates/INVARIANTS.md`

산출:

- 패키지 승격 판정
- 의존 방향과 금지 규칙
- 전역 에이전트 지침
- PR blocker 기준

### 4.4 완료를 판정

읽기:

- `skills/delivery-evidence-auditor/SKILL.md`

산출:

- 사용자 완료 시나리오
- 증거 계층 분류
- E2E acceptance result
- `accepted`, `partial`, `blocked`, `rejected` 판정

## 5. 공통 절차

### Step 1. 현재 요청을 사용자 결과로 번역

기술 명사로 시작하지 않는다. 다음 문장을 먼저 완성한다.

```text
[사용자]가 [입력/자산]을 사용해 [핵심 조작]을 수행하고,
[저장·재실행·내보내기 결과]에서도 동일한 결과를 얻는다.
```

이 문장을 완성할 수 없다면 구현 범위가 아니라 제품 약속부터 불명확한 상태다.

### Step 2. 제품 스파인을 식별

다음 흐름을 하나로 연결한다.

```text
User Action
→ Authoritative Command
→ Canonical Model Mutation
→ Runtime Projection
→ Visible Result
→ Persistence
→ Reload / Export
```

각 단계마다 정확히 하나의 기본 소유자를 지정한다. 여러 소유자가 있으면 충돌로 기록한다.

### Step 3. 정본을 고정

최소한 다음을 각각 하나로 선택한다.

- Canonical project model
- Canonical editor host
- Canonical runtime
- Canonical persistence format
- Canonical verification surface

대안 구현은 `support`, `experiment`, `deprecated`, `remove` 중 하나로 분류한다. 여러 후보를 동시에 canonical로 두지 않는다.

### Step 4. 자산을 판정

모든 주요 package, contract, runtime, adapter, editor, document, demo를 다음 중 하나로 분류한다.

| 판정 | 의미 |
|---|---|
| `KEEP` | Golden Path에 직접 필요하며 정본 경로에 남김 |
| `MERGE` | 독립 생명주기가 불필요하므로 정본 모듈로 병합 |
| `SUPPORT` | 제품 경로를 보조하지만 정본 상태를 소유하지 않음 |
| `EXPERIMENT` | 검증 목적이며 제품 build·roadmap·완료 판정에서 제외 |
| `DEPRECATE` | 소비자가 있어 단계적으로 제거 |
| `REMOVE` | 현재 제품 약속에 필요 없고 소비자도 없음 |
| `DEFER` | 미래 가능성만 있으며 현재 구현하지 않음 |

`KEEP`의 수가 많아지면 분류가 아니라 기존 구조의 재서술인지 다시 검토한다.

### Step 5. 수직 slice를 정의

패키지별 작업 목록을 먼저 만들지 않는다. 다음처럼 사용자의 한 작업을 끝까지 관통하는 slice를 만든다.

```text
자산 등록
→ 캔버스 배치
→ 파라미터 수정
→ 시간축 기록
→ 재생
→ 저장
→ 재로드
→ 내보내기
```

각 slice는 UI, 모델, 런타임, 저장, 검증을 함께 포함한다.

### Step 6. 규칙을 실행 가능하게 변환

중요한 아키텍처 규칙은 최소 하나의 기계적 gate로 보호한다.

- import boundary check
- schema validation
- dependency cycle check
- forbidden package check
- canonical runtime uniqueness check
- docs freshness / SSOT link check
- browser E2E

문서만 있고 gate가 없으면 `advisory`로 표시한다. 제품을 깨뜨릴 수 있는 규칙은 `blocking`이어야 한다.

### Step 7. 사용자 완료로 판정

다음은 완료 증거가 아니라 중간 증거다.

- 타입 또는 schema 존재
- adapter 존재
- debug panel 노출
- package-local test 통과
- demo route 동작
- fixture 생성
- 문서상 `done`

완료는 Golden Path가 실제 정본 모델과 정본 런타임을 통해 끝까지 수행되고, 저장·재로드 또는 내보내기 후에도 의미가 보존될 때만 인정한다.

## 6. 권한과 책임 경계

이 스킬은 다음을 할 수 있다.

- 기존 패키지와 문서의 폐기·병합·격리를 권고한다.
- 사용자가 요구하지 않은 미래 호환성 레이어를 거절한다.
- 여러 runtime 중 하나를 canonical로 선택한다.
- 내부 구현 완료 상태를 사용자 완료 상태로 강등한다.
- 오래된 roadmap·handoff·status 문서를 archive 대상으로 분류한다.

다음을 임의로 하지 않는다.

- 제품 약속 없이 보편적 플랫폼을 설계하지 않는다.
- 실제 consumer가 없는 public API를 추가하지 않는다.
- 단순히 책임이 다르다는 이유로 패키지를 추가하지 않는다.
- 모든 실험을 제품 정본에 연결하지 않는다.
- 사용자가 보존을 요구하지 않은 legacy를 자동 보존하지 않는다.

## 7. 필수 산출물

전면 회복 시 다음을 생성한다.

1. **Diagnosis** — 확산 원인, 정본 충돌, 제품 병목
2. **PRODUCT.md** — 제품 약속, Golden Path, MVP 범위
3. **MODEL.md** — 정본 모델과 상태 소유권
4. **INVARIANTS.md** — 의존 방향, 금지 규칙, PR blockers
5. **ROADMAP.md** — 수직 slice와 acceptance 중심 실행 순서
6. **Disposition Matrix** — 각 자산의 KEEP/MERGE/... 판정
7. **Evidence Matrix** — 내부 증거와 사용자 완료 증거 분리

국소 요청에서는 필요한 산출물만 만든다.

## 8. 완료 기준

다음을 모두 만족해야 스킬 작업을 완료 처리한다.

- 제품 약속이 한 문장으로 표현된다.
- Golden Path가 시작부터 저장·재실행 또는 내보내기까지 연결된다.
- 각 주요 상태에는 기본 소유자가 하나뿐이다.
- canonical model, runtime, persistence, verification surface가 각각 하나다.
- 모든 주요 패키지와 문서는 disposition을 갖는다.
- 다음 milestone은 패키지별 작업이 아니라 수직 사용자 slice다.
- `done`은 사용자 observable behavior와 E2E 증거로 정의된다.
- 제거·격리 대상이 실제 작업 순서에 포함된다.
- 전역 규칙이 루트 에이전트 지침 또는 CI gate로 연결된다.

## 9. 실패 패턴

다음 응답은 이 스킬의 실패다.

- 새로운 추상 계층을 추가하는 것으로 결론냄
- 모든 기존 패키지를 유지한 채 문서만 재정리함
- canonical 후보를 복수로 남김
- “추후 확장 가능성”을 이유로 현재 복잡성을 유지함
- 테스트 개수와 문서량을 완성도의 근거로 사용함
- 기술 축별 roadmap만 만들고 사용자 흐름을 만들지 않음
- 삭제나 격리 판단 없이 “점진적 개선”만 제안함
