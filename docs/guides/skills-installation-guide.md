# Skills Platform 공식 설치 가이드북

이 문서는 Skills Platform 사용자가 스킬을 찾고, 설치 범위를 정하고, 설치 결과를 확인하고, 업데이트·제거하는 공통 절차를 정의한다. Vercel의 `skills` CLI와 Skills Platform Catalog는 서로 다른 상태와 설치 이력을 관리한다. **대상 프로젝트의 같은 스킬 경로는 한 관리 도구가 소유하도록 한다.**

확인 기준은 **2026-09-08**, npm 배포본 **`skills@1.5.24`**의 `--help`와 실행 코드, [Vercel 공식 저장소](https://github.com/vercel-labs/skills), 이 저장소의 Catalog CLI 구현이다. 예시는 재검증할 수 있도록 CLI 버전을 고정했다. `npx skills@1.5.24`의 버전은 **설치 도구 버전**이며 설치할 스킬 콘텐츠의 버전 고정은 별도다. 이것은 Skills Platform의 운영 가이드이며 Vercel의 공식 문서를 대신하지 않는다.

## 1. 목적에 맞는 설치 경로 선택

| 목적 | 사용할 경로 | 생성·변경되는 상태 |
| --- | --- | --- |
| 외부 스킬을 특정 프로젝트에서 바로 사용 | `npx skills@1.5.24 add` | 에이전트 설치 경로, CLI lock 파일 |
| 팀의 출처·리비전·검토·프리셋·프로젝트 적용을 함께 관리 | Catalog 등록 → 검토 → 선택 → preview → apply | Registry, Catalog 정책, adapter 소유권 기록, 적용 이력 |
| 자체 스킬을 advisory 정책의 개발 프로젝트에 바로 연결 | 고급 `project link` 경로 | 원본 또는 instance를 가리키는 직접 링크 |
| 영구 설치 없이 한 스킬의 지침 확인 | `npx skills@1.5.24 use <source> --skill <name>` | 임시 디렉터리와 생성된 프롬프트 |

`npx skills add` 성공은 Catalog 등록·검토·프리셋 배정을 의미하지 않는다. `import-local` 또는 `import-git` 성공도 에이전트 설치를 의미하지 않는다. 플랫폼에서 계속 관리할 스킬은 Catalog 경로로 시작한다. 직접 설치한 스킬을 플랫폼 관리로 전환할 때는 원래 source와 변경분을 먼저 기록하고, 기존 설치 도구로 해당 설치를 정리한 다음 Catalog preview에서 충돌이 없는지 확인한다.

`project link`는 `--confirm` 없이 즉시 파일 시스템을 변경한다. 현재 구현은 기존 symlink를 소유권 검사 없이 교체할 수 있고, 디렉터리는 sidecar 존재를 기준으로 교체할 수 있다. 승인 필수(`require_approved`) 프로젝트는 이 직접 링크 경로를 거절한다. 일반 설치는 `history record-plan`으로 계획을 저장하고 같은 `plan_id`를 preview·apply하는 절차를 기본으로 한다. 직접 개발 링크의 조건은 [참조와 전달 가이드](./skill-reference-and-delivery-guide.md)를 따른다.

## 2. 환경과 설치 범위 확인

```bash
node --version
npm --version
git --version
npm view skills version engines --json
npx skills@1.5.24 --version
npx skills@1.5.24 --help
```

`skills@1.5.24`는 **Node.js 22.20.0 이상**이 필요하다. Skills Platform 자체의 최소 요구사항은 `package.json` 기준 Node.js 20.19 이상이므로 두 도구를 같이 쓸 때는 더 높은 요구사항을 충족해야 한다. `npx` 실행에는 npm 패키지 취득이, Git source 설치에는 저장소 접근과 Git 인증이 필요하다. 플랫폼 체크아웃 준비는 [README의 시작하기](../../README.md#시작하기)을 따른다. 근거: [upstream package.json](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/package.json).

직접 설치 명령은 **설치 대상 프로젝트 루트에서 실행**한다. `add`의 기본 범위는 프로젝트이고, 사용자 전체 범위가 필요할 때만 `--global`을 붙인다. `--agent codex`처럼 대상을 지정하고 `--skill`에는 source 목록에 표시된 실제 `name`을 사용한다. 자동 감지된 에이전트나 비대화형 환경이 선택을 대신할 수 있으므로 자동화에서도 두 값을 명시한다. 근거: [upstream 설치 안내](https://github.com/vercel-labs/skills#install-a-skill).

### 설치 도구의 경로와 에이전트의 검색 경로

아래는 환경변수로 홈을 변경하지 않은 기본 경로다. CLI가 파일을 배치하는 경로와 호스트 공식 문서의 검색 경로를 구분한다.

| 대상 | 프로젝트 경로 | upstream README/agent 설정의 global 경로 | 1.5.24 installer가 계산하는 global 경로 | 호스트 공식 문서 / Catalog global 기본값 |
| --- | --- | --- | --- | --- |
| Codex (`codex`) | `.agents/skills/` | `~/.codex/skills/` | `~/.agents/skills/` | `~/.agents/skills/` |
| Antigravity (`antigravity`) | `.agents/skills/` | `~/.gemini/antigravity/skills/` | `~/.agents/skills/` | `~/.gemini/config/skills/` |

1.5.24 installer는 프로젝트 경로가 `.agents/skills`인 대상을 universal agent로 판별하고, 개별 global 설정보다 canonical 경로를 우선한다. Codex 설정에 선언된 `CODEX_HOME`도 이 universal 설치 분기를 바꾸지 않는다. 위 계산은 배포 source 기준이며 실제 설치를 수행한 실측은 아니다. 설치 결과와 호스트 인식을 확인한다. Antigravity global 설치는 호스트 문서와 다르므로 Catalog 전달 또는 프로젝트 설치를 우선한다. 같은 이름을 여러 경로에 중복 설치해서 해결하지 않는다. 근거: [agents.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/agents.ts), [installer.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/installer.ts), [Codex 문서](https://learn.chatgpt.com/docs/build-skills), [Antigravity 문서](https://antigravity.google/docs/skills), [Catalog 구현](../../apps/skills-catalog/src/catalog-state.js).

## 3. 직접 설치: 찾기 → 목록 → 선택 → 설치 → 확인

### 찾기와 source 확인

```bash
# 검색 결과를 확인한다. 저장소에 포함된 스킬 이름은 다음 명령으로 확인한다.
npx skills@1.5.24 find typescript
npx skills@1.5.24 find react --owner vercel
npx skills@1.5.24 add vercel-labs/agent-skills --list
```

검색은 발견 단계다. 설치 전에 source의 `SKILL.md`, 지원 파일, 필요한 도구와 인증, 라이선스를 확인한다. 설치 목록의 이름이 폴더명과 다를 수 있으므로 검색 결과에서 이름을 추측하지 않는다. 근거: [upstream find.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/find.ts), [발견 규칙](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/skills.ts).

### 선택한 프로젝트에 설치

아래 `web-design-guidelines`는 먼저 `--list`에서 현재 제공되는지 확인한다.

```bash
# 프로젝트 범위, Codex, 스킬 하나
npx skills@1.5.24 add vercel-labs/agent-skills \
  --skill web-design-guidelines --agent codex

# Antigravity 프로젝트를 대상으로 선택할 경우
npx skills@1.5.24 add vercel-labs/agent-skills \
  --skill web-design-guidelines --agent antigravity

# 사용자 전체 설치를 선택한 경우에만 global을 명시한다.
npx skills@1.5.24 add vercel-labs/agent-skills \
  --skill web-design-guidelines --agent codex --global
```

각 예시는 서로 다른 선택지다. Codex와 Antigravity의 프로젝트 경로는 공유되므로 같은 프로젝트에서 각각 실행하면 완전히 독립적인 사본이 생기는 것으로 간주하지 않는다. 대상과 변경 범위를 이미 확정한 자동화에서는 `--yes`를 추가할 수 있다. `--all`은 **모든 스킬·모든 에이전트·확인 생략**을 함께 선택하므로 기본 설치 예시로 사용하지 않는다. 근거: [upstream add.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/add.ts).

### symlink와 copy의 차이

기본 symlink 방식은 source를 CLI의 canonical 설치본에 복사하고, 필요한 에이전트 경로에서 그 설치본으로 연결한다. 일반적인 canonical 경로는 프로젝트 `.agents/skills/`, global `~/.agents/skills/`다. 에이전트 경로가 canonical과 같으면 별도 링크가 필요하지 않다. **로컬 source를 `add`했다고 원래 `skills-packages/`로 직접 연결되는 것은 아니다.**

독립 복사본이 필요한 경우 설치 명령에 `--copy`를 붙인다. symlink 실패 시 복사로 대체될 수 있으므로 출력 결과와 실제 경로를 확인한다. 복사본의 수정은 source로 역전파되지 않는다. 반면 플랫폼의 `project link --latest`는 원본을 직접 가리키므로 링크를 통한 편집이 원본을 수정한다. 근거: [upstream installer.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/installer.ts).

### 설치 확인과 사용

```bash
# 현재 프로젝트
npx skills@1.5.24 list --agent codex
npx skills@1.5.24 list --agent codex --json

# 사용자 전체 범위는 별도로 확인
npx skills@1.5.24 list --global --agent codex
```

`list`는 디스크에서 발견한 설치를 보여주며 Catalog 소유권 검증이나 호스트의 실제 활성화 증명은 아니다. `--json`의 `path`, `scope`, `source`를 점검하고 실제 `SKILL.md`와 링크 대상을 확인한다. 에이전트에서 스킬 이름을 선택하거나 명시적으로 호출해 짧은 대표 작업을 수행한다. 인식되지 않으면 호스트의 새 세션·재검색 절차를 따른다. 파일 저장만으로 기존 대화가 자동으로 지침을 다시 읽는다고 가정하지 않는다. 근거: [upstream list.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/list.ts).

## 4. source 형식과 이 저장소의 중첩 패키지

CLI는 GitHub `owner/repo`, 전체 GitHub/GitLab URL, Git URL, 로컬 경로를 받는다. 특정 GitHub 하위 폴더는 `https://github.com/OWNER/REPO/tree/REF/PATH` 형태로 지정할 수 있다. 브랜치·태그를 선택할 수 있지만 움직이는 ref는 콘텐츠 고정이 아니다. 엄밀한 재현이 필요하면 확인한 commit checkout 또는 플랫폼 immutable revision을 사용한다. 근거: [upstream source-parser.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/source-parser.ts).

Skills Platform의 canonical 패키지는 `skills-packages/<group>/<name>/`에 중첩되어 있으며, 저장소에는 같은 `name`의 source·사본·instance가 함께 존재할 수 있다. 저장소 루트 전체 설치보다 **정확한 패키지 경로**를 사용한다. `--full-depth`는 탐색 확대 옵션이며 중복 이름의 출처 선택 문제를 해결하지 않는다. 근거: [upstream 발견 구현](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/skills.ts).

처음 사용하는 프로젝트에는 자체 운영 스킬 `skills-platform-guide`로 플랫폼의 공통 흐름을 안내할 수 있다. 다음은 대상 프로젝트에서, Skills Platform 체크아웃의 절대 경로를 대입하는 예시다.

```bash
npx skills@1.5.24 add \
  /path/to/Skills-Platform/skills-packages/platform-core/skills-platform-guide \
  --list

npx skills@1.5.24 add \
  /path/to/Skills-Platform/skills-packages/platform-core/skills-platform-guide \
  --skill skills-platform-guide --agent codex
```

설치 후 `$skills-platform-guide`를 명시해 설치 방식 선택과 결과 확인을 요청한다. 스킬 작성·검토 규칙은 `skill-authoring-standard`가 담당한다. 이 저장소 자체의 운영·저작 환경을 재구성할 때는 개별 `add` 대신 [프로젝트 패키지 관리 가이드](./project-skill-package-management.md)의 recipe를 따른다. 같은 이름의 bundled system 스킬, 개인 스킬, 플랫폼 스킬이 겹치면 우선순위를 추측하지 말고 어떤 사본을 사용할지 먼저 정한다.

### 사설 저장소

공개 저장소와 같은 `add` 명령을 사용하되 조직에서 설정한 Git credential helper 또는 SSH 인증을 사용한다.

```bash
npx skills@1.5.24 add git@github.com:YOUR_ORG/private-skills.git --list
npx skills@1.5.24 add git@github.com:YOUR_ORG/private-skills.git \
  --skill YOUR_SKILL_NAME --agent codex
```

인증 실패 시 같은 URL에 대한 `git ls-remote`로 저장소 접근을 확인한다. GitHub HTTPS/shorthand는 Git 인증 후 인증된 GitHub CLI, SSH fallback을 지원한다. `GITHUB_TOKEN`/`GH_TOKEN`은 명시적으로 구성한 경우 GitHub API 접근에 사용되며 모든 설치에 필수는 아니다. 토큰을 source URL, 문서, 명령 인자에 넣지 않는다. 근거: [upstream git.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/git.ts), [skill-lock.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/skill-lock.ts).

## 5. Catalog로 공식 관리하기

아래는 **Skills Platform 저장소 루트**에서 실행한다. `demo-codex`는 새 프로젝트 ID 예시이며 기존 프로젝트는 `project list`로 찾아 재사용한다. `SOURCE_REVISION_ID`, `REGISTRY_SKILL_ID`, `LINEAGE_ID`, `PLAN_ID`, `MANAGER_PROJECT_ID`는 실제 출력값으로 바꾼다. 스킬 이름과 이 ID들은 서로 다르다.

### UI와 Skills Manager inspector 준비

아래 Catalog CLI의 `history apply`와 `project apply`는 reference adapter를 사용한다. UI의 **Apply through Skills Manager CLI**와 실시간 binding 조회는 별도 inspector를 사용한다. bridge는 기본적으로 `apps/skills-manager/src-tauri/target/debug/skills-manager-inspect`(Windows는 `.exe`)를 찾고, 없으면 submodule에서 `npm run inspect`로 Cargo를 실행한다. 루트의 `npm run build:packages`가 이 Rust 바이너리를 빌드하지는 않는다.

Rust/Cargo와 해당 OS의 빌드 의존성을 갖춘 뒤 inspector만 미리 빌드할 수 있다.

```bash
git submodule update --init --recursive
cargo build --manifest-path apps/skills-manager/src-tauri/Cargo.toml \
  --bin skills-manager-inspect
```

다른 checkout/바이너리를 사용하는 운영 환경은 bridge 프로세스에 `SKILLS_MANAGER_DIR`(manager root), `SKILLS_MANAGER_INSPECT_PATH`(존재하는 실행 파일 경로)를 설정한다. 초기 빌드는 bridge 호출의 45초 제한을 넘을 수 있으므로 미리 완료한다. OS 준비·검증은 [macOS·control-plane 가이드](./macos-and-control-plane-guide.md)를 따른다. 근거: [inspector bridge 구현](../../apps/skills-catalog/src/upstream-inspector.js), [Skills Manager 실행 스크립트](../../apps/skills-manager/package.json).

바이너리 준비와 Manager 설정 초기화도 별개다. inspector 조회는 누락된 `config.json`을 만들지 않는다. UI 경로를 사용할 새 환경은 아래의 Catalog 프로젝트 등록을 먼저 마친 뒤 Manager에 프로젝트를 등록하고 반환된 Manager ID를 연결한다. Catalog 프로젝트를 중복 등록할 필요는 없다.

```bash
apps/skills-manager/src-tauri/target/debug/skills-manager-inspect \
  project preview --path /path/to/target-project --json
apps/skills-manager/src-tauri/target/debug/skills-manager-inspect \
  project add --path /path/to/target-project --json
node apps/skills-catalog/src/cli.js project bind-manager demo-codex \
  --upstream-project-id MANAGER_PROJECT_ID
```

`project add`는 Manager 설정을 변경하며, `bind-manager`는 Catalog의 연결 ID만 변경한다. 이 연결은 스킬 채택·설치를 수행하거나 Manager에 그 ID가 존재함을 검증하지 않는다. UI 적용에는 계획의 digest와 일치하는 Manager 스킬 instance도 필요하다. **2026-09-08의 현재 Skills Platform 로컬 설정은 inspector 사용 준비가 되어 있고 `skills-platform-codex`가 `workspace-4844cf93282d94de`에 연결되어 있다.** 이 ID를 다른 PC에 복사하지 말고 해당 환경의 결과를 사용한다.

### 등록과 검토

```bash
# 로컬 source를 읽기 전용으로 검사
node apps/skills-catalog/src/cli.js source inspect /path/to/skill
node apps/skills-catalog/src/cli.js skill validate /path/to/skill --provider codex

# Registry에 immutable revision 생성: 아래 두 방식 중 source에 맞게 하나 선택
node apps/skills-catalog/src/cli.js import-local /path/to/skill
node apps/skills-catalog/src/cli.js import-git https://github.com/OWNER/REPO.git \
  --ref COMMIT_OR_REF --skill ACTUAL_SKILL_NAME

node apps/skills-catalog/src/cli.js skill list
node apps/skills-catalog/src/cli.js skill revisions LINEAGE_ID

# 해당 revision을 실제로 검토한 뒤 결과를 기록
node apps/skills-catalog/src/cli.js source review approve SOURCE_REVISION_ID \
  --summary "Reviewed source, provider compatibility, dependencies, and intended use."
```

검토에서 문제를 발견하면 `reject`를 기록하고 source를 고쳐 새 revision을 등록한다. `import-git`은 Git repository locator를 사용한다. Vercel CLI의 GitHub `tree/...` URL, `--agent`, `--global`을 Catalog import 옵션으로 옮겨 쓰지 않는다. `import-local`/`import-git`은 Registry를 쓰고, review는 Catalog를 쓴다. 실행 위치가 달라지면 `--registry /absolute/registry`와 `--catalog /absolute/catalog`를 관련 명령마다 명시한다.

### 프로젝트 정책과 선택

```bash
node apps/skills-catalog/src/cli.js project list
node apps/skills-catalog/src/cli.js project add demo-codex \
  --name "Demo Codex" --path /path/to/target-project --provider codex \
  --review-policy require_approved

node apps/skills-catalog/src/cli.js preset create demo-skill-set \
  --name "Demo Skill Set" --skill REGISTRY_SKILL_ID
node apps/skills-catalog/src/cli.js preset assign demo-codex demo-skill-set
node apps/skills-catalog/src/cli.js project resolve demo-codex
```

일반 프로젝트와 기존 Catalog의 기본 정책은 이전 호환을 위한 `advisory`다. 승인 필수 운영은 위와 같이 명시하거나 기존 프로젝트에 아래 명령을 사용한다. 현재 이 저장소의 `skills-platform-codex`는 `require_approved`다.

```bash
node apps/skills-catalog/src/cli.js project set-policy demo-codex \
  --review-policy require_approved
```

`require_approved`에서는 enabled 작업이 가리키는 **정확한 불변 source revision의 최신 review decision이 `approved`**여야 계획 생성과 적용을 진행한다. profile의 `review_state: reviewed`나 preset의 `lifecycle: reviewed`는 이 승인을 대신하지 않는다. 선택된 preset 또는 skill profile이 `deprecated`이면 활성화를 차단한다. disabled 작업만 있는 계획은 승인·폐기 상태 때문에 막지 않으므로 거절된 스킬도 비활성화할 수 있다. strict 프로젝트의 `project link`는 사용할 수 없다.

작업 조건을 여러 개 선택할 때는 계획 생성 명령에 `--work-scope integration --work-scope audit`처럼 옵션을 반복한다. overlay의 태그가 모두 요청 태그에 포함되어야 적용된다. Manager의 store v3도 명시적 `work_scope_tags` 배열로 같은 AND 조건을 지원한다. legacy `work_scope: "integration,audit"`는 쉼표를 포함한 **단일 태그**다. 배열의 우선순위와 빈 배열의 의미는 [패키지 관리 가이드](./project-skill-package-management.md#work-scope-matching)를 따른다.

### 계획 저장과 같은 계획의 적용

```bash
PLAN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/skills-platform-plan.XXXXXX")"
node apps/skills-catalog/src/cli.js history record-plan demo-codex \
  --enabled-only --out "$PLAN_DIR/activation-plan.json"

# 출력의 plan_id를 PLAN_ID 자리에 사용한다.
node apps/skills-catalog/src/cli.js history apply PLAN_ID
```

`history record-plan`은 Catalog에 계획과 선택된 preset 배정을 저장하고 `--out`에 같은 plan JSON을 내보낸다. `history apply`에서 `--confirm`을 생략하면 저장된 계획의 adapter preview를 반환한다. revision, digest, delivery root, 충돌·차단·덮어쓰기 대상과 활성/비활성 항목을 확인한다. 첫 설치의 `--enabled-only`는 enabled 작업만 만든다. 전체 조정은 이 옵션을 생략해 비선택 스킬의 disabled 작업도 포함하는 별도 계획을 저장한다.

**import, review, preset, project 등록과 계획 저장은 각각 Registry 또는 Catalog를 변경한다.** `recipe apply`도 `--confirm` 없이 Registry/Catalog를 갱신하고 스킬 전달만 preview한다. hooks가 선언된 recipe는 hook 등록과 provider config 동기화도 수행한다. strict 프로젝트에서 새 revision이 미승인이면 metadata 저장 뒤 계획 생성이 차단될 수 있다. [패키지 관리 가이드](./project-skill-package-management.md)의 import → 검토 → 프로젝트 재구성 순서를 따른다.

### 공유 경로의 영향 확인

Manager preview는 직접 변경할 provider root와 알려진 symlink 소비 경로의 간접 영향을 함께 보여준다. `impacts`에서 provider, 각 root, 공유 사유를 확인한다. optional `target_root`는 직접 변경할 root를 가리키므로 다른 프로젝트의 간접 소비 경로와 혼동하지 않는다. 이 목록은 Manager가 알고 있는 provider·프로젝트·링크 범위이며 디스크 전체 의존성을 증명하지는 않는다. 공유 경로가 **실제로 변경될 때** 확인이 필요하며, 이미 원하는 상태여서 변경이 없는 경우에는 공유 확인을 다시 요구하지 않는다.

UI에서는 **Delivery impacts**를 확인하고 checkbox를 선택한 뒤 **Preview with shared confirmation**으로 새 preview를 만든다. 새 계획에만 `distribution.shared_root_confirmation: true`가 기록되며 기존 계획은 유지된다. 확인 선택, 프로젝트, scope, 정책이 바뀌면 기존 계획으로 적용할 수 없고, 영향 목록이 바뀌어도 다시 검토한 preview가 필요하다.

CLI에서 공유 변경을 검토한 경우에도 새 계획을 만든다. 처음 계획에 쓴 `--preset`, `--work-scope`, `--copy`, `--enabled-only` 선택을 새 계획에 동일하게 유지한다. 아래는 enabled 작업만 계획한 경우다.

```bash
node apps/skills-catalog/src/cli.js history record-plan demo-codex \
  --enabled-only --confirm-shared-root --out "$PLAN_DIR/shared-plan.json"
node apps/skills-catalog/src/cli.js history apply SHARED_PLAN_ID
node apps/skills-catalog/src/cli.js history apply SHARED_PLAN_ID --confirm
```

`SHARED_PLAN_ID`는 새 출력의 ID다. `history apply PLAN_ID --confirm-shared-root`는 저장된 계획을 변경하려는 사용이므로 거절된다. `--confirm-shared-root`는 계획의 공유 영향 확인이고 `--confirm`은 그 계획의 실행이다. Catalog CLI의 reference preview와 UI의 Manager preflight는 별도 경로다. Manager bridge는 저장된 확인과 현재 preview를 검사한 뒤 필요한 변경에 Manager의 `--confirm-shared`를 전달한다. 근거: [CLI와 계획 계약](../../apps/skills-catalog/src/cli.js), [Manager bridge](../../apps/skills-catalog/src/upstream-apply.js), [Manager 영향 계산](../../apps/skills-manager/src-tauri/src/services/provider_inventory.rs).

### 적용과 결과 확인

```bash
node apps/skills-catalog/src/cli.js history apply PLAN_ID --confirm
node apps/skills-catalog/src/cli.js history apply PLAN_ID
node apps/skills-catalog/src/cli.js project status demo-codex
node apps/skills-catalog/src/cli.js history list --project-id demo-codex
```

복사가 필요하면 **계획 저장 시 `--copy`**를 지정한다. 적용은 저장한 계획을 그대로 사용하며, 계획 무결성과 현재 Catalog 정책을 확인하고 각 전달 작업 직전에도 승인 상태를 재검사한다. 저장 이후 preset 선택이 바뀌어도 현재 선택으로 계획을 다시 만들지는 않는다. 새 선택을 전달하려면 새 계획을 저장한다. `project apply`는 호출할 때마다 현재 선택에서 새 계획을 만드는 편의 경로이므로 두 호출이 같은 계획이라는 뜻은 아니다.

standalone adapter의 JSON 검증과 `preview`/`apply`는 경로·digest·소유권을 확인하는 기계 검증 경로이며 Catalog의 승인 정책을 알지 못한다. 승인 필수 프로젝트의 공식 적용은 Catalog 경로를 사용한다.

Catalog 변경은 `mutateCatalog`가 같은 저장소의 파일 잠금을 얻은 뒤 최신 snapshot을 읽고, 해당 변경과 중첩 변경이 성공하면 한 번 원자적으로 저장한다. Registry import의 index 읽기·중복 확인·artifact 등록·index 저장도 같은 Registry 잠금 아래 수행한다. 조회한 오래된 객체를 low-level `saveCatalog`/`saveRegistry`로 덮어쓰려 하면 각각 `CATALOG_WRITE_CONFLICT`/`REGISTRY_WRITE_CONFLICT`로 거절되므로 최신 상태를 다시 읽고 의도한 변경을 재구성한다.

Catalog의 reference 적용과 Manager bridge 적용은 **동일한 물리 delivery root**의 파일 잠금을 공유한다. Catalog 위치나 프로젝트 ID, symlink 경로 표기가 달라도 같은 root의 협력 프로세스는 순차 적용한다. 잠금은 같은 로컬 사용자·호스트의 공통 잠금 저장소를 사용하는 프로세스에 적용되며, 임의의 부모·자식 root 전체나 외부 CLI·수동 파일 수정까지 조정하지 않는다. Catalog, Registry, 전체 전달을 하나의 원자적 트랜잭션으로 묶는 보장도 아니다. 구현: [Catalog 저장](../../apps/skills-catalog/src/catalog-state.js), [Registry import](../../apps/skills-catalog/src/registry.js), [전달 잠금](../../apps/skills-catalog/src/activation-locks.js).

적용 report와 호스트의 스킬 인식을 확인한다. `project status`의 `managed: true`는 sidecar 존재를 뜻하며 무결성·소유권의 완전한 검증을 대신하지 않는다. adapter가 충돌을 반환하면 기존 파일과 소유 도구를 조사한 뒤 재계획한다. `npx skills remove`, 수동 삭제, `project link`로 충돌을 덮어쓰지 않는다.

Catalog 관리 스킬 업데이트는 새 revision 등록 → diff/검토 → 프리셋 또는 override의 revision 선택 → preview/apply 순서다. 이전 상태로 돌아갈 때도 이전 revision과 선택 정책으로 새 계획을 만든다. 프로젝트에서 사용을 중단하려면 해당 lineage의 disable override를 기록하고 preview/apply를 수행한다. provider별로 disable은 설정 변경 또는 전달 경로 정리로 구현될 수 있다.

```bash
node apps/skills-catalog/src/cli.js project skill demo-codex disable LINEAGE_ID \
  --skill REGISTRY_SKILL_ID
node apps/skills-catalog/src/cli.js history record-plan demo-codex \
  --out "$PLAN_DIR/disable-plan.json"
node apps/skills-catalog/src/cli.js history apply DISABLE_PLAN_ID
node apps/skills-catalog/src/cli.js history apply DISABLE_PLAN_ID --confirm
```

`DISABLE_PLAN_ID`는 방금 저장한 계획의 ID다. disable을 전달할 때는 `--enabled-only`를 붙이지 않는다. 구현 근거: [Catalog CLI](../../apps/skills-catalog/src/cli.js), [프로젝트 워크플로](../../apps/skills-catalog/src/catalog-workflows.js), [승인 정책과 저장 계획 적용](../../apps/skills-catalog/src/activation-policy.js), [adapter](../../packages/skills-manager-adapter/src/index.js). 팀별 recipe와 프리셋 운영은 [패키지 관리 가이드](./project-skill-package-management.md)를 따른다.

## 6. 직접 설치한 스킬 업데이트·제거·재구성

### 업데이트

`update`는 변경을 수행하는 명령이다. 사전에 source 변경과 로컬 수정 여부를 검토하고, 이름과 범위를 지정한다.

```bash
npx skills@1.5.24 update web-design-guidelines --project
npx skills@1.5.24 update web-design-guidelines --global
```

위 두 명령은 범위별 선택지다. 이름만 주고 범위를 생략하면 양쪽 범위가 선택될 수 있다. 1.5.24에는 문서화된 읽기 전용 update dry-run 옵션이 없다. **`check`도 같은 업데이트 구현을 호출하므로 점검용으로 실행하지 않는다.** 로컬 path source와 일부 추적 정보가 없는 source는 자동 업데이트 대상에서 제외될 수 있다. 이 경우 원본 변경을 검토하고 동일 source·이름·agent·범위로 `add`를 다시 실행한다. 근거: [upstream update.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/update.ts), [명령 dispatch](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/cli.ts).

### 제거

```bash
# 현재 프로젝트에서 선택한 에이전트의 스킬 제거
npx skills@1.5.24 remove web-design-guidelines --agent codex

# global 설치를 제거하는 경우
npx skills@1.5.24 remove web-design-guidelines --agent codex --global
```

제거 후 동일 범위의 `list`와 다른 에이전트의 공유 경로를 확인한다. `--all`은 확인을 생략하는 전체 제거이므로 개별 스킬 복구에 쓰지 않는다. 플랫폼 sidecar가 있는 경로의 관리는 Catalog로 돌아간다. 근거: [upstream remove.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/remove.ts).

### lock 파일과 팀 재현

| 파일 | 관리 주체와 의미 | 팀 사용 원칙 |
| --- | --- | --- |
| 프로젝트 `skills-lock.json` | Vercel CLI source/ref/path/콘텐츠 hash 기록 | 직접 설치 프로젝트는 관련 스킬 변경과 함께 diff 검토·커밋 |
| `~/.agents/.skill-lock.json` | Vercel CLI global 설치 기록·선호; `XDG_STATE_HOME`이 있으면 그 아래 `skills/.skill-lock.json` | 개인 상태이며 프로젝트에 복사하지 않음 |
| `*.skills-platform-link-ownership.json` | 플랫폼 전달 경로의 adapter 소유권 기록 | Vercel lock과 대체 관계가 아님 |
| 플랫폼 recipe / Registry / Catalog | source 선언·immutable revision / 로컬 정책·이력 | [패키지 관리 가이드](./project-skill-package-management.md)의 이식성 경계를 따름 |

Vercel CLI의 local lock은 콘텐츠 hash를 기록하지만, 복원 명령이 그 hash의 정확한 역사적 콘텐츠를 강제 검증하는 것은 아니다. `experimental_install`은 기록된 source/ref를 다시 취득해 `.agents/skills/`로 설치하며 기존 agent별 copy/symlink 배치 전체를 재현하는 계약도 아니다. 움직이는 branch나 로컬 source의 변경을 되돌리는 용도로 사용하지 않는다. 엄밀한 재현은 확인한 commit 또는 플랫폼 immutable revision으로 관리한다. 근거: [local-lock.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/local-lock.ts), [skill-lock.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/skill-lock.ts), [install.ts](https://github.com/vercel-labs/skills/blob/1682051d48c34f5eb135e6475c1a965dce05e820/src/install.ts).

```bash
# 직접 설치 프로젝트에서만: 실험적 source 재취득이며 파일을 변경한다.
npx skills@1.5.24 experimental_install
```

`install`은 `add`의 별칭이다. `npx skills install`을 lock 복원 명령으로 안내하지 않는다. 플랫폼의 절대 경로 symlink와 로컬 Catalog를 다른 PC에 복사하는 대신, portable recipe/source 선언에서 각 PC의 전달 경로를 재구성한다.

## 7. 실패 복구

| 증상 | 확인과 복구 |
| --- | --- |
| Node engine 오류 또는 CLI 실행 실패 | Node 22.20.0 이상과 실제 사용 중인 `node`/`npm` 경로 확인. 버전·help부터 재확인 |
| 스킬을 찾지 못함 | `--list`, frontmatter `name`, 정확한 package 경로 확인. 중첩 탐색은 `--full-depth`를 검토하되 중복 source를 별도로 결정 |
| 인증·clone 실패 | 동일 repository URL의 Git 접근, SSH/credential helper, 조직 권한 확인. 성공한 인증 방식의 URL로 재시도 |
| 설치 성공 후 에이전트에서 보이지 않음 | 프로젝트/global 범위, 실제 경로, host 검색 경로, `SKILL.md`, 중복 이름, 새 세션의 스킬 목록 확인 |
| symlink 또는 copy 설치 실패 | 설치 결과의 실패·fallback과 디스크 상태 확인. 같은 소유 도구로 필요한 항목만 재설치하고 `--copy` 필요 여부 결정 |
| 같은 이름의 기존 설치·플랫폼 충돌 | 기존 source와 변경분 보존 → 소유 도구 확인 → 그 도구로 해제 → 선택한 도구로 재설치. 전체 삭제로 우회하지 않음 |
| 공유 경로 변경이 차단됨 | 현재 Manager 영향 목록 검토 → UI에서 확인 후 새 preview, 또는 CLI 새 계획에 `--confirm-shared-root` 기록 → 그 새 ID 적용. 기존 history plan에 확인 옵션을 덧붙이지 않음 |
| 저장 충돌 또는 `FILE_LOCK_TIMEOUT` | 현재 작업의 완료 여부와 최신 Catalog/Registry 확인. stale snapshot을 버리고 필요한 변경을 재구성하며, 활성 프로세스의 잠금 파일을 임의 삭제하지 않음 |
| update 후 기대 동작이 달라짐 | 원본 변경과 설치 diff 확인. 검토한 이전 source/commit으로 다시 설치하거나 Catalog의 이전 revision으로 재계획 |
| lock 충돌·손상 또는 source가 `null` | 무조건 lock 삭제로 해결하지 않음. Git 이력·실제 설치와 source 선언을 대조해 복구. 디스크 발견과 CLI 추적은 다를 수 있음 |

## 8. 검증 기록과 가이드 갱신 규칙

2026-09-08에 npm registry의 `latest`가 `1.5.24`이고 배포 메타데이터 `gitHead`가 `1682051d48c34f5eb135e6475c1a965dce05e820`임을 확인했다. 코드 출처 링크는 이 commit으로 고정했다. 임시 디렉터리에 npm 배포본을 풀고 런타임 의존성만 설치하여 `--help`, 빈 프로젝트 `list --json`, 이 저장소의 정확한 package 경로 `add … --list`를 실행했다. 설치·업데이트·제거 및 사용자 skill root 변경은 검증 중 수행하지 않았다. mutation 동작은 배포 bundle 및 플랫폼 source와 대조했다.

공식 README의 `main`도 확인했지만 README와 실행 계약이 항상 일치하지는 않는다. 확인한 차이는 다음과 같다.

| 항목 | README 또는 관용적 안내 | 1.5.24 실행 기준 |
| --- | --- | --- |
| `list` 기본 범위 | README는 project+global이라고 서술 | help/source는 project 기본, global 별도 |
| `check` | 예전 설치 안내에서 점검 단계로 쓰일 수 있음 | help에는 없고 dispatch는 `runUpdate` 호출 |
| lock 복원 | `install`로 추측하기 쉬움 | `install`은 add alias, 복원은 실험적 `experimental_install` |
| universal agent global 경로 | README/agent 설정은 agent별 경로 표기 | installer는 `.agents/skills` canonical 경로를 우선 |

가이드 갱신 시 npm 버전과 Node 요구사항, **그 배포본의 help/source**, upstream README, 호스트 경로를 다시 대조한다. `main`에 등장한 기능을 현재 배포본에서 지원한다고 추정하지 않는다. 설치 성공·디스크 상태·호스트 인식·대표 작업 결과를 나누어 기록하고, 검증하지 않은 플랫폼·인증·업데이트 동작은 실측 결과로 표현하지 않는다.
