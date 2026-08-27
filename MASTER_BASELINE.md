# MASTER_BASELINE.md

> **Status**: Frozen Canonical Implementation Baseline  
> **Core Architecture**: 시스템 유지보수 라이프사이클과 툴 정의 체계 (Maintenance Lifecycle & Tool Governance System)  
> **Audience**: Implementation agents, maintainers, code reviewers, and multi-agent control planes  
> **Authority**: High normative force — preserves user architectural directives, closed-loop maintenance principles (MLC-01 ~ MLC-14), ADR 0001-0003, and multi-provider delivery specifications.

---

## 1. 핵심 철학과 3대 원칙 (Core Philosophy & Invariants)

유지보수를 단순한 “문제 발생 -> 수정” 과정으로 보지 않는다.  
유지보수는 다음 네 종류의 자산을 순환시키는 **지속적인 폐쇄 제어 루프 (Continuous Closed-Loop Control Plane)**이다.

```text
사전 컨텍스트 (Prior Context)
  -> 행동 (Behavior)
  -> 결과·증거 (Evidence)
  -> 컨텍스트 변경 제안 (Patch Proposal)
  -> 검증된 새 컨텍스트 (Validated Context Snapshot)
```

### 1.1 핵심 3대 원칙
1. **컨텍스트는 행동의 사전 조건이다.** (Context is a strict precondition of behavior)
2. **행동은 컨텍스트를 소비하지만 직접 덮어쓰지 않는다.** (Behaviors consume context and propose patches; they NEVER mutate published baselines directly)
3. **툴은 행동이 사용하는 실행 수단이며, 행동 자체와 동일하지 않다.** (Tools execute capabilities; methods define procedures; skills orchestrate behaviors)

---

## 2. 유지보수 시스템 상위 계층 구조 (Maintenance Control Plane)

```text
Target System
실제로 운영·개발·배포되는 제품, 서비스, 모듈, 계약 (Apps, Contracts, Adapters)

Maintenance Control Plane (Skills Platform)
├── Registry Layer
│   ├── Element Registry (독립 시스템 요소 식별자)
│   ├── Topic Registry (작업 단위 고유 ID 및 라이프사이클)
│   ├── Responsibility Registry (요소·관계·계약 소유권)
│   ├── Convention Registry (스코프별 규칙 및 우선순위)
│   ├── Exploration Method Registry (도구 독립적 추상 탐색 방법)
│   └── Tool Capability Registry (원자적 기능 및 바인딩)
│
├── Context Layer
│   ├── Horizontal Context (넓은 시야의 신호 분석 및 토픽 탐색 사전 정보)
│   ├── Vertical Context (단일 토픽 집중 해결을 위한 상세 정본)
│   ├── Context Snapshot (불변 실행 스냅샷)
│   └── Context Patch Proposal (행동 결과 기반의 변경 제안)
│
├── Behavior Layer
│   ├── Horizontal Exploration Behavior (토픽 탐색·선별, Topic Handoff 생성)
│   ├── Topic Selection Behavior (고유 ID 기반 해결 대상 선정)
│   ├── Vertical Resolution Behavior (단일 토픽 원인 진단 및 변경 수행)
│   └── Validation Behavior (수용 기준 및 증거 검증)
│
├── Tool Layer
│   ├── Tool Capability (도구 독립적 원자 기능: search, read, trace, patch, test)
│   ├── Tool Binding (환경별 실제 실행 도구: CLI, Junction, Git, AST parser)
│   ├── Tool Invocation (실행 이력, 파라미터, 산출물 추적)
│   └── Tool Invocation Guard (권한·책임·안전 사전 차단 게이트)
│
├── Evidence Layer
│   ├── Signal (로그, 이상 징후, 드리프트 등 검토 필요 신호)
│   ├── Observation (탐색 과정의 객관적 관측 사실)
│   ├── Test Evidence (단위/계약/통합 테스트 통과 증거)
│   ├── Change Evidence (Change Set, Rollback Plan)
│   └── Runtime Evidence (실제 운영 안정화 데이터)
│
└── Governance Layer
    ├── Lifecycle Controller (10단계 케이스 상태 머신)
    ├── Responsibility Gate (해결 책임 주체 및 허용 방식 판정)
    ├── Change Gate (변경 스코프 및 가역성 검사)
    ├── Release Gate (배포 및 마이그레이션 통제)
    └── Closure Gate (학습 결과 반영 및 케이스 종결)
```

---

## 3. 독립 3대 라이프사이클 체계

| 라이프사이클 | 대상 | 목적 및 제어 루프 |
|---|---|---|
| **시스템 유지보수 라이프사이클** | 전체 운영 시스템 | `Baseline -> Observe -> Explore -> Resolve -> Stabilize -> Learn -> Govern -> Baseline 갱신` |
| **유지보수 케이스 라이프사이클** | 하나의 문제 또는 목표 | `SIGNALLED -> EXPLORING -> TOPIC_SELECTED -> ROUTED -> CONTEXT_READY -> RESOLVING -> VALIDATING -> RELEASING -> STABILIZING -> CLOSED` |
| **제어 자산 라이프사이클** | 컨텍스트·컨벤션·툴 | `DRAFT -> VALIDATED -> PUBLISHED -> IN_USE -> SUPERSEDED -> ARCHIVED` |

---

## 4. 수평(Horizontal)·수직(Vertical) 분리 및 재귀(Recursive) 흐름

```text
수평 컨텍스트
  -> 수평 행동 (탐색·비교)
  -> 토픽 선별 (Topic Handoff)
  -> 책임 게이트 (Responsibility Routing)
  -> 수직 컨텍스트 발행 (단일 Topic ID)
  -> 수직 행동 (원인 분석 -> 변경 -> 검증)
  -> 운영 반영 및 안정화 관찰
  -> 학습 (Context Patch Proposal) -> 거버넌스 갱신
```

### 4.1 수평/수직 분리 원칙
- **수평 행동 (Horizontal)**: 문제를 직접 고치지 않고, 신호 간 상관관계를 분석해 해결 토픽을 선별하고 `Topic Handoff`를 발행함.
- **수직 행동 (Vertical)**: 오직 하나의 `topic_id`에만 집중하여 문제를 해결하며, 조사 범위를 무제한 확장하지 않음.
- **재귀적 분기 (Recursive)**: 수직 해결 중 새로운 불확실성 발견 시, 수직 스코프를 억지로 넓히지 않고 자식 수평 탐색(`Child Horizontal Exploration`)을 파생시킴.

### 4.2 책임 라우팅 게이트 (Responsibility Gate)
`문제의 원인 위치 != 현재 태스크의 해결 위치`

| 라우팅 결과 | 의미 및 허용 행동 |
|---|---|
| **`OWNED_RESOLUTION`** | 관리 중인 내부 요소를 직접 수정 |
| **`DELEGATED_RESOLUTION`** | 위임받은 명시적 범위 내에서만 수정 |
| **`BOUNDARY_MITIGATION`** | 외부 요소는 건드리지 않고 관리 중인 어댑터/경계에서 방어 완화 |
| **`HANDOFF_REQUIRED`** | 외부 실제 관리 책임자에게 이슈/증거 이관 |
| **`OBSERVE_ONLY`** | 관찰과 증거 수집만 수행 |
| **`OUT_OF_SCOPE`** | 현재 유지보수 체계 밖으로 판정 |

---

## 5. 스킬·방법·기능·툴의 분리 (Tooling Taxonomy)

```text
Context    : 무엇을 알고 있어야 하는가 (사전 지식, 컨벤션, 경계)
Method     : 어떤 추상적 방식으로 조사하거나 해결할 것인가 (예: Dependency Impact Analysis)
Skill      : 방법을 선택하고 절차를 수행하는 실행 논리 (Behavior Orchestrator)
Capability : 절차가 필요로 하는 도구 독립적 원자 능력 (예: search-code, capture-trace, apply-patch)
Tool       : Capability를 실제로 제공하는 실행 수단 (예: git, NTFS Junction, Chrome CDP, Jest)
```

### 5.1 툴 분류 5개 축
1. **생명주기 역할**: `baseline`, `observe`, `explore`, `select`, `context-build`, `diagnose`, `change`, `validate`, `release`, `stabilize`, `learn`, `govern`
2. **행동 방향**: `horizontal`, `vertical`, `both`
3. **효과 등급**: `observe` (읽기), `analyze` (파생 분석), `propose` (제안), `mutate` (실제 변경), `control` (배포/롤백), `govern` (규칙 갱신)
4. **책임 적용 범위**: `managed`, `delegated-managed`, `boundary-managed`, `consumed`, `observed`, `external`
5. **증거 강도**: `reference` < `declared` < `implementation` < `runtime` < `validated` < `production`

---

## 6. 핵심 불변조건 (Invariant Rules MLC-01 ~ MLC-14)

- **MLC-01**: 모든 행동은 반드시 검증되어 발행된 `Context Snapshot`을 참조해야 한다.
- **MLC-02**: 모든 수직 행동은 단 하나의 canonical `topic_id`를 가져야 한다.
- **MLC-03**: 수평 행동은 토픽을 탐색·선별하며 직접 코드를 수정하지 않는다.
- **MLC-04**: 수직 행동은 선택된 토픽에만 집중하며 탐색 범위를 무제한 확장하지 않는다.
- **MLC-05**: 변경 툴(`mutate`)은 반드시 `Responsibility Gate`를 통과해야 한다.
- **MLC-06**: consumed, observed, external 요소의 내부는 직접 변경하지 않는다.
- **MLC-07**: 행동은 컨텍스트를 직접 수정하지 않고 `Context Patch Proposal`을 생성한다.
- **MLC-08**: 검증 증거(Evidence) 없이 해결 완료를 선언하지 않는다.
- **MLC-09**: 테스트 통과와 운영 안정화 완료를 명확히 구분한다.
- **MLC-10**: 모든 Tool Invocation은 입력, 출력, 효과, 권한, 증거를 기록해야 한다.
- **MLC-11**: 신호(Signal)와 토픽(Topic)의 1:N / N:1 관계를 허용하고 추적한다.
- **MLC-12**: 수직 해결 중 새 탐색이 필요하면 자식 수평 행동을 재귀적으로 생성한다.
- **MLC-13**: 툴 이름이 아니라 `Capability`와 `Method`를 기준으로 행동을 설계한다.
- **MLC-14**: 관리 책임이 없는 문제는 직접 수정하지 않고 경계 완화, 이관, 관찰로 라우팅한다.

---

## 7. Skills Platform 구현체 매핑 및 배포 매트릭스

Skills Platform은 위 **Maintenance Control Plane**의 실제 소프트웨어 구현체이다.

| Control Plane 레이어 | Skills Platform 구현 모듈 | 역할 및 물리적 위치 |
|---|---|---|
| **Registry Layer** | `apps/skills-catalog/src/registry.js` | 불변 SHA-256 리비전 저장소 (`.skills-platform/registry/`) |
| **Catalog & Governance** | `apps/skills-catalog/src/catalog-state.js` | 프로젝트, 프리셋, 라이프사이클 관리 (`.skills-platform/catalog/catalog.json`) |
| **Tool & Delivery Adapter** | `@skills-platform/skills-manager-adapter` | OS 파일시스템 Junction/Symlink 원자적 전달 및 Invocation Guard |
| **Contracts** | `@skills-platform/contracts` | 불변 데이터 타입, Recipe 스키마, 무결성 검증기 |
| **Reactive Web UI** | `@skills-platform/catalog-ui` | Recipe Hub, 5-Stage Stepper Modal, Live Diagnostic Drawer |

### 7.1 멀티 프로바이더 바인딩 규칙
- **Google Antigravity**: `<project>/.agents/skills/<skill-name>` (Junction)
- **OpenAI Codex CLI**: `<project>/skills/<skill-name>` (Junction)
- **Anthropic Claude Desktop**: `<project>/.claude/skills/<skill-name>` (Junction)

---

## 8. 품질 검증 및 릴리스 게이트

1. **TypeScript 무결성**: `npm run check` -> **0 errors**
2. **회귀 및 E2E 테스트**: `npm test` -> **100% Pass Rate** (178/178 tests)
3. **프로덕션 빌드**: `npm run build` -> 정상 번들링 완료

---
*시스템 유지보수 라이프사이클과 툴 정의 체계 (MLC) 정본 기준선 — Skills Platform Control Plane.*
