# 훅과 가드 관리 가이드 (Hooks & Guards Management)

Skills Platform의 훅(Hook) 및 가드(Guard) 시스템은 Google Antigravity, OpenAI Codex, Anthropic Claude 전반에서 에이전트의 도구 호출을 가로채고 보안 및 거버넌스를 보장한다.

---

## 1. 훅 구조: 유니버설 베이스라인 vs 컴패니언 훅

| 구분 | 위치 | 목적 | 동작 방식 |
| :--- | :--- | :--- | :--- |
| **유니버설 보안 베이스라인** | `.skills-platform/hooks/manifest.json` | 모든 작업에 필수적인 시스템 보안 보장 | 프로젝트 초기화 시 자동 활성화 (`secret-leak-guard`, `destructive-command-blocker`, `context-budget-guard`, `subagent-recursion-limiter`, `scope-boundary-enforcer`, `telemetry-collector`) |
| **컴패니언 훅 (Companion Hook)** | `skills-packages/<group>/<skill>/hooks.json` | 특정 스킬의 도메인 안전 규칙 제어 (예: TDD 중 테스트 폭풍 차단) | 스킬 링크 시 자동 탐색·등록되고, 스킬 비활성화/제거 시 원자적으로 연쇄 비활성화 |

---

## 2. CLI 기본 조작 (`bin/sp-hooks` 또는 `npm run sp-hooks`)

### 2.1 훅 상태 및 계통 확인
```bash
# 1. 소유 스킬별로 그룹화하여 목록 조회 (추천)
./bin/sp-hooks list --by-skill

# 2. 특정 스킬에 바인딩된 훅만 필터링
./bin/sp-hooks list --skill scoped-tdd-executor

# 3. 터미널 테이블 형태로 서식화하여 출력
./bin/sp-hooks list --table

# 4. JSON 원시 데이터 조회 (자동화 스크립트용)
./bin/sp-hooks list --json
```

### 2.2 원자적 연쇄 토글 (Cascade Toggles)
```bash
# 특정 스킬의 모든 컴패니언 훅을 원자적으로 끄기/켜기
./bin/sp-hooks disable --skill scoped-tdd-executor
./bin/sp-hooks enable --skill scoped-tdd-executor

# 안전 모드 긴급 토글 (프로젝트 내 전체 훅 일괄 해제/재활성화)
./bin/sp-hooks disable --all
./bin/sp-hooks enable --all

# 단일 훅 토글
./bin/sp-hooks disable secret-leak-guard
./bin/sp-hooks enable secret-leak-guard
```

### 2.3 무결성 및 공급자 동기화 진단 (`audit`)
```bash
# 핸들러 스크립트 존재 여부, POSIX 실행 권한, 공급자 동기화([synced]) 검증
./bin/sp-hooks audit
```
- `HEALTHY (0 issues)` 및 `Providers: Antigravity [synced], Codex [synced]` 출력을 확인한다.
- 고아 훅(부모 스킬이 삭제되었는데 남아있는 훅)이나 드리프트가 감지되면 즉시 리포트된다.

---

## 3. 컴패니언 훅 작성 및 스킬 패키징 수칙

스킬 패키지에 컴패니언 훅을 내장할 때는 다음 규칙을 준수한다:

1. **디렉터리 구조**:
   ```
   skills-packages/<category>/<skill-name>/
   ├── SKILL.md
   ├── hooks.json              # 컴패니언 훅 선언부
   └── scripts/
       └── my-guard.js         # 실행 핸들러 (chmod 0755 필수)
   ```
2. **`hooks.json` 선언 예시**:
   ```json
   {
     "hooks": [
       {
         "id": "my-domain-guard",
         "name": "My Domain Guard",
         "description": "특정 작업 범위를 검증하는 컴패니언 가드",
         "event": "pre_tool_use",
         "associated_skill": "my-skill-name",
         "failure_policy": "closed",
         "handler": {
           "type": "command",
           "command": "node ./scripts/my-guard.js"
         },
         "matcher": "run_command",
         "priority": 20,
         "enabled": true
       }
     ]
   }
   ```
3. **자동 경로 리베이스**:
   `skills-catalog project link` 또는 `linkProjectSkill` 실행 시 `./scripts/my-guard.js` 상대 경로가 대상 프로젝트의 절대 경로로 자동 재계산되어 등록된다.

---

## 4. Google Antigravity Strict Protojson 수칙 (필독)

Antigravity는 C++ Protobuf JSON 언마샬러를 사용하므로 스키마에 정의되지 않은 최상위 필드가 출력되면 즉시 충돌(`unknown field`)한다.

### 4.1 허용 필드 및 거부 처리
- **`PreToolUse` 허용 최상위 키**: `decision`, `reason`, `overwrite`, `permissionOverrides`
- **절대 출력 금지 키**: `allow`, `status`, `self_correct_hint`, `violation_type`, `output`
- **차단 시 출력**:
  ```json
  { "decision": "deny", "reason": "위반 사유 설명. 수정 힌트 내용." }
  ```
- **허용 시 출력**:
  ```json
  { "decision": "allow" }
  ```
- **수정 힌트 병합**: `self_correct_hint`나 보조 안내는 반드시 `reason` 문자열 내에 포함하여 반환한다 (`[reason, hint].filter(Boolean).join(" ")`).

### 4.2 입력 페이로드 처리 탄력성
- stdin은 즉시 EOF가 오지 않고 스트리밍 지연(최대 3000ms)이 발생할 수 있으므로 청크를 완전히 버퍼링한 뒤 파싱한다.
- `toolCall.args`가 객체일 수도 있고 문자열화된 JSON(`JSON.parse`)일 수도 있으므로 방어적으로 처리한다.

---

## 5. 장애 진단 및 복구 체크리스트

| 증상 | 원인 | 조치 방법 |
| :--- | :--- | :--- |
| `sp-hooks audit`에서 `[drift]` 발생 | `.agents/hooks.json`이 매니페스트와 불일치 | `node apps/skills-catalog/src/cli.js hook sync` 실행 |
| Antigravity에서 `unknown field "allow"` 에러 | 가드 스크립트가 legacy 필드를 stdout에 출력함 | 핸들러의 출력 포맷을 `formatGuardStdout` 패턴으로 교체 |
| `missing_handler` 에러 | 스크립트 파일이 없거나 실행 권한 부재 | 경로 확인 및 `chmod +x <script-path>` 실행 |
| `orphaned_companion_hook` 경고 | 훅의 소유 스킬이 프로젝트에서 제거됨 | `./bin/sp-hooks disable --skill <id>` 또는 매니페스트 정리 |
