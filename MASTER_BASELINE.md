# MASTER_BASELINE.md

> **Status**: Frozen Canonical Implementation Baseline  
> **Core Architecture**: 시스템 유지보수 라이프사이클과 툴 정의 체계 (Maintenance Lifecycle & Tool Governance System)  
> **Audience**: Implementation agents, maintainers, code reviewers, and multi-agent control planes  
> **Authority**: High normative force — preserves user architectural directives, closed-loop maintenance principles (MLC-01 ~ MLC-14), ADR 0001-0005, and multi-provider delivery specifications.

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

## 3. 모듈화된 프리셋 및 작업 스코프 인벤토리 (Modular Presets)

| Preset ID | Category | Skills Count | Dynamic Work Scope | Primary Purpose |
|---|---|:---:|---|---|
| **`paperthin-reflexes`** | Core Coding Baseline | 28 | (Default) | 일상 코딩, 리팩토링, TDD, 모델 반사신경 |
| **`condensation-core`** | Context Compiler | 3 | `scope: curation` | 80k 단일 정본 구현 기준선 컴파일 |
| **`baseline-curation-core`** | Deep Architecture | 11 | `scope: architecture` | 8대 도메인 전수 정제 및 아키텍처 축약 |
| **`mlc-recursive-context`** | H/V Context Engine | 13 | `scope: explore` | 4대 레지스트리 및 9대 H/V 재귀 탐색 |
| **`mlc-specialist-domains`** | Specialist Overlays | 5 | `scope: specialist` | AI Agent, DevTools, UI Editor 등 전문 도메인 |
| **`mlc-toolchain-plane`** | Tool & Capability Layer | 6 | `scope: toolchain` | Method 레지스트리, 툴체인 계획, 호출 가드 |
| **`mlc-lifecycle-governance`** | Lifecycle & Governance | 8 | `scope: governance` | 10단계 케이스 머신, 신호 수집, 책임 게이트 |
| **`baseline-full-suite`** | Full Master Suite | 43 | (All) | 43종 전체 MLC 제어 평면 일괄 사용 |
| **`builtin-pristine`** | Clean Slate Baseline | 0 | (Pristine) | 0개 스킬 상태로 안전한 완전 초기화 |

---

## 4. 품질 검증 및 릴리스 게이트

1. **TypeScript 무결성**: `npm run check` -> **0 errors**
2. **회귀 및 E2E 테스트**: `npm test` -> **100% Pass Rate**
3. **프로덕션 빌드**: `npm run build` -> 정상 번들링 완료

---
*시스템 유지보수 라이프사이클과 툴 정의 체계 (MLC) 정본 기준선 — Skills Platform Control Plane.*
