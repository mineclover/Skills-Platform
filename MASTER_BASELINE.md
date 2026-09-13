# MASTER_BASELINE.md

> **Status**: Verified Canonical Baseline & Reference Maintenance Architecture  
> **Core Philosophy**: 개방형 조합 기저 (Open Composability Substrate) & 시스템 유지보수 레퍼런스 아키텍처 (MLC)  
> **Audience**: Implementation agents, maintainers, code reviewers, and multi-agent control planes  
> **Authority**: High normative force for verified system invariants (contracts, schemas, security guards, tests). Preserves MLC reference architecture while establishing open composability for diverse community presets.

---

## 1. 핵심 철학과 3대 원칙 (Core Philosophy & Invariants)

Skills Platform은 단일 공식이나 획일적 아키텍처를 강제하지 않으며, 커뮤니티의 다양한 개발 철학과 자율적 조합을 1급 시민으로 존중합니다. 동시에, 엄격한 품질과 결정론적 유지가 요구되는 시스템을 위해 다음과 같은 **'지속적인 폐쇄 제어 루프(Continuous Closed-Loop Reference Control Plane)'** 아키텍처를 선택적 레퍼런스 모델로 제공합니다.

유지보수를 단순한 “문제 발생 -> 수정” 과정으로 보지 않는다.  
유지보수는 다음 네 종류의 자산을 순환시키는 **지속적인 폐쇄 제어 루프 (Continuous Closed-Loop Control Plane)** 모델을 레퍼런스로 채택할 수 있다.

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

## 2. 레퍼런스 유지보수 제어 아키텍처 계층 구조 (Reference Control Plane Architecture)

```text
Target System
실제로 운영·개발·배포되는 제품, 서비스, 모듈, 계약 (Apps, Contracts, Adapters)

Reference Maintenance Control Plane (MLC Implementation)
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

## 3. 모듈화된 프리셋 및 작업 스코프 인벤토리 (Modular Presets & Reference Suites)

아래 프리셋들은 프로젝트가 목적에 맞게 독립적으로 채택하거나 `--work-scope`를 통해 동적으로 오버레이할 수 있는 **'선택적 레퍼런스 템플릿(Optional Reference Templates)'**입니다. `recommended` 및 `work_scope_overlay` 역할은 자동 강제가 아니며 사용자/팀의 선택에 완전히 위임됩니다. 독자적인 프리셋과 레시피를 생성·배포하는 방법은 [recipes/README.md](./recipes/README.md) 및 [docs/guides/community-recipes-and-presets.md](./docs/guides/community-recipes-and-presets.md)를 참조하십시오.

| Preset ID | Category | Skills Count | Dynamic Work Scope | Primary Purpose |
|---|---|:---:|---|---|
| **`paperthin-reflexes`** | Reference Coding Reflexes | 28 | `scope: coding` | 일상 코딩, 리팩토링, TDD용 28개 반사신경 레퍼런스 스위트 (선택적 채택) |
| **`condensation-core`** | Context Compiler | 3 | `scope: curation` | 80k 단일 정본 구현 기준선 컴파일 |
| **`baseline-curation-core`** | Deep Architecture | 11 | `scope: architecture` | 8대 도메인 전수 정제 및 아키텍처 축약 |
| **`mlc-recursive-context`** | H/V Context Engine | 13 | `scope: explore` | 4대 레지스트리 및 9대 H/V 재귀 탐색 |
| **`mlc-specialist-domains`** | Specialist Overlays | 5 | `scope: specialist` | AI Agent, DevTools, UI Editor 등 전문 도메인 |
| **`mlc-toolchain-plane`** | Tool & Capability Layer | 6 | `scope: toolchain` | Method 레지스트리, 툴체인 계획, 호출 가드 |
| **`mlc-lifecycle-governance`** | Lifecycle & Governance | 8 | `scope: governance` | 10단계 케이스 머신, 신호 수집, 책임 게이트 |
| **`baseline-full-suite`** | Reference Master Suite | 43 | `scope: full` | 43종 전체 MLC 레퍼런스 컴포넌트 번들 (필요 시 일괄 채택) |
| **`builtin-pristine`** | Clean Slate Baseline | 0 | (Pristine) | 0개 스킬 상태로 안전한 완전 초기화 |

> 📖 **루프 유형별 매트릭스 거버넌스 사양서**: [docs/guides/loop-types-and-skill-presets-matrix.md](./docs/guides/loop-types-and-skill-presets-matrix.md)  
> (5대 표준 루프 유형: `LOOP-TDD`, `LOOP-ARCH`, `LOOP-RESEARCH`, `LOOP-HOTFIX`, `LOOP-SWARM`, `LOOP-AUDIT` 기반 스킬 생태계 바인딩 및 지속 고도화 프로토콜)

---

---

## 4. 텔레메트리 훅 엔진 및 수명주기 훅 관리 시스템 (Universal Hooks & Telemetry)

- **Universal Telemetry Hook Engine** (`.skills-platform/hooks/telemetry-hook.js`):
  - 무의존성 극초고속 (<2ms) 실행으로 모델 인보케이션 및 도구 실행 텔레메트리 자동 수집.
  - Google Antigravity (`.agents/hooks.json`), Claude (`.claude/hooks.json`), Codex/Ralph-TUI stdio 캡처 지원.
  - 원자적 `.skills-platform/telemetry/events.ndjson` 및 백엔드 `/api/telemetry/record` 비동기 플러시.
- **선언적 훅 매니페스트 관리** (`.skills-platform/hooks/manifest.json`, `apps/skills-catalog/src/hooks-manager.js`):
  - 표준 이벤트 분류: `session_start`, `session_stop`, `on_skill_invoke`, `pre_tool_use`, `post_tool_use`, `on_test_run`, `on_phase_transition`, `custom:*`.
  - CLI 연동: `skills-platform hook list/add/remove/enable/disable/test/sync`.
  - `Test Storm Suppression Guard`: Inner Loop 중 무차별 전체 테스트 스위트 실행 시도를 원천 차단.

---

## 5. 3단계 자율 라이프사이클 루프 러너 (Autonomous Lifecycle Loop Reference)

3단계 자율 라이프사이클 루프(Plan ➔ Inner Loop TDD ➔ Release Gate)는 복합 작업 시 에이전트의 컨텍스트 오염과 테스트 스톰을 방지하기 위해 제공되는 **선택적 레퍼런스 절차 루프(Reference Procedure Loop)**입니다. 개별 프로젝트는 필요에 따라 이 루프를 사용하거나, 더 가벼운 독자적인 실행 방식을 자유롭게 선택할 수 있습니다.

`skills-platform loop run --prd <path> --project <path> --provider <provider>`

1. **Phase 1 (Plan)**: `task-planning-recipe.json` 장착 $\rightarrow$ PRD를 의존성 정렬된 원자적 `task-queue.json`으로 분해 (코드 수정 금지).
2. **Phase 2 (Inner Loop)**: `scoped-inner-loop-recipe.json` 심볼릭 링크 핫스왑 $\rightarrow$ 단일 Task 타겟 테스트(`run_scoped_test`)만 실행하여 빠른 TDD 수정 (전체 테스트 스캔 차단).
3. **Phase 3 (Release Gate)**: `release-governance-recipe.json` 핫스왑 $\rightarrow$ 1회 전수 회귀 테스트 검증 후 `MASTER_BASELINE.md` 정본 갱신.

---

## 6. 품질 검증 및 릴리스 게이트

1. **TypeScript 무결성**: `npm run check` -> **0 errors**
2. **단위 및 통합 테스트**: `npm test` -> **306/306 Passing (100%)**
3. **E2E 테스트 스위트**: `node tests/e2e/run-all.js` -> **184/184 Passing across 39 Suites (100%)**
4. **프로덕션 빌드**: `npm run build` -> 정상 번들링 완료 (`apps/catalog-ui/dist`)

---
*참조 결정 기록: ADR 0001 ~ ADR 0007 (Telemetry Hook Engine & Lifecycle Loop Architecture).*
*시스템 유지보수 라이프사이클과 툴 정의 체계 (MLC) 레퍼런스 기준선 — Skills Platform Open Composability Substrate.*
---

## 7. 프로덕션 보안 가드 훅 & 쇼트서킷 엔진 (Production Guard Hook Engine)

### 7.1 5대 빌트인 가드 훅 팩 (`.skills-platform/hooks/guards/`)
1. **`secret-leak-guard.js` (P:5)**: AWS, OpenAI, Claude, GitHub, Google API 키 및 프라이빗 인증 정보 유출 감지 시 `pre_tool_use`에서 **도구 실행 즉각 차단**.
2. **`destructive-command-blocker.js` (P:10)**: `rm -rf /`, PowerShell `Remove-Item -Recurse -Force`, `del /s /q`, `DROP TABLE`, 디스크 포맷 등 **파괴 명령어 차단**.
3. **`context-budget-guard.js` (P:15)**: 80k 토큰 밀도(~320KB) 초과 거대 파일 생성 차단.
4. **`scope-boundary-enforcer.js` (P:20)**: `VerticalTopicSpec.owned_files` 외의 파일 무단 수정 시 드리프트 경고 등록.
5. **`subagent-recursion-limiter.js` (P:25)**: 서브에이전트 재귀 호출 깊이(Depth > 3) 및 동시 실행 수(> 4) 제한.

### 7.2 듀얼 프로토콜 규격 (Dual Protocol Compatibility)
* **Google Antigravity Proto**: `{ decision: "allow" }` / `{ decision: "deny", reason: "..." }`
* **Claude / Codex / Platform Standard**: `{ allow: true }` / `{ allow: false, reason: "..." }`

---

## 8. Web UI Flow Studio & Governance Studio 시각화 캔버스

### 8.1 4대 시각화 다이어그램 (`apps/catalog-ui/src/components/flow/`)
1. **3-Phase Lifecycle Diagram**: 기획(Plan) $ightarrow$ Scoped Inner Loop(TDD) $ightarrow$ 릴리즈 게이트 상태 머신 및 Test Storm Shield 차단 애니메이션.
2. **Hook Pipeline Graph**: 우선순위 기반 Pre-Tool 체인 및 Red Halt 노드 쇼트서킷 분기 다이어그램.
3. **Fractal Context Tree**: $L_0 ightarrow L_1 ightarrow L_2$ 상대적 계층 드릴다운 및 Roll-Up 파티클 시각화.
4. **Junction Delivery Map**: 프로바이더별 심볼릭 링크 전달 경로 및 드리프트 상태 맵.

### 8.2 시뮬레이션 및 노드 인스펙터
* **Node Detail Inspector**: 노드 클릭 시 토픽 계층, 타겟 테스트, 차단 사유, Diff 패치 표출.
* **Flow Playback Controller**: 타임라인 스크러버 복기 및 1-Click 공격 시뮬레이션 패킷 애니메이션 (< 200ms).

---

## 9. 80k 정보 선별 압축 가이드라인 (3-Tier Condensation Rubric)

* **Tier 1 (100% 원본 보존)**: `Topic ID`, `lineage_path`, 공개 AST 시그니처, 불변식, 1:1 타겟 테스트 파일.
* **Tier 2 (구조적 축약)**: 전체 코드 $ightarrow$ 인터페이스 선언 + Diff 패치, 수십 턴 대화 $ightarrow$ 단일 결정 요약, 장황한 로그 $ightarrow$ 통과/실패 테이블.
* **Tier 3 (완전 배제)**: 디버깅 잡음, Out-of-bounds 구현 상세, 중복 Lockfile.
