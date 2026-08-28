# 📖 Skills Platform 엔드투엔드 통합 운영 및 개발자 가이드
*(Skills Platform End-to-End User & Developer Runbook)*

본 문서는 **수직 스펙 작성**, **3단계 자율 라이프사이클 루프 운용**, **5대 보안 가드 훅 및 쇼트서킷 관리**, **레시피 통합 패키징**, 그리고 **Web UI Flow Studio & Governance Studio**의 실제 활용법을 단계별로 설명하는 정본 사용자 가이드입니다.

---

## 📑 목차 (Table of Contents)

1. [🚀 빠른 시작 (Quick Start)](#1-빠른-시작-quick-start)
2. [🔄 3단계 자율 라이프사이클 루프 운용법](#2-3단계-자율-라이프사이클-루프-운용법)
3. [🧬 상대적 프랙탈 컨텍스트 & 80k 정보 선별 압축 가이드](#3-상대적-프랙탈-컨텍스트--80k-정보-선별-압축-가이드)
4. [🛡️ 5대 보안/거버넌스 가드 훅 및 쇼트서킷 관리](#4-5대-보안거버넌스-가드-훅-및-쇼트서킷-관리)
5. [📦 레시피-훅 통합 패키징 및 원격 배포](#5-레시피-훅-통합-패키징-및-원격-배포)
6. [🖥️ Web UI Flow Studio & Governance Studio 활용법](#6-web-ui-flow-studio--governance-studio-활용법)
7. [🛠️ CLI 전체 명령어 레퍼런스](#7-cli-전체-명령어-레퍼런스)

---

## 1. 🚀 빠른 시작 (Quick Start)

### 1.1 저장소 빌드 및 대시보드 구동
```bash
# 의존성 설치 및 패키지 빌드
npm install
npm run build

# 카탈로그 백엔드 및 Web UI 대시보드 실행
npm start
# 웹 브라우저에서 http://localhost:5173 (또는 카탈로그 포트) 접속
```

### 1.2 표준 훅 엔진 동기화 (Antigravity & Claude)
```bash
# 매니페스트 기반으로 .agents/hooks.json 및 .claude/hooks.json 자동 동기화
skills-platform hook sync
```

---

## 2. 🔄 3단계 자율 라이프사이클 루프 운용법

Skills Platform은 작업의 크기에 상관없이 **3단계 상태 머신**을 통해 에이전트의 컨텍스트 오염과 무분별한 테스트 스톰을 기계적으로 차단합니다.

```text
[ 📑 PRD.md ] ──➔ [ Phase 1: Plan ] ──➔ [ Phase 2: Scoped Inner Loop ] ──➔ [ Phase 3: Release Gate ]
                   (task-planning)        (scoped-inner-loop: TDD)           (release-governance)
                   ↳ task-queue.json       ↳ 1:1 Target Test Only             ↳ 1 Full Regression Sweep
                                           ↳ ⚡ Test Storm Shield Block       ↳ MASTER_BASELINE.md 갱신
```

### 2.1 자율 루프 1-Click 실행
```bash
skills-platform loop run   --prd ./docs/PRD_FEATURE.md   --project ./projects/my-app   --provider antigravity
```

### 2.2 각 단계별 동작 및 강제 규칙

| 단계 | 활성 레시피 | 허용 행위 | 🚫 엄격 차단 규칙 |
| :--- | :--- | :--- | :--- |
| **Phase 1<br>(기획)** | `task-planning-recipe.json` | PRD 분석, 의존성 정렬된 `task-queue.json` 생성 | 소스 코드 파일 직접 수정 차단 |
| **Phase 2<br>(국소 TDD)** | `scoped-inner-loop-recipe.json` | 큐에서 단일 Task를 꺼내 `run_scoped_test`로 핀포인트 TDD | **전체 테스트(`npm test`, `pytest`) 실행 시 즉각 차단 (Test Storm Guard)** |
| **Phase 3<br>(릴리즈 게이트)** | `release-governance-recipe.json` | 단 1회의 전수 회귀 테스트 실행 및 정본 기준선 갱신 | 미완료 태스크가 남아있는 경우 진입 차단 |

---

## 3. 🧬 상대적 프랙탈 컨텍스트 & 80k 정보 선별 압축 가이드

### 3.1 상대적 프랙탈 원리 (Relative Fractal Planes)
* **$L_0$ (전사 시스템)**: 전체 시스템 신호 $ightarrow$ 수직 토픽(`topic:auth/jwt_cache`) 선정
* **$L_1$ (로컬 기준면)**: 해당 토픽 내부의 소유 파일(Owned) vs 참조 인터페이스 vs 수정 금지(Out-of-Bounds) 영역 정의
* **$L_2$ (핀포인트 태스크)**: 단일 타겟 테스트 파일과 불변식이 1:1 바인딩된 80k Bounded Spec
* **롤업(Roll-Up)**: $L_2$ 태스크 완료 시 검증 증거가 $L_1 ightarrow L_0$로 역류하여 정본에 안전하게 합류

### 3.2 80k 3-Tier 정보 선별 압축 매트릭스

| Tier | 처리 전략 | 보존 및 선별 대상 항목 |
| :--- | :--- | :--- |
| **Tier 1 (100% 원본 보존)** | **Raw Fidelity** | • 토픽 고유 식별자 (`topic_id`) 및 계층 경로 (`lineage_path`)<br>• 공개 AST / 타입 / 인터페이스 시그니처 (Public Surface)<br>• 사전/사후 조건 및 엄격 불변식 (Invariants)<br>• **1:1 바인딩된 단일 타겟 테스트 파일 경로** |
| **Tier 2 (구조적 축약)** | **Diff & Summary** | • 전체 소스 코드 $ightarrow$ **인터페이스 선언 + Diff 변경 패치**<br>• 수십 턴의 시행착오 $ightarrow$ **단일 원인 진단 및 결정 요약 (Decision Summary)**<br>• 장황한 테스트 로그 $ightarrow$ **통과/실패 매트릭스 증거 테이블** |
| **Tier 3 (완전 배제)** | **Zero Discard** | • 일시적 디버깅 생각, 단발성 프롬프트 대화 흔적<br>• 수정 금지(Out-of-bounds) 파일의 내부 구현 코드<br>• 이미 해결된 중간 깨진 스택 트레이스 로그<br>• 패키지 매니저의 lockfile 및 거대 의존성 트리 덤프 |

### 3.3 수직 스펙(Vertical Spec) CLI 명령어
```bash
# 1. 수직 스펙 JSON 스켈레톤 초기화
skills-platform spec init   --id topic:auth/jwt_cache   --name "Fix JWT Signature Cache Drift"   --test packages/auth/test/jwt.test.js   --out ./VERTICAL_SPEC.json

# 2. 수직 스펙 무결성 검증
skills-platform spec validate ./VERTICAL_SPEC.json

# 3. 표준 GitHub Flavored Markdown으로 렌더링
skills-platform spec render ./VERTICAL_SPEC.json --out ./VERTICAL_SPEC.md
```

---

## 4. 🛡️ 5대 보안/거버넌스 가드 훅 및 쇼트서킷 관리

Skills Platform은 의존성 없는 극초고속 Node.js 가드 훅을 통해 AI 에이전트의 위험 행위를 **실시간 쇼트서킷 차단**합니다.

```text
[ 에이전트 도구 호출 (PreToolUse) ]
         │
         ▼
[ P:5 Secret Guard ] ────── (유출 감지) ──➔ [ 🛑 즉시 중단 & 마스킹 가이드 반환 ]
         │ (통과)
         ▼
[ P:10 Destructive Blocker ] (파괴 명령) ──➔ [ 🛑 즉시 중단 & 안전 경로 가이드 ]
         │ (통과)
         ▼
[ P:15 Context Budget Guard ] (80k 초과) ──➔ [ 🛑 즉시 중단 & 단위 분할 경고 ]
         │ (통과)
         ▼
[ 🚀 안전한 도구 실행 ] ──➔ [ PostToolUse: Telemetry 수집 & Scope Drift 검사 ]
```

### 4.1 5대 가드 훅 명세

| 훅 ID | 이벤트 | 우선순위 | 차단 대상 및 정책 |
| :--- | :--- | :---: | :--- |
| `secret-leak-guard` | `pre_tool_use` | `5` | AWS, OpenAI(`sk-...`), Claude, GitHub(`ghp_...`), Google(`AIza...`), Private Key, Bearer Token 유출 시 **도구 실행 즉시 차단** |
| `destructive-command-blocker` | `pre_tool_use` | `10` | `rm -rf /`, PowerShell `Remove-Item -Recurse -Force`, `del /s /q`, `DROP TABLE`, 디스크 포맷 등 **파괴 명령어 차단** |
| `context-budget-guard` | `pre_tool_use` | `15` | 80k 토큰 밀도(~320KB) 초과 거대 파일 생성 및 메모리 오염 차단 |
| `scope-boundary-enforcer` | `post_tool_use` | `20` | `VerticalTopicSpec.owned_files` 외의 파일 무단 수정 감지 시 드리프트 경고 등록 |
| `subagent-recursion-limiter` | `pre_tool_use` | `25` | 서브에이전트 재귀 호출 깊이(Depth > 3) 및 동시 실행 수(> 4) 제한 |

### 4.2 훅 CLI 관리 명령어
```bash
# 전체 등록 훅 목록 및 활성화 상태 조회
skills-platform hook list

# 특정 훅 활성화 / 비활성화
skills-platform hook enable --id secret-leak-guard
skills-platform hook disable --id subagent-recursion-limiter

# 훅 이벤트 실행 시뮬레이션 테스트
skills-platform hook test --event on_test_run

# 프로바이더 설정 파일 자동 동기화 (.agents/hooks.json, .claude/hooks.json)
skills-platform hook sync
```

---

## 5. 📦 레시피-훅 통합 패키징 및 원격 배포

레시피 JSON(`recipe.json`) 안에 스킬, 소스, 프리셋뿐만 아니라 **필요한 가드 훅 목록(`hooks`)을 일체형으로 선언**할 수 있습니다.

### 5.1 레시피 구조 예시 (`recipe.json`)
```json
{
  "name": "backend-secure-tdd-recipe",
  "version": "1.0.0",
  "description": "보안 가드와 핀포인트 TDD 스킬이 결합된 백엔드 개발 레시피",
  "sources": [],
  "skills": [],
  "presets": [],
  "hooks": [
    {
      "id": "secret-leak-guard",
      "name": "Secret Leak Guard",
      "event": "pre_tool_use",
      "enabled": true,
      "matcher": "run_command|write_to_file",
      "handler": {
        "type": "script",
        "target": ".skills-platform/hooks/guards/secret-leak-guard.js",
        "timeout_ms": 5000
      },
      "priority": 5
    }
  ]
}
```

### 5.2 레시피 적용
```bash
# 레시피를 적용하면 포함된 훅들이 타겟 프로젝트의 매니페스트 및 .agents/hooks.json에 자동 바인딩됨
skills-platform recipe apply ./backend-secure-tdd-recipe.json --project ./my-backend
```

---

## 6. 🖥️ Web UI Flow Studio & Governance Studio 활용법

브라우저에서 `http://localhost:5173`에 접속하여 좌측 사이드바의 탭을 통해 직관적인 관측을 수행합니다.

### 6.1 Hook & Governance Studio (`/governance`)
* **실시간 ON/OFF 토글**: 스위치 클릭 한 번으로 가드 훅을 즉시 활성화/비활성화.
* **실시간 보안 위반 피드**: 차단된 API 키 유출, 치명적 명령어, 스코프 드리프트 내역을 타임라인 카드로 모니터링.
* **1-Click 훅 시뮬레이터**: 공격 페이로드 프리셋(API Key 유출, `rm -rf`, Test Storm)을 주입하여 200ms 이내에 차단 결과와 진단 메시지 검증.

### 6.2 Flow Studio Canvas (`/flow`)
* 🔄 **3-Phase Lifecycle Diagram**: 기획 $ightarrow$ Scoped Inner Loop $ightarrow$ 릴리즈 게이트 상태 머신 및 현재 실행 중인 태스크 실시간 펄스 확인.
* ⚡ **Hook Pipeline Graph**: 우선순위 기반 Pre-Tool 평가 체인과 위반 시 Red Halt 노드로 분기되는 패킷 애니메이션 관측.
* 🧬 **Fractal Context Tree**: $L_0 ightarrow L_1 ightarrow L_2$ 계층 드릴다운 및 태스크 완료 시 상위로 역류하는 Roll-Up 시각 효과.
* 🔗 **Junction Delivery Map**: 프로바이더별 심볼릭 링크 전달 경로 및 드리프트 상태 확인.
* 🔍 **Node Detail Inspector**: 캔버스의 노드를 클릭하면 우측 드로어에서 세부 스펙, 테스트 명령어, 차단 사유, Diff 패치 즉시 확인.
* ⏯️ **Flow Playback Controller**: 타임라인 스크러버를 움직여 과거 작업 루프의 상태 전이를 단계별로 복기(Replay).

---

## 7. 🛠️ CLI 전체 명령어 레퍼런스

```bash
# 1. 훅 관리
skills-platform hook list                       # 전체 훅 목록 조회
skills-platform hook enable --id <hook_id>      # 훅 활성화
skills-platform hook disable --id <hook_id>     # 훅 비활성화
skills-platform hook remove --id <hook_id>      # 훅 삭제
skills-platform hook sync                       # 프로바이더 네이티브 설정 동기화
skills-platform hook test --event <event_name>  # 훅 이벤트 실행 테스트

# 2. 수직 스펙 관리
skills-platform spec init --id <id> --name <name> --test <test_path> --out <path>
skills-platform spec validate <spec_json_path>
skills-platform spec render <spec_json_path> --out <markdown_path>

# 3. 3단계 자율 루프 러너
skills-platform loop run --prd <prd_path> --project <proj_path> --provider <provider>

# 4. 레시피 및 카탈로그
skills-platform recipe list                     # 로컬 레시피 목록
skills-platform recipe apply <recipe_json>      # 레시피 적용 및 훅 자동 바인딩
skills-platform catalog inspect                 # 전체 스킬 및 드리프트 진단
```
