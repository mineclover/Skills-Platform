# Product Spine Convergence Principles

## 1. Product Spine

제품 스파인은 사용자의 입력이 저장 가능한 결과가 될 때까지 통과하는 최소 정본 경로다.

```text
Action → Command → Model → Projection → Result → Persistence
```

모든 핵심 기능은 이 경로에 붙어야 한다. 별도의 상태와 실행 경로를 만든다면 독립 제품인지, 실험인지, 중복 구현인지 판정해야 한다.

## 2. Golden Path

Golden Path는 제품 가치를 대표하는 하나의 완료 가능한 사용자 작업이다. 메뉴 목록이나 기능 카탈로그가 아니다.

좋은 예:

```text
사용자가 웹 자산을 등록하고 캔버스에 배치한 뒤 시간축에서 이동을 기록하고,
재생·저장·재로드·내보내기에서도 동일한 결과를 얻는다.
```

나쁜 예:

```text
Asset, Timeline, Scenario, Runtime, Adapter를 지원한다.
```

## 3. Narrow Waist

여러 UI와 런타임을 연결해야 하더라도 중앙 계약은 작아야 한다.

```text
Many authoring surfaces
        ↓
Small canonical model / command boundary
        ↓
Many projections or adapters
```

중앙 계약이 모든 소비자의 세부 기능을 포함하면 narrow waist가 아니라 합성된 초대형 플랫폼이 된다.

## 4. Spec as Rejection Mechanism

스펙은 “무엇을 할 수 있는지”뿐 아니라 다음을 결정해야 한다.

- 현재 만들지 않는 것
- 정본이 아닌 구현
- 허용되지 않는 의존성
- 독립 패키지로 승격할 수 없는 개념
- 완료로 인정하지 않는 증거
- 삭제해야 할 legacy와 중복 경로

금지와 제외가 없는 스펙은 수렴 장치가 아니다.

## 5. Package Extraction After Stabilization

패키지는 개념 분류 단위가 아니라 독립 생명주기 단위다. 다음 조건을 만족할 때 추출한다.

- 실제 consumer가 두 개 이상이다.
- 동작과 데이터 모델이 먼저 안정되었다.
- 독립적으로 테스트할 수 있다.
- public API와 버전 관리가 필요하다.
- 분리로 인한 통합 비용보다 재사용 가치가 크다.

그 전에는 같은 제품 내부의 모듈로 둔다.

## 6. One Canonical Path

현재 milestone에서는 다음이 각각 하나여야 한다.

- project model
- command path
- runtime projection
- persistence format
- acceptance surface

대안은 실험으로 존재할 수 있지만 정본 빌드와 완료 판정에서 제외한다.

## 7. Evidence Ladder

증거는 강도가 다르다.

| Level | 증거 | 의미 |
|---|---|---|
| E0 | 문서·타입·인터페이스 | 의도 표현 |
| E1 | 단위 테스트 | 국소 규칙 검증 |
| E2 | 통합 테스트 | 모듈 연결 검증 |
| E3 | 실행 가능한 demo | 특정 예제 동작 |
| E4 | canonical workflow E2E | 사용자 작업 완료 |
| E5 | 저장·재로드·내보내기 round trip | 의미 보존 |
| E6 | 실제 소비자·운영 관찰 | 제품 적합성 |

`done`은 기본적으로 E4 이상을 요구한다. 저장 가능한 저작 도구는 E5를 요구한다.

## 8. Document Half-life

현재 상태를 여러 문서에 복제하면 문서가 코드보다 먼저 노후화된다.

- 제품 정의: `PRODUCT.md`
- 데이터와 상태 소유권: `MODEL.md`
- 금지 규칙: `INVARIANTS.md`
- 현재 실행 순서: `ROADMAP.md`
- 이력: Git, release, archive

그 외 문서는 이 정본을 링크한다.

## 9. Root Constitution

에이전트 기반 저장소의 루트 지침은 특정 기능 설명이 아니라 저장소 헌법이어야 한다.

최소 포함 항목:

- 제품의 단일 약속
- 정본 모델과 기본 runtime
- 레이어별 소유권
- 허용·금지 의존성
- 패키지 생성 기준
- legacy 정책
- 검증 명령
- 완료 기준
- architecture-sensitive change 시 읽을 문서

## 10. Vertical Slice Before Horizontal Platform

먼저 한 사용자의 작업을 UI부터 저장까지 끝낸다. 그 뒤 재사용되는 부분을 추출한다.

```text
나쁜 순서:
모델 → 계약 → 여러 adapter → 여러 runtime → editor 통합

권장 순서:
하나의 사용자 작업 E2E → 반복 → 안정된 경계 추출 → 확장
```
