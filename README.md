# Skills Platform

Skills Platform은 **작업에 맞는 스킬을 찾고, 검토한 버전을 프로젝트에 적용하고, 실제 적용 상태를 확인하는** 스킬 관리 플랫폼입니다. 스킬의 목적과 사용 시점, 출처와 변경 이력, 프로젝트별 선택 이유를 함께 관리하여 사용자와 에이전트가 같은 기준으로 스킬을 사용하도록 돕습니다.

기본 사용 단위는 **프로젝트**입니다. 필요한 스킬을 버전이 있는 템플릿으로 묶고, 프로젝트의 기본 템플릿과 작업 범위별 추가 템플릿을 조합합니다. 변경할 때는 적용 계획을 먼저 확인하고, 전달 도구가 설치한 결과와 에이전트에서의 실제 발견·호출을 나누어 확인합니다.

## 무엇부터 시작하나요?

| 하려는 일 | 시작 문서 |
| --- | --- |
| 스킬 하나를 설치하거나 기존 설치를 확인하기 | [공식 설치 가이드북](./docs/guides/skills-installation-guide.md) — `vercel-labs/skills` 직접 설치와 Catalog 관리 경로 선택 |
| 작업에 맞는 스킬셋과 선택 순서를 정하기 | [추천 스킬셋·정렬 가이드](./docs/guides/recommended-skillsets-guide.md), [안정화·적용 결과](./docs/reports/2026-09-08-platform-stabilization.md) |
| 플랫폼을 켜고 프로젝트별 스킬 구성을 관리하기 | 아래 [시작하기](#시작하기), 이어서 [활용 가이드](./docs/skills-usage.md) |
| 에이전트에게 플랫폼 사용을 안내받기 | 설치·발견 확인 후 `$skills-platform-guide` 호출; [자체 운영 스킬](./skills-packages/platform-core/skills-platform-guide/SKILL.md) |
| 스킬을 새로 만들거나 개선하기 | [스킬 작성 참고 목록](./docs/skill-authoring-reference-catalog.md), [프로젝트 스킬 패키지 관리](./docs/guides/project-skill-package-management.md) |
| 플랫폼 구조와 운영 경계를 이해하기 | [아키텍처](./docs/architecture.md), [현재 구현 상태](./docs/current-status.md), [저장소 관리](./docs/repository-management.md) |

외부 스킬을 빠르게 프로젝트에서 사용하려면 [`vercel-labs/skills`](https://github.com/vercel-labs/skills) CLI의 직접 설치 경로를 선택할 수 있습니다. 출처 검토, 버전 고정, 템플릿, 여러 프로젝트의 변경 기록이 필요하면 Catalog 관리 경로를 선택합니다. 직접 설치한 스킬이 Catalog에 자동 등록되지는 않으며, 같은 설치 경로를 여러 도구가 동시에 관리하도록 설정하지 않습니다. 범위와 명령은 [설치 가이드북](./docs/guides/skills-installation-guide.md)을 따릅니다.

## 시작하기

Node.js **20.19 이상**과 Git이 필요합니다. 아래 명령은 저장소 루트에서 실행합니다.

```bash
git clone --recurse-submodules https://github.com/mineclover/Skills-Platform.git
cd Skills-Platform
npm ci
npm run build:packages
```

이미 일반 clone을 했다면 먼저 submodule을 준비합니다.

```bash
git submodule update --init --recursive
```

터미널 하나에서 Catalog API bridge를 실행합니다.

```bash
node apps/skills-catalog/src/cli.js serve \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --port 4300
```

다른 터미널의 저장소 루트에서 UI를 연결합니다.

macOS / Linux:

```bash
export VITE_CATALOG_API="http://127.0.0.1:4300"
npm run dev --workspace @skills-platform/catalog-ui
```

Windows PowerShell:

```powershell
$env:VITE_CATALOG_API = "http://127.0.0.1:4300"
npm run dev --workspace @skills-platform/catalog-ui
```

Vite가 출력한 주소를 엽니다. `VITE_CATALOG_API`를 설정하지 않은 UI는 시각적 미리보기이므로 실제 프로젝트 연결이나 설치 성공의 근거가 아닙니다. API와 UI를 실행하는 것만으로 스킬이 설치되지는 않습니다. 첫 프로젝트 등록과 스킬 선택은 [활용 가이드](./docs/skills-usage.md)를 따릅니다.

UI의 **Apply through Skills Manager CLI**와 실시간 binding 조회에는 별도 Skills Manager inspector가 필요합니다. bridge는 `apps/skills-manager`의 빌드된 inspector를 우선 사용하고, 없으면 해당 submodule에서 `npm run inspect`를 실행하므로 Rust/Cargo 및 해당 OS 빌드 의존성이 필요합니다. 준비 절차와 환경 변수는 [설치 가이드북](./docs/guides/skills-installation-guide.md)과 [macOS·control-plane 운영 가이드](./docs/guides/macos-and-control-plane-guide.md)를 확인합니다. 루트 `npm run build:packages`는 이 Rust inspector를 빌드하지 않습니다.

## 일관된 사용 흐름

1. **찾고 이해하기** — Skills에서 목적, 사용 시점, 출처, provider별 작성 검사 결과를 확인합니다.
2. **등록하고 검토하기** — Registry에 변경 불가능한 리비전을 저장하고 검토 근거를 남깁니다. 등록은 설치가 아닙니다.
3. **프로젝트에서 선택하기** — Templates의 버전을 Projects에 지정하고, 작업 범위와 개별 스킬 예외를 확인합니다.
4. **계획을 확인하고 적용하기** — 설치·교체·비활성화 대상과 경로를 확인한 후 같은 계획을 전달 도구로 적용합니다.
5. **발견과 사용을 확인하기** — 적용 보고서와 실제 binding을 확인하고, 에이전트의 스킬 목록에서 발견되는지와 명시 호출 결과를 확인합니다.

`skills-platform-guide`가 현재 에이전트에 설치되어 발견되었다면 다음과 같이 요청할 수 있습니다.

```text
$skills-platform-guide 이 프로젝트에 필요한 스킬을 찾고 현재 설치 상태를 설명해 줘.
$skills-platform-guide 이 외부 스킬을 프로젝트 범위로 설치하는 경로와 적용 계획을 준비해 줘.
$skills-platform-guide 스킬 파일은 있는데 에이전트가 발견하지 못하는 이유를 확인해 줘.
```

저장소에 `SKILL.md`가 존재하는 것만으로 호출 가능해지지는 않습니다. 자체 운영 스킬의 설치도 [설치 가이드북](./docs/guides/skills-installation-guide.md)의 프로젝트 설치 절차를 거칩니다. 새로운 스킬의 기획·작성·정적 검사·등록·개방형 오버레이 바인딩 절차는 [스킬 추가 완벽 가이드북](./docs/guides/skill-addition-guide.md)을 참고합니다.

## 저장소 구성과 책임

```text
apps/
  skills-catalog/    출처·리비전·검토·템플릿·프로젝트 정책·적용 계획
  catalog-ui/        Skills / Templates / Projects 관리 화면
  skills-manager/    고정된 Git submodule: provider 발견과 실제 파일 전달
packages/
  skill-contracts/         Catalog와 adapter가 공유하는 버전 계약
  skills-manager-adapter/ 로컬 개발·계약 검증용 reference adapter
  ledger-store/           계획과 근거 저장을 위한 공통 저장소
skills-packages/     이 저장소가 관리하는 스킬 원본
skills-instances/    필요할 때 동결한 버전 스냅샷(@<version>)
docs/               사용자 가이드, 아키텍처, 운영·검증 근거
```

Catalog의 Registry·검토·템플릿 정책과 provider의 설치 경로를 분리합니다. UI의 적용은 저장된 계획을 Skills Manager CLI에 전달합니다. 별도의 reference adapter는 로컬 개발과 전달 계약 검증에 사용합니다. 원본을 직접 연결하는 개발 경로와 동결 버전을 사용하는 경로는 [스킬 참조·전달 가이드](./docs/guides/skill-reference-and-delivery-guide.md)에 구분되어 있습니다.

[`skills-platform-authoring-recipe.json`](./skills-platform-authoring-recipe.json)은 자체 운영 안내와 provider별 작성 스킬 구성을 재현하는 선언입니다. 이 선언의 패키지는 `recipe apply`로 등록하여 상대 source locator와 불변 digest를 유지합니다. 실제 Catalog 등록·선택·이력은 머신별 상태이므로 스킬 수나 현재 설치 상태를 README에서 고정하지 않고 CLI와 UI에서 조회합니다.

추가 설계·검증 자료는 [MVP](./docs/mvp.md), [기본 시나리오 검증](./docs/basic-scenario-proof.md), [로드맵](./docs/roadmap.md), [에이전트 실행 원칙](./docs/agent-execution-principles.md), [에이전트 설계 anti-patterns](./docs/agent-design-antipatterns.md), [Codex hook 운영](./docs/guides/codex-hooks-guide.md)에서 확인합니다. lockfile에는 macOS Intel·Apple Silicon과 Windows용 선택적 네이티브 의존성이 포함되므로 특정 플랫폼의 의존성을 제거한 상태로 재생성하지 않습니다.
