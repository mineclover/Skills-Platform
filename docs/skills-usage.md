# Skills Platform 활용 가이드

작업별 기본셋·추천 후보와 실제 선택의 차이는 [추천 스킬셋·정렬 가이드](./guides/recommended-skillsets-guide.md),
초기 프로젝트 적용 결과는 [실제 사용 평가](./reports/2026-09-08-skill-platform-evaluation.md), 이후 정책·UI·recipe 보완은 [hardening 보고서](./reports/2026-09-08-platform-hardening.md), 동시 변경·공유 경로·화면 상태 안정화는 [stabilization 보고서](./reports/2026-09-08-platform-stabilization.md)에 정리되어 있습니다. 현재 운영은 이 문서의 절차를 기준으로 합니다.

Skills Platform에서 스킬을 사용하는 흐름은 **찾기 → 검토·등록 → 프로젝트 선택 → 계획 확인·적용 → 발견·호출 확인**입니다. 이 문서는 Catalog와 UI를 사용하여 그 흐름을 관리하는 방법을 설명합니다. 플랫폼 실행은 [README의 시작하기](../README.md#시작하기), `vercel-labs/skills`를 포함한 설치 경로·범위·업데이트·제거는 [공식 설치 가이드북](./guides/skills-installation-guide.md)을 기준으로 합니다.

명령은 저장소 루트에서 실행합니다. 예제의 `LINEAGE_ID`, `REVISION_ID`, `REGISTRY_SKILL_ID`, `PLAN_ID`는 앞선 조회나 import 응답에 나온 실제 값으로 바꿉니다. 스킬 이름, lineage, 소스 revision, Registry skill ID는 서로 다른 값입니다.

## 1. 목적과 사용 상태 이해하기

플랫폼은 스킬 파일뿐 아니라 **무슨 작업에 쓰는지, 어떤 출처와 버전을 검토했는지, 어느 프로젝트가 왜 선택했는지, 적용 결과가 의도와 맞는지**를 관리합니다. 기본 설치 범위는 현재 프로젝트이며, 전역 설치는 여러 프로젝트가 함께 사용할 필요가 있을 때 별도로 선택합니다.

| 확인하는 상태 | 의미와 확인 근거 |
| --- | --- |
| 원본이 있음 | 저장소에 `SKILL.md`가 있음. 에이전트의 설치 경로라는 의미는 아님 |
| Catalog에 등록됨 | Registry에 불변 리비전이 있고 `skill list`에서 조회됨 |
| 프로젝트에서 선택됨 | 템플릿·overlay·개별 예외를 합친 `project resolve` 결과에 포함됨 |
| 파일이 설치됨 | adapter 보고서와 실제 provider binding이 계획과 맞음 |
| 에이전트가 발견함 | 대상 프로젝트를 연 호스트의 스킬 목록에 표시됨 |
| 실제 호출됨 | 명시 요청 또는 적합한 작업에서 스킬이 사용되었다는 실행 근거가 있음 |

등록·선택·설치·발견·호출을 모두 “활성화 완료”로 묶지 않습니다. Catalog의 검토나 정적 검사 통과도 실제 작업의 성공을 보장하지 않습니다. 파일 전달은 adapter가 담당하고, 에이전트의 발견과 사용은 호스트에서 확인합니다.

### 직접 설치와 Catalog 관리 선택

| 필요 | 경로 |
| --- | --- |
| 외부 스킬을 특정 프로젝트에서 빠르게 사용 | `vercel-labs/skills` CLI 직접 설치; 출처·스킬명·대상 에이전트·프로젝트 범위를 지정 |
| 검토한 리비전, 버전 있는 템플릿, 프로젝트별 선택·적용 이력 | Catalog import → 검토 → 템플릿/프로젝트 → preview → adapter apply |
| 이 저장소의 스킬 원본을 작성하며 즉시 참조 | `advisory` 프로젝트의 고급 `project link` 경로. `require_approved` 프로젝트는 불변 리비전·검토·계획 경로 사용 |

직접 설치는 Catalog 등록이나 리뷰 기록을 자동 생성하지 않습니다. 동일한 스킬 설치 경로를 여러 도구로 중복 관리하지 말고, 설치 가이드북의 관리 주체 전환 절차를 사용합니다.

### 자체 운영 스킬로 안내받기

[`skills-platform-guide`](../skills-packages/platform-core/skills-platform-guide/SKILL.md)는 플랫폼 목적, 설치 경로 선택, 프로젝트 적용, 발견 문제 진단을 안내하는 자체 스킬입니다. 설치·발견을 확인한 후 다음처럼 사용합니다.

```text
$skills-platform-guide 현재 프로젝트의 스킬 구성과 설치 상태를 설명해 줘.
$skills-platform-guide 이 스킬의 직접 설치와 Catalog 관리 중 적합한 경로를 골라 적용 계획을 준비해 줘.
$skills-platform-guide 설치한 스킬이 목록에 없는 이유를 확인해 줘.
```

스킬 작성·검토는 `skill-authoring-standard`와 [작성 참고 목록](./skill-authoring-reference-catalog.md)을 사용합니다. 플랫폼 사용 안내와 provider별 스킬 작성 규칙을 구분합니다.

## 2. UI를 연결하고 현재 상태 조회하기

[README](../README.md#시작하기)의 bootstrap을 마친 뒤, 터미널 하나에서 API bridge를 실행합니다.

```bash
node apps/skills-catalog/src/cli.js serve \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --port 4300
```

다른 터미널에서 `VITE_CATALOG_API=http://127.0.0.1:4300`을 설정하고 UI를 실행합니다. PowerShell 설정법은 README에 있습니다.

```bash
export VITE_CATALOG_API="http://127.0.0.1:4300"
npm run dev --workspace @skills-platform/catalog-ui
```

설정 없이 실행한 UI는 시각적 미리보기입니다. API에 연결한 경우에도 Skills Manager가 준비되지 않았다면 Catalog 정책 조회와 실제 binding 조회·적용의 결과가 다를 수 있습니다.

연결된 UI는 로딩 중이거나 조회가 실패한 상태를 demo 데이터로 대체하지 않습니다. 프로젝트·작업 범위가 바뀌면 이전 응답·snapshot을 새 선택의 상태로 사용하지 않으며, 현재 조회가 준비될 때까지 변경·적용 버튼을 비활성화합니다. 화면이 준비되지 않았다면 로딩·오류 상태를 확인하고 다시 조회합니다.

주요 화면은 다음 순서로 사용합니다.

| 화면 | 하는 일 | 저장만으로 바뀌지 않는 것 |
| --- | --- | --- |
| Skills | 출처·리비전·작성 검사, 목적·사용 시점, 검토·근거·노트 관리 | 템플릿 버전과 설치 경로 |
| Templates | 선택한 스킬을 새 템플릿 버전으로 구성 | 기존 프로젝트가 고정한 템플릿 버전 |
| Projects | 기본 템플릿·일치하는 모든 overlay와 priority·각 스킬의 최종 선택 출처 확인, 계획 preview/apply, 이력·실제 binding 조회 | 템플릿 지정만으로는 실제 파일 전달이 일어나지 않음 |

로컬 Catalog는 머신마다 달라집니다. 고정된 스킬 수나 프리셋 목록을 문서에서 복사하지 말고 현재 등록과 저장소의 recipe를 함께 조회합니다. UI의 Template은 CLI에서 `preset`입니다.

```bash
node apps/skills-catalog/src/cli.js project list \
  --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js preset list \
  --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js skill list \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js review queue \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js recipe inspect \
  ./skills-platform-authoring-recipe.json
```

목적이나 provider로 범위를 좁힐 수 있습니다.

```bash
node apps/skills-catalog/src/cli.js skill search authoring \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --provider codex
```

UI·API·CLI는 같은 검색 계약을 사용합니다. provider 필터는 profile의 `provider_constraints`에 있는 정확한 값으로 일치시키고, 일반 검색은 메타데이터와 삭제되지 않은 note 내용을 포함합니다. 결과는 profile title 기준으로 정렬합니다. provider 조건이 비어 있는 스킬은 해당 provider 지원이 확인된 검색 결과로 포함하지 않습니다.

## 3. 스킬을 검사하고 Registry에 등록하기

이 절은 recipe에 선언되지 않은 개별 로컬 패키지의 등록 예제입니다. `/absolute/path/to/my-skill`과 `my-skill`을 실제 패키지 경로·이름으로 바꾸고, 지원할 provider의 작성 규칙을 검사합니다. 외부 Git 출처와 `npx skills` 명령은 [설치 가이드북](./guides/skills-installation-guide.md)을 따릅니다.

이 저장소 recipe가 관리하는 `skills-platform-guide`, `skill-authoring-standard`, `writing-great-skills`, `skill-creator`는 다음 절의 `recipe apply`로 등록합니다. 일반 `import-local`은 절대 경로를 source locator로 사용하지만 recipe는 선언된 상대 locator를 유지하므로, 같은 패키지를 두 방식으로 등록하면 별도 출처·lineage가 생길 수 있습니다.

```bash
node apps/skills-catalog/src/cli.js source inspect \
  /absolute/path/to/my-skill
node apps/skills-catalog/src/cli.js skill validate \
  /absolute/path/to/my-skill --provider codex
node apps/skills-catalog/src/cli.js skill validate \
  /absolute/path/to/my-skill --provider antigravity
```

`source inspect`의 `importable`은 소스를 발견하고 manifest를 읽어 Registry에 복사할 수 있다는 의미입니다. provider별 결과는 `skills[].authoring.results.codex` 및 `skills[].authoring.results.antigravity`에 있습니다. `importable: true`여도 각 `summary.status`가 작성 규칙에 적합하지 않을 수 있습니다.

검사 결과를 읽고 import합니다. 승인 명령은 검토를 마친 정확한 리비전에만 사용하고, `--summary`에는 실제 검토 근거를 남깁니다.

```bash
node apps/skills-catalog/src/cli.js import-local \
  /absolute/path/to/my-skill \
  --registry ./.skills-platform/registry --skill my-skill
node apps/skills-catalog/src/cli.js source review approve REVISION_ID \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --summary "출처, provider 검사 결과, 리비전 digest와 지침 내용을 검토함."
node apps/skills-catalog/src/cli.js skill analysis run LINEAGE_ID \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --revision REVISION_ID
```

import는 승인·선택·설치를 수행하지 않습니다. 정적 분석도 스킬을 실행하지 않으며, 검토 기록을 실제 호출 검증의 대체물로 사용하지 않습니다.

### 프로젝트의 출처 검토 정책

프로젝트의 기본 정책은 기존 동작을 유지하는 `advisory`입니다. 출처 승인을 전달 조건으로 적용하려면 다음과 같이 설정합니다. 현재 Skills Platform Codex 프로젝트는 `require_approved`를 사용합니다.

```bash
node apps/skills-catalog/src/cli.js project set-policy skills-platform-codex \
  --catalog ./.skills-platform/catalog --review-policy require_approved
```

`require_approved`에서는 Catalog가 계획을 만들고 저장·적용할 때 다음을 확인합니다.

- enabled 대상의 정확한 Registry 리비전·digest·경로와 프로젝트 대상이 일치해야 합니다.
- 선택한 각 source revision의 **가장 최근 검토 결정**이 `approved`여야 합니다. 최신 import만 선택해야 한다는 의미는 아닙니다.
- 선택한 preset의 lifecycle 또는 스킬 profile의 review state가 `deprecated`이면 enabled 전달을 차단합니다.
- disabled 연산은 승인 여부로 차단하지 않아 비활성화할 수 있습니다. 직접 연결 명령 `project link`는 허용하지 않습니다.

source revision 승인, profile의 `reviewed` 분류, preset의 `reviewed` lifecycle은 서로 다릅니다. profile이나 preset에 `reviewed`를 표시해도 source 승인 기록을 대신하지 않습니다. 승인이 취소되면 저장된 과거 계획도 현재 정책을 다시 검사하므로 그대로 적용되지 않습니다.

이 정책은 Catalog를 거치는 전달 경로의 검사입니다. 파일 권한이나 다른 프로그램을 통제하는 보안 격리는 아니며, 독립 adapter CLI는 Catalog 검토 상태를 알지 못합니다.

## 4. 저장소 recipe로 프로젝트 구성하기

[`skills-platform-authoring-recipe.json`](../skills-platform-authoring-recipe.json)은 이 저장소의 사용 안내·작성 패키지와 provider별 프리셋을 재현하는 선언입니다. 상대 소스 경로는 recipe 파일의 디렉터리를 기준으로 해석하고 locator 표기를 유지합니다. Codex와 Antigravity의 작성·발견 계약은 별도로 유지합니다.

현재 선언에서 Codex 프리셋은 `skills-platform-guide`, `skill-authoring-standard`, `writing-great-skills`를 선택하고 Antigravity는 앞의 두 패키지를 선택합니다. 이것은 원하는 구성이며, 기존 호스트의 설치 완료 상태를 뜻하지 않습니다. 원본 변경은 새 불변 리비전과 recipe digest로 반영하고 기존 Registry snapshot은 수정하지 않습니다.

먼저 선언을 읽고 Registry 소스·프로필·프리셋을 조정합니다.

```bash
node apps/skills-catalog/src/cli.js recipe inspect \
  ./skills-platform-authoring-recipe.json
node apps/skills-catalog/src/cli.js recipe apply \
  ./skills-platform-authoring-recipe.json \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

현재 저장소 recipe는 hook이 없으므로 `--path`를 생략하면 provider에 전달하지 않습니다. hook이 있는 다른 recipe는 hook 조정도 수행하므로 내용을 먼저 확인합니다. recipe는 이식 가능한 선언이고 Catalog JSON은 머신별 상태입니다. 저장소의 `skill-creator`는 검토·비교용으로 유지하며, Codex가 제공하는 동명의 system skill과 겹치지 않도록 Codex 전달 프리셋에서 제외합니다.

recipe는 선택적 `skills[].profile`, 프로젝트의 `preset_assignments`와 고정 버전·역할·priority·태그·enabled 상태, 프로젝트 상대 전달 경로와 검토 정책을 보존할 수 있습니다. source 승인·평가 결과·실행 이력은 복사하지 않습니다. 새 Catalog에서는 먼저 위 명령으로 import하고, 실제 전달할 불변 리비전을 조회·검토한 뒤 앞 절의 `source review approve`로 결정 근거를 기록합니다. `require_approved` 프로젝트에서는 이 기록 없이 다음 단계의 enabled 계획을 만들 수 없습니다.

현재 프로젝트의 기본셋·추천 연결을 함께 재현할 때는 [프로젝트 export recipe](../skills-platform-project-recipe.json)를 사용합니다. 작성 패키지 선언은 검토용 `skill-creator`와 Antigravity 프리셋도 유지하고, 프로젝트 export는 실제 해당 프로젝트에 연결된 기본·추천·overlay의 고정 구성을 담는 별도 파일입니다.

새 Catalog에서는 다음 명령으로 recipe에 선언된 Codex 프로젝트를 등록하고, 기본 프리셋을 지정하고, reference adapter의 전달 preview까지 생성할 수 있습니다.

```bash
node apps/skills-catalog/src/cli.js recipe apply \
  ./skills-platform-authoring-recipe.json \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --path . --provider codex --enabled-only
```

이 명령은 Catalog 상태를 변경하지만 `--confirm`이 없으므로 스킬 binding은 만들지 않습니다. `--enabled-only`는 선택된 enabled 리비전만 포함하는 추가 설치 방식입니다. 이를 생략하면 선택하지 않은 Registry 스킬에 대한 disable 연산까지 계획에 포함될 수 있습니다. 새 Catalog는 recipe의 고정 버전을 사용하고 기존 Catalog에서는 같은 snapshot을 재사용하거나 버전 충돌 시 새 로컬 버전으로 대응시킵니다. `preset_assignments`가 선언되면 그 선택을 복원하므로 실제 선택 버전을 `project resolve`로 확인합니다.

프로젝트를 직접 등록하려면 `--path` 없는 recipe 적용으로 프리셋을 준비한 뒤 다음 대체 절차를 사용합니다. 위의 `--path` 명령으로 이미 프로젝트를 등록했다면 `project add`와 `preset assign`은 생략하고 `project resolve`만 실행합니다.

```bash
node apps/skills-catalog/src/cli.js project add skills-platform-codex \
  --catalog ./.skills-platform/catalog --name "Skills Platform · Codex" \
  --path . --provider codex --review-policy require_approved
node apps/skills-catalog/src/cli.js preset assign \
  skills-platform-codex skills-platform-authoring-codex \
  --catalog ./.skills-platform/catalog --role default
node apps/skills-catalog/src/cli.js project resolve skills-platform-codex \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

`recipe.projects`가 있으면 `--provider`는 정확히 한 프로젝트 선언과 대응해야 합니다. CLI는 그 선언의 ID·이름·범위·전달 경로·기본 프리셋을 사용합니다. 프로젝트 선언이 없는 recipe는 경로에서 만든 프로젝트 ID와 첫 프리셋을 사용하는 기존 방식으로 처리됩니다. recipe에서 프로젝트 위치를 지정하는 플래그는 `--path`이며 `--project-path`가 아닙니다.

선택적 profile 필드나 `preset_assignments`가 없는 기존 recipe는 선언하지 않은 메타데이터·기존 overlay를 유지하면서 기존 기본 프리셋 조정 방식을 사용합니다. 명시적인 `preset_assignments` 목록은 전체 assignment 선언입니다. recipe의 `require_approved`는 기존 프로젝트 정책을 강화할 수 있지만 `advisory`나 필드 생략으로 기존 strict 정책을 낮추지는 않습니다. 정책 완화는 별도 `project set-policy` 변경입니다.

```bash
node apps/skills-catalog/src/cli.js recipe apply ./recipe.json \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --path /absolute/path/to/project --provider codex --enabled-only
```

Codex와 Antigravity가 모두 `.agents/skills`를 사용하더라도 provider별 프로젝트 선언·binding 결정을 구분하고, 서로 다른 관리 흐름이 같은 경로를 조정하지 않게 합니다. 저장소 recipe는 Codex 프로젝트를 선언하며, Antigravity 프리셋은 별도로 등록할 대상에 사용합니다. 자세한 복구·재현 절차는 [프로젝트 스킬 패키지 관리](./guides/project-skill-package-management.md)에 있습니다.

## 5. 계획을 확인하고 적용하기

기본 확인 항목은 대상 프로젝트·provider·전달 경로, 정확한 리비전·digest, 생성·교체·제거 대상, 기존 파일과의 충돌입니다. **UI bridge와 reference adapter는 서로 다른 전달 경로**입니다.

### 기본 CLI 경로: Catalog에 저장한 같은 계획 적용

계획을 이력에 저장하면서 검토용 파일도 내보냅니다. 응답의 `plan_id`를 이후 명령의 `PLAN_ID`로 사용합니다.

```bash
node apps/skills-catalog/src/cli.js history record-plan skills-platform-codex \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --enabled-only \
  --out ./.skills-platform/skills-platform-codex-plan.json
node apps/skills-catalog/src/cli.js history apply PLAN_ID \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
```

저장된 계획과 preview를 검토한 후 같은 ID로 적용합니다.

```bash
node apps/skills-catalog/src/cli.js history apply PLAN_ID \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --confirm
```

`history apply`는 새 계획을 만들지 않습니다. 저장된 계획의 무결성과 현재 프로젝트·승인 정책을 검사하고 reference adapter로 전달한 뒤 보고서를 같은 이력에 기록합니다. 적용 전과 각 연산 전에 정책을 다시 확인하며, Catalog의 reference·bridge 적용은 같은 실제 전달 루트를 가리키는 다른 Catalog나 symlink 경로에서도 공유 파일 잠금으로 직렬화합니다.

Catalog 메타데이터 변경은 프로세스 간 파일 잠금 안에서 최신 snapshot을 읽어 하나의 변경으로 저장하고, Registry index import도 해당 index의 잠금을 사용합니다. 계획 생성·기록은 일관된 선택 snapshot을 사용합니다. 이 보장은 각 저장소의 변경과 관리되는 적용 경로에 해당하며, Catalog·Registry·모든 외부 파일 변경을 하나의 트랜잭션으로 묶거나 잠금에 참여하지 않는 프로그램의 파일 변경까지 통제하지는 않습니다.

### UI와 운영 bridge: 저장된 같은 계획을 Skills Manager로 적용

Skills Manager에 대응하는 프로젝트와 Registry 리비전의 내용·digest가 일치하는 인스턴스가 준비되어 있어야 합니다. Catalog 프로젝트의 `upstream_project_id`는 기본적으로 Catalog 프로젝트 ID와 같으며, 등록할 때 `--upstream-project-id`로 지정하거나 기존 프로젝트는 다음 명령으로 연결합니다. `MANAGER_PROJECT_ID`는 inspector에서 확인한 실제 ID로 바꿉니다.

```bash
node apps/skills-catalog/src/cli.js project bind-manager skills-platform-codex \
  --catalog ./.skills-platform/catalog --upstream-project-id MANAGER_PROJECT_ID
```

현재 로컬 Skills Platform 프로젝트는 `workspace-4844cf93282d94de`에 연결되어 있으며 inspector 초기 설정을 준비했습니다. 이 ID를 다른 머신에 복사하지 말고 그 머신의 프로젝트 ID를 확인합니다. 연결 설정만으로 스킬을 설치하거나 검토를 승인하지는 않습니다. Inspector 준비와 upstream 등록은 [설치 가이드북](./guides/skills-installation-guide.md)을 참고합니다.

Projects에서 선택 이유와 계획을 확인한 후 **Apply through Skills Manager CLI**를 사용합니다. HTTP 클라이언트의 순서는 다음과 같습니다.

1. `POST /api/projects/<project-id>/activation-plan/preview`에 `{"preflight":true}`를 전달합니다. bridge가 불변 계획을 저장하고 upstream CLI로 검사·digest 대응·binding preview를 수행합니다.
2. 응답의 `plan.plan_id`와 생성·교체·disable 연산을 확인합니다.
3. `POST /api/activation-plans/<same-plan-id>/apply`에 `{"confirmed":true}`를 전달하거나 같은 계획의 `/apply/stream`을 사용합니다.
4. 결과의 `report.status`, `report.post_apply.verification.verified`와 실제 binding을 확인합니다.

apply는 저장된 계획과 현재 Catalog 검토 정책을 검사합니다. 대응하는 upstream 인스턴스가 없거나 digest가 다르면 이를 자동으로 import하지 않고 중단합니다. 적용 뒤 provider binding을 다시 조회하고 결과를 Catalog 이력에 저장합니다. 현재 UI/HTTP preview는 전체 조정 계획을 만들므로 선택하지 않은 스킬의 disable도 반드시 확인합니다. CLI의 `--enabled-only`와 같은 동작으로 가정하지 않습니다.

### 공유 경로의 영향 확인

Skills Manager preview는 알려진 provider가 직접 사용하거나 symlink를 거쳐 사용하는 공유 경로의 영향을 보여줍니다. **실제 공유 binding을 변경하는 경우**에는 별도 공유 영향 확인이 필요하며, Manager의 단일·일괄·preset·release 적용 모두 backend에서 이를 검사합니다. 같은 상태의 `noop` 재적용에는 공유 변경 확인을 요구하지 않습니다. 이는 알려진 소비자·링크의 관찰 결과이며 시스템 밖의 모든 소비자를 찾아냈다는 의미는 아닙니다.

UI에서 `Delivery impacts`의 provider·경로·변경 이유를 읽고 공유 영향 체크박스를 선택한 뒤 **새 preview**를 만듭니다. 체크박스는 기존 계획을 수정하지 않고 새 계획의 `distribution.shared_root_confirmation`에 반영됩니다. 프로젝트 선택·동의·영향 목록이 바뀌면 기존 적용 준비 상태가 해제되므로 현재 영향으로 다시 preview합니다.

CLI에서도 공유 영향을 확인한 경우 **새 계획 생성 시에만** `--confirm-shared-root`를 사용합니다. `PROJECT_ID`는 실제 대상이며 기존 계획의 작업 범위·전달 방식을 유지합니다. 아래는 추가 설치 예제이므로 disable 연산이 필요한 계획에서는 `--enabled-only`를 생략합니다.

```bash
node apps/skills-catalog/src/cli.js history record-plan PROJECT_ID \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --enabled-only --confirm-shared-root \
  --out ./.skills-platform/shared-root-plan.json
node apps/skills-catalog/src/cli.js history apply NEW_PLAN_ID \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
```

새 계획을 확인한 후 같은 `NEW_PLAN_ID`에 `history apply --confirm`을 사용합니다. `history apply`에 `--confirm-shared-root`를 붙이면 저장된 계획을 뒤늦게 바꾸려는 요청으로 거절됩니다. `project-plan`·`project apply`·`sync`도 새 계획을 만들 때 이 옵션을 받을 수 있습니다.

HTTP 통합에서는 새 preview 요청의 `distribution.shared_root_confirmation`으로 전달합니다. Inspector preview의 선택적 `target_root`는 실제 대상 검증을 위한 필드이며, 공유 영향 확인을 생략하거나 provider 경로를 임의로 변경하는 설정이 아닙니다.

### 독립 reference adapter: 기계적 전달 계약 검증

독립 adapter CLI는 파일·digest·소유권 검증용 도구이며 Catalog의 source 승인이나 deprecated 상태를 모릅니다. 운영 적용에는 위의 `history apply`를 사용합니다. 내보낸 계획의 기계적 검사만 별도로 확인할 때 다음 preview를 사용할 수 있습니다.

```bash
node packages/skills-manager-adapter/src/cli.js preview \
  ./.skills-platform/skills-platform-codex-plan.json
```

이 adapter는 macOS/Linux symlink, Windows junction 또는 소유권 sidecar가 있는 copy를 생성하는 구현입니다. `history record-plan`의 `--copy`로 copy 전달 계획을 만들 수 있습니다. adapter가 관리·내용을 확인할 수 없는 경로는 임의로 덮어쓰거나 제거하지 않습니다.

편의 명령 `project apply <id>`도 Catalog 정책을 검사한 reference adapter preview이며, `--confirm`을 추가하면 적용하고 Catalog 이력에 기록합니다. 다만 실행할 때마다 계획을 생성하므로 확인했던 계획 자체를 고정하려면 `history record-plan`과 `history apply` 또는 운영 bridge의 저장된 계획 방식을 사용합니다. 독립 adapter CLI의 실행 결과는 Catalog 이력에 자동 기록되지 않습니다.

`--enabled-only`는 선택한 enabled 리비전만 처리하여 관련 없는 binding과 Codex config 항목을 남깁니다. 생략하면 선택하지 않은 관리 대상 Registry 스킬을 disable하는 전체 조정입니다. `Pristine`은 명시적인 disable을 목적으로 하므로 `--enabled-only`와 함께 사용할 수 없습니다.

### 개발 중 원본 연결

`advisory` 프로젝트에서 `project link <project-id> <skill-name> --latest`는 원본을 직접 가리키는 `floating_latest`, `--version <semver>`는 `skills-instances`의 동결 버전을 가리키는 `version_pinned` 연결입니다. **이 명령은 `--confirm` 없이 실제 binding을 바꾸며 preview 명령이 아닙니다.** 현재 Skills Platform처럼 `require_approved`인 프로젝트에서는 거부되며, 원본을 import·검토한 뒤 고정 계획으로 적용해야 합니다. 동결·교체·복구는 [스킬 참조·전달 가이드](./guides/skill-reference-and-delivery-guide.md)를 따릅니다.

## 6. 파일 설치, 호스트 발견, 호출 확인하기

적용 보고서를 확인한 후 현재 파일 연결 상태를 조회합니다.

```bash
node apps/skills-catalog/src/cli.js project status skills-platform-codex \
  --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js history list \
  --catalog ./.skills-platform/catalog --project-id skills-platform-codex
```

`project status`는 전달 경로의 파일·링크와 직접 연결용 sidecar를 살피는 보조 조회입니다. copy 전달의 소유권·내용 digest를 모두 검증하는 명령은 아니므로 설치 성공 판단은 adapter 보고서와 해당 전달 경로의 실제 검사 결과를 함께 사용합니다. 어느 결과도 에이전트가 스킬을 읽었다는 증거는 아닙니다. UI의 실시간 상태는 upstream inspector가 확인한 binding이며, 원하는 상태만 보여주는 `project resolve` 결과와 구분합니다.

호스트에서는 대상 프로젝트를 열고 스킬 목록에 이름이 나타나는지 확인합니다. Codex config 변경으로 adapter가 `restart_required: true`를 보고했다면 Codex를 재시작한 후 확인합니다. 발견되면 영향이 작은 설명 요청으로 명시 호출을 검증합니다.

```text
$skills-platform-guide 이 프로젝트의 스킬 등록·설치·발견 상태를 구분해 설명해 줘.
```

목록에서 발견되지 않았거나 실제 호출을 확인하지 못했다면, 결과를 “파일 설치 확인 / 호스트 발견 미확인 / 호출 미확인”처럼 나누어 남깁니다. 문제별 점검과 업데이트·제거는 [설치 가이드북](./guides/skills-installation-guide.md)을 따릅니다.

### 저장한 observed state와 계획 비교

운영자가 별도 inspector snapshot을 가져오는 경우에는 다음 흐름을 사용할 수 있습니다. 처음 두 명령만 Skills Manager checkout에서 실행합니다.

```bash
npm run --silent inspect -- providers --project MANAGER_PROJECT_ID --json > providers.json
npm run --silent inspect -- bindings --project MANAGER_PROJECT_ID --provider codex --json > bindings.json
```

저장소 루트로 돌아와 JSON 파일의 실제 위치를 지정하여 기록·비교합니다.

```bash
node apps/skills-catalog/src/cli.js observed-state record skills-platform-codex \
  --catalog ./.skills-platform/catalog --provider codex \
  --inventory /absolute/path/to/providers.json \
  --bindings /absolute/path/to/bindings.json
node apps/skills-catalog/src/cli.js observed-state compare PLAN_ID \
  --catalog ./.skills-platform/catalog
```

비교는 `matched`, `missing`, `disabled`, `still_enabled`, `conflict`, `provider_unavailable`을 보고하며 전달 경로를 바꾸지 않습니다. `PLAN_ID`는 Catalog 이력에 저장된 계획의 ID여야 합니다.

낮은 수준의 저장 API가 `CATALOG_WRITE_CONFLICT` 또는 `REGISTRY_WRITE_CONFLICT`를 반환하면, 읽었던 snapshot 이후 다른 변경이 저장된 것입니다. 최신 상태를 다시 읽고 의도한 변경을 재검토하여 수행합니다. 오래된 JSON 전체를 다시 덮어써서 충돌을 없애지 않습니다. 일반 Catalog 변경 명령과 Registry import는 자체 잠금 안에서 최신 상태로 갱신합니다.

## 7. Codex와 Antigravity의 작성·발견 계약

두 provider 모두 정확한 대소문자의 `SKILL.md`를 사용하지만 같은 작성 규칙을 적용하지는 않습니다. 다음은 플랫폼이 검사·전달할 때 사용하는 계약입니다. 외부 CLI의 agent ID·경로는 설치 가이드북에서 별도로 확인합니다.

| 항목 | Codex | Antigravity |
| --- | --- | --- |
| 프로젝트 발견 경로 | `<project>/.agents/skills` | `<project>/.agents/skills`; 플랫폼은 기존 `.agent/skills`도 허용 |
| 전역 발견 경로 | `$HOME/.agents/skills` | `$HOME/.gemini/config/skills` |
| 필수 frontmatter | `name`, `description` | `description`; `name`은 폴더명에서 기본값 처리 가능 |
| 선택적 리소스 디렉터리 | `scripts/`, `references/`, `assets/`, `agents/` | `scripts/`, `examples/`, `resources/` |
| provider 확장 | 선택적 `agents/openai.yaml` | `agents/openai.yaml` 실행 계약 없음 |
| 루트 symlink | 공식 문서에 명시되어 허용 | 공식 문서의 명시가 없어 플랫폼 검사가 이식성 경고를 출력 |

플랫폼 CLI는 Codex 프로젝트의 다른 전달 경로를 거부합니다. Antigravity는 `.agents/skills`가 기본이고 `.agent/skills`는 명시적인 호환 옵션입니다. 정확한 ruleset ID·버전·공식 출처는 다음 명령으로 조회합니다.

```bash
node apps/skills-catalog/src/cli.js skill rulesets
```

### 명시 호출 전용과 비활성화 구분

| 설정 | 효과 |
| --- | --- |
| Catalog 프로필의 `invocation_mode` | `model_invoked`, `user_invoked`, `hybrid`, `unspecified` 분류. 검색·recipe·telemetry 메타데이터이며 binding을 바꾸지 않음 |
| Codex `policy.allow_implicit_invocation: false` | 작성 결과 `explicit_only`. 설치·enabled 상태를 유지하며 `$skill-name` 명시 호출로 사용 |
| 프로젝트·프리셋의 `disabled` | 계획의 `desired_state: "disabled"`가 되어 관리 binding 제거 대상이 됨 |

Codex reference adapter는 disable 시 대응하는 `[[skills.config]]` enablement도 조정하고 config가 바뀌면 `restart_required: true`를 보고합니다. `explicit_only`를 미설치나 disabled로 보고하지 않습니다.

## 8. 프로젝트 선택·설명·검토를 유지하기

### 템플릿 버전과 프로젝트 예외

템플릿을 수정하면 새 버전이 생깁니다. 프로젝트는 지정된 버전을 고정하므로 새 버전을 자동 채택하지 않습니다. 버전을 비교하고 필요한 프로젝트에 명시적으로 지정합니다.

Skills의 업데이트 후보는 `latest_import`와 `latest_approved`를 구분합니다. 최신 import가 아직 검토되지 않았더라도 현재 고정 리비전보다 새로운 approved 후보를 함께 확인할 수 있습니다. 후보 표시만으로 채택되지는 않으며, 승인된 리비전 채택도 새 템플릿 버전을 만들고 프로젝트의 기존 고정을 자동 변경하지 않습니다.

```bash
node apps/skills-catalog/src/cli.js preset compare PRESET_ID 1 2 \
  --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js preset assign skills-platform-codex PRESET_ID \
  --catalog ./.skills-platform/catalog --version 2 --role default
node apps/skills-catalog/src/cli.js project resolve skills-platform-codex \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

개별 예외는 정확한 Registry revision의 원하는 상태만 바꾸며, 계획을 적용하기 전에는 provider 상태를 바꾸지 않습니다.

```bash
node apps/skills-catalog/src/cli.js project skill skills-platform-codex \
  enable LINEAGE_ID --skill REGISTRY_SKILL_ID \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js project skill skills-platform-codex \
  inherit LINEAGE_ID --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

`disable`은 프로젝트별 비활성화 예외, `inherit`은 예외를 제거하고 템플릿 선택으로 돌아가는 동작입니다.

### 읽기용 설명과 정적 분석

Annotation과 analysis는 원본 밖의 읽기용 기록이며 스킬 원본·프롬프트·템플릿·호출 정책·전달을 바꾸지 않습니다.

```bash
node apps/skills-catalog/src/cli.js skill annotation add LINEAGE_ID \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --revision REVISION_ID --kind plain_language --locale ko-KR \
  --body "스킬의 목적과 사용 시점을 쉽게 설명합니다."
node apps/skills-catalog/src/cli.js skill analysis list LINEAGE_ID \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

Usage note는 별도 기능입니다. note를 프롬프트에 포함하도록 명시한 경우에만 해당 프롬프트 생성 경로에서 사용할 수 있습니다. Reader annotation은 항상 실행 효과가 없으며 프롬프트 복사·recipe·적용 계획에 들어가지 않습니다. 프롬프트 복사 역시 provider에 스킬을 설치하는 동작이 아닙니다.

추가 CLI 예제는 [Catalog 참조](../apps/skills-catalog/README.md)의 profile·note·feedback·evaluation·overlay 절을 사용합니다. 운영 복구는 [macOS·control-plane 운영](./guides/macos-and-control-plane-guide.md), hook은 [Codex hook 가이드](./guides/codex-hooks-guide.md), 원본·동결 버전 관리는 [스킬 참조·전달 가이드](./guides/skill-reference-and-delivery-guide.md)로 이어집니다.
