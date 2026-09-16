# 스킬 분류, 다축 택소노미 및 페르소나 지식 라우팅

분류는 찾기 쉽게 만드는 메타데이터이며 추천이나 승인 자체가 아니다. Skills Platform은
배포, 런타임 제어, 인지적 역할이라는 서로 다른 관심사를 직교하는 다축(Multi-Axis)으로
분리하여 관리한다.

---

## 1. 5대 핵심 개체와 3차원 직교 매트릭스

스킬 플랫폼의 아키텍처는 5개 핵심 개체와 3차원 직교 축으로 구성된다.

```
[차원 A: 배포/패키징 축]      [차원 B: 런타임 제어/합성 축]       [차원 C: 인지적 페르소나/지식 축]
   (Packaging/Delivery)          (Runtime Configuration)            (Cognitive Persona & Routing)
         │                               │                                     │
    Recipe / Tarball             Catalog / Presets                       7 Expert Personas
(독립 이식·공유 매니페스트)     (버전 템플릿·스코프 오버레이)               (전문가별 지식 2계층 분리)
         │                               │                                     │
         └───────────────┬───────────────┘                                     │
                         ▼                                                     ▼
                Effective Skillset                                      Subagent Routing
               (런타임 최종 활성 집합)                                (invoke_subagent로 위임)
```

### 5대 핵심 개체 정의

1. **원자적 스킬 (Atomic Skill)**: 최소 단위의 실행 가능한 지식 패키지(`SKILL.md`, `scripts/`, `references/`). 특정 절차나 런북을 완결성 있게 담는다.
2. **프리셋 (Preset)**: `catalog.json`의 `presets[]`에 등록된 버전 관리 구성 템플릿. 역할(`default`, `recommended`, `work_scope_overlay`)과 `priority`를 갖는다.
3. **스킬셋 (Skillset)**: 특정 프로젝트와 작업 범위에서 합성된 **런타임 최종 활성 상태(`EffectiveSkillSet`)**. 기본 프리셋에 일치하는 작업 범위(`work_scope_overlay`)가 결합된 결과다.
4. **레시피 (Recipe)**: 외부 공유 및 머신 간 독립 이식을 위한 단일 파일 패키징 매니페스트(`*-recipe.json`, `recipes/index.json`). 프리셋, 프로젝트, 훅, 스킬 참조를 함께 묶는다.
5. **페르소나 (Persona)**: 인지적 역할 아키타입(Cognitive Archetype). 복합 작업을 전문 영역별로 분할하고, 스킬을 **직무 고유 지식**과 **범용 공유 지식**으로 구조화하여 서브에이전트 위임의 기준이 된다.
6. **작업 스코프 (Work Scope)**: 프로젝트의 현재 상황적 맥락을 나타내는 태그(`--work-scope <tag>`). 오버레이 프리셋을 동적으로 필터링하고 합성할 때 사용된다.

### 3차원 직교 매트릭스

| 차원 | 핵심 질문 | 대표 개체 | 주요 메커니즘 |
| --- | --- | --- | --- |
| **차원 A: 배포/패키징 축** | 어디서 가져와 어떻게 배포할 것인가? | Recipe, Package Tarball, Registry Revisions, Adapters | 레시피 export/import, tarball 검증, adapter 파일 복사/심볼릭 링크 |
| **차원 B: 런타임 제어/합성 축** | 현재 프로젝트/작업에 어떤 스킬을 활성화할 것인가? | Catalog, Presets, Work Scope Overlays, Priority | `project resolve --work-scope`, dynamic overlay, lineage 충돌 해결 |
| **차원 C: 인지적 페르소나/지식 축** | 누가 어떤 깊이의 지식으로 이 작업을 수행할 것인가? | 7 Expert Personas, Specialized vs Cross-Functional Knowledge | `invoke_subagent` (Role 위임), 2계층 지식 라우팅, 컨텍스트 격리 |

---

## 2. 7대 전문가 페르소나와 2계층 지식 아키텍처

하나의 에이전트 컨텍스트에 모든 스킬을 무분별하게 주입하면 컨텍스트 윈도우 낭비와 환각, 스킬 간 간섭이 발생한다.
Skills Platform은 지식을 2계층으로 분리하고, 7대 특화 페르소나를 통해 전문가 연계를 제공한다.

### 2계층 지식 분류 (Two-Tier Knowledge Architecture)

- 🔒 **직무 고유 지식 (Specialized Knowledge)**: 특정 전문 영역의 심층 런북, 전용 프로토콜, 폐쇄적 인터페이스. 해당 전문가에게 위임할 때만 활성화되어야 하는 핵심 역량이다.
- 🌐 **범용 공유 지식 (Cross-Functional / General Knowledge)**: 여러 직무에서 공통 기반으로 참조하는 안전 규격, 프로세스 위생, 단위 테스트 격리 원칙.

### 7대 전문가 페르소나 명세

| 페르소나 | 영문 직무명 & 주요 도메인 | 🔒 직무 고유 지식 (Specialized) | 🌐 범용 공유 지식 (General) |
| --- | --- | --- | --- |
| **디버깅 전문가** | `Debugging Specialist`<br>(Runtime & Memory Debugging) | `deterministic-test-runner` (핸들 누수 진단)<br>`lch-failure-recovery` (장애 롤백)<br>`workflow-feedback-optimizer` | `scoped-tdd-executor`<br>`skill-authoring-standard` |
| **크롬 자동화 전문가** | `Chrome Automation Specialist`<br>(CDP & Headless Lifecycle) | `chrome-instance-hygiene` (헤드리스 선별 격리)<br>`chrome-extensions` (MV3 아키텍처) | `modern-web-guidance`<br>`deterministic-test-runner` |
| **포토샵 작업 전문가** | `Photoshop Specialist`<br>(Photoshop & Generator TCP) | `photoshop-toolchain-workflow` (Generator TCP 49494, Action Manager JSX, TypeSpec) | `svg-authoring`<br>`scoped-tdd-executor` |
| **웹 프로그래밍 전문가** | `Web Frontend Specialist`<br>(Modern Web & TypeScript AST) | `modern-web-guidance` (웹 표준 API 최적화)<br>`lch-contract-compiler` (TS AST 무손실 동기화) | `deterministic-test-runner`<br>`generative_ui` |
| **디자인 전문가** | `Design & Visual Specialist`<br>(Mathematical Vector & UI) | `svg-authoring` (W3C 극좌표·3차 베지에 공식)<br>`generative_ui` (시각 위젯 렌더링) | `modern-web-guidance`<br>`scene-content-authoring` |
| **스토리텔러** | `Interactive Storyteller`<br>(Narrative & Scene Experience) | `scene-content-authoring` (view(state) 3-lane)<br>`openwiki-grounding` (OKF v0.2 근거 체계)<br>`openwiki-cli` | `svg-authoring`<br>`generative_ui` |
| **QA 전문가** | `Deterministic QA Specialist`<br>(Deterministic Test Governance) | `deterministic-test-runner` (결정론적 테어다운)<br>`scoped-tdd-executor` (Test Storm 가드)<br>`lch-independent-auditor` | `chrome-instance-hygiene`<br>`skill-authoring-standard` |

---

## 3. 전문가 라우팅 어드바이저 (Expert Routing Advisor)

복합 과제가 주어졌을 때 사용자와 에이전트는 다음 기준에 따라 “아, 이 스킬은 이 전문가에게 가야 하는구나!”를 판단하고 서브에이전트로 위임한다.

### 주요 시나리오별 전문가 라우팅

| 마주한 작업 상황 | 권장 전문가 | 핵심 스킬 | 전문가 연계 이유 (Expert Advantage) |
| --- | --- | --- | --- |
| 크롬 창이 안 열리거나 9222 포트 점유 에러 | **크롬 자동화 전문가** | `chrome-instance-hygiene` | 단순 `killall`은 정상 GUI 크롬을 종료시킴. 단일 인스턴스 구조에 근거해 헤드리스 프로세스와 락파일만 선별 해제함. |
| `node --test` 실행 후 프로세스가 끝나지 않고 멈춤 | **디버깅 전문가** | `deterministic-test-runner` | 텍스트 스트림 감시 대신 libuv의 Active Handles를 추적해 소켓/타이머를 파괴하고 Protojson 가드로 사전 차단함. |
| PSD 파일 레이어/텍스트 변형 및 스키마 검증 | **포토샵 작업 전문가** | `photoshop-toolchain-workflow` | UI 매크로 대신 Generator TCP 49494 패킷 통신과 선언적 JSX 디스크립터로 상태 오염 없는 무손실 변형을 보장함. |
| 베지에 곡선·산키·레이더 차트 그래픽 구현 | **디자인 전문가** | `svg-authoring` | 어림짐작 CSS 대신 W3C SVG 표준 극좌표계와 3차 베지에 기하학 공식으로 픽셀 단위의 정확한 벡터를 수학적으로 계산함. |
| 사용자 참여형 인터랙티브 스토리/퀴즈 개발 | **스토리텔러** | `scene-content-authoring` | 프레임워크 종속성 없이 view(state) 순수 데이터 딕셔너리와 3-lane 스케줄러로 프레임 드랍 없는 일관된 몰입 경험을 설계함. |
| TDD 중 전체 테스트 스위트가 무분별하게 실행 | **QA 전문가** | `scoped-tdd-executor` | 전역 회귀 테스트를 차단하는 Test Storm Guard 컴패니언 훅을 발동시켜 변경된 타깃 1개만 1:1로 검증하는 이너루프를 강제함. |

### 페르소나와 프리셋을 1:1로 붕괴(Collapse)시키지 않는 원칙

- **페르소나는 인지적 주체(Actor)**이며, **프리셋은 정적 템플릿(Config)**이다.
- 하나의 페르소나(예: 크롬 자동화 전문가)는 분석 단계에서는 `debugging` 프리셋을, 구현 단계에서는 `browser` 프리셋을, 검증 단계에서는 `qa` 프리셋을 스코프에 맞게 교체하며 활용한다.
- 따라서 페르소나와 프리셋을 동일시하여 1:1로 고정하지 않고, 독립된 차원으로 상호 직교 결합한다.

### 서브에이전트 위임 워크플로우 (`invoke_subagent`)

1. 메인 에이전트가 작업의 도메인 특화성을 식별한다.
2. 직무 고유 지식이 필요한 경우 `invoke_subagent`를 호출하며, `Role`에 해당 전문가 직무명(예: `Role: "Chrome Automation Specialist"`)을 명시한다.
3. 서브에이전트는 독립된 컨텍스트에서 전문 스킬의 `SKILL.md`와 authoritative assets를 로드하여 정밀 분석을 수행하고 핵심 결과만 메인 에이전트에 회신한다.

---

## 4. 최소 기본셋과 작업별 선택

Skills Platform 자체를 사용하는 프로젝트의 기본셋은 `skills-platform-guide`,
`skill-authoring-standard`, `writing-great-skills`다. 마지막 스킬은 Codex 명시 호출 전용이다.
이 구성을 모든 다른 프로젝트의 기본값으로 일반화하지 않는다.

- 재현 가능한 버그·회귀 진단: `diagnosing-bugs`를 검토한 작업별 후보로 둔다.
- 설계 검토: `codebase-design`의 용어와 방식이 프로젝트에 맞는지 확인한다.
- 테스트 우선 구현: `tdd`의 테스트 경계 사전 합의 조건을 확인한 후 선택한다.
- 코드 리뷰: 이 저장소의 `code-review`는 issue-tracker 설정과 별도 준비 스킬을 전제한다.
  전제가 없으면 준비가 필요한 후보로 표시한다.
- 내장 `skill-creator`와 동명 저장소 패키지는 출처를 구분한다. 저장소 사본은 비교용으로
  관리하고 기본 전달셋에는 넣지 않는다.

추천은 패키지 내용, 호스트·도구 전제와 실제 수행 근거로 설명한다. 설치 수나 이름만으로
품질 점수를 만들지 않는다. 전제 때문에 적용을 보류하는 경우 그 패키지와 조건을 밝힌다.

---

## 5. Catalog 역할과 정렬

| 항목 | 실제 의미 |
| --- | --- |
| `default` | 프로젝트 기본 선택 |
| `recommended` | 추천 후보 기록. Catalog에서는 자동 활성화되지 않음 |
| `work_scope_overlay` | assignment의 모든 작업 범위 태그가 맞을 때 기본셋에 합성 |
| `priority` | 같은 lineage가 충돌할 때 큰 숫자가 우선. 추천 점수나 스킬 실행 순서가 아님 |

Catalog CLI/API 검색의 기본 정렬은 profile title 순이다. 태그로 좁힌 뒤 이름순으로
확인한다. 원하는 추천 제시 순서는 가이드에 별도로 기록한다. Skills Manager store v3도
같은 역할과 여러 태그의 AND 조건을 사용한다. `work_scope_tags` 배열이 있으면 기존
`work_scope` 문자열보다 우선한다. 배열 없는 예전 문자열은 쉼표를 포함해 하나의 태그다.
명시적 빈 배열은 모든 범위와 일치하므로 특정 작업용 overlay에는 태그를 지정한다.
v0/v1의 recommended는 기존 활성 동작을 보존하도록 work_scope_overlay로 읽으며,
v2의 기존 역할도 유지한다. 마이그레이션은 읽기만으로 파일을 바꾸지 않는다.

---

## 6. 적용과 평가

현재 선택과 대상 경로를 확인하고, 검토한 revision으로 고정 plan을 만든다. 추가 설치에는
`history record-plan --enabled-only`를 사용하고 `history apply PLAN_ID`로 같은 계획을
preview/apply한다. 이 경로는 정책 검사와 report 기록을 함께 수행한다. 추천 후보가 요청
없이 활성화되지 않았는지도 확인한다.

`advisory`는 검토 기록을 강제하지 않는다. `require_approved`는 Catalog 계획과 실제 적용에서
최신 source 승인을 요구하고 폐기된 선택을 차단한다. 독립 adapter는 이 정책을 읽지 않는다.
미검토 또는 거절된 콘텐츠를 “검토 완료”로 표시하지 않으며 source·profile·preset의 검토
상태와 호스트 발견·실제 사용 결과를 별도로 기록한다.

평가에는 적용 전후 구성, 분류 범위, 검토 근거, 계획/보고서 ID, 재-preview 결과와 미검증
단계를 남긴다. 현재 recipe export는 포함된 스킬 profile과 프로젝트 assignment의
role/priority/태그/enabled/고정 버전을 보존한다. source 승인과 평가 이력은 이식하지 않으며,
프리셋에 포함되지 않은 전체 스킬 목록의 백업도 아니다. 전체 가이드는 플랫폼 체크아웃의
`docs/guides/recommended-skillsets-guide.md`를 확인한다.
