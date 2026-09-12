# 추천 스킬셋과 정렬 가이드

Skills Platform의 추천은 **프로젝트에 필요한 최소 기본셋을 먼저 선택하고, 특정 작업에 필요한 스킬만 추가하는** 방식입니다. 이 가이드는 저장소의 실제 `SKILL.md`, recipe, Catalog 선택 로직을 검토하여 작성했습니다. 설치 수나 이름의 유사성으로 모든 스킬을 일괄 설치하지 않습니다.

설치 경로는 [설치 가이드북](./skills-installation-guide.md), 등록·검토·계획·적용·발견 확인은 [활용 가이드](../skills-usage.md)를 따릅니다. 이 문서의 추천 순서는 사람이 후보를 찾는 순서이며 에이전트의 실행 순서가 아닙니다.

## 1. 추천을 읽는 순서

| 순서 | 분류 | 선택 기준 |
| --- | --- | --- |
| 1 | 최소 기본셋 | 현재 프로젝트를 운영하는 동안 반복적으로 필요한 안내와 작성·검토 역할 |
| 2 | 작업별 후보 | 지금 수행하는 작업에 맞고 기존 기본셋에 없는 역할 |
| 3 | 전용 환경 후보 | Skills Manager, Antigravity, OpenWiki 등 실제 대상 환경이 일치하는 역할 |
| 4 | 보류·제외 | 의존 도구·프로젝트 설정이 없거나, 기존 역할과 겹치거나, 원본 검토가 더 필요한 패키지 |

같은 분류 안에서는 **작업 적합성 → provider·도구·프로젝트 호환성 → 출처·리비전 검토 근거 → 기존 스킬과의 중복 → 실제 사용 근거** 순서로 비교합니다. 역할을 충족하는 후보가 이미 있으면 이름이 비슷한 다른 스킬을 추가할 필요가 없습니다.

Catalog에 저장한 family·출처 태그는 탐색을 돕는 분류입니다. `review_state`는 실제 검토한 수준을 유지하고, 태그 정리만으로 `reviewed`나 `healthy`로 승격하지 않습니다. 과거 전체 목록이나 추천 표를 현재 설치 목록으로 사용하지 않습니다.

## 2. Skills Platform Codex 프로젝트의 최소 기본셋

기본 프리셋 ID는 `skills-platform-authoring-codex`입니다. 이름은 기존 호환성을 위해 유지하며, 현재 선언은 운영 안내까지 포함합니다. 아래 순서는 사용 흐름입니다.

| 스킬 | 역할 | 사용할 때 |
| --- | --- | --- |
| [`skills-platform-guide`](../../skills-packages/platform-core/skills-platform-guide/SKILL.md) | 플랫폼 목적·설치 경로·상태 확인 안내 | 스킬 탐색·설치·업데이트·인식 문제 |
| [`skill-authoring-standard`](../../skills-packages/platform-core/skill-authoring-standard/SKILL.md) | provider별 작성·구조·검증 규칙 연결 | 스킬 생성·수정·정적 검증 |
| [`writing-great-skills`](../../skills-packages/community-codex/writing-great-skills/SKILL.md) | Codex 지침의 발견 범위·구조·완료 조건·중복 검토 | 명시적인 스킬 품질 리뷰 |

이 세 개는 **Skills Platform을 유지보수하는 Codex 프로젝트**의 기본셋입니다. 일반 애플리케이션이나 Antigravity 프로젝트에 그대로 복제하는 범용 필수셋은 아닙니다. Antigravity 선언은 앞의 두 패키지를 선택하며, `writing-great-skills`의 Codex 호출 정책을 옮기지 않습니다.

[`skills-platform-authoring-recipe.json`](../../skills-platform-authoring-recipe.json)으로 원본 locator와 digest를 유지하여 등록합니다. 기존 Catalog의 실제 프리셋 버전은 재조정 이력에 따라 달라질 수 있으므로 조회한 버전을 기준으로 합니다. 기본셋 선언을 수정하거나 등록하는 것과 호스트 설치가 완료되는 것은 별도 단계입니다.

## 3. 작업별 추천 후보

| 작업 | 우선 후보 | 추천 상태와 전제 | 함께 설치하지 않는 이유 |
| --- | --- | --- | --- |
| 재현 가능한 버그·성능 회귀 진단 | [`diagnosing-bugs`](../../skills-packages/community-codex/diagnosing-bugs/SKILL.md) | `skills-platform-debugging-codex` 추천 프리셋. 재현 명령·최소 사례·가설·회귀 검증이 필요한 때 선택 | 진단 작업이 없는 세션의 기본 역할은 아님 |
| 모듈 경계·테스트 가능한 설계 검토 | [`codebase-design`](../../skills-packages/community-codex/codebase-design/SKILL.md) | architecture 작업의 선택 후보. 기존 프로젝트 용어와 설계 관례를 먼저 확인 | 자체 용어 체계를 요구하므로 모든 문서·코드 작업에 주입하지 않음 |
| 명시적인 test-first 개발 | [`tdd`](../../skills-packages/community-codex/tdd/SKILL.md) | 테스트할 public seam이 정해진 작업에서 선택. 원본은 seam의 사용자 확인을 요구함 | 단순 문서 수정이나 이미 합의된 일반 검증을 모두 TDD 작업으로 확대하지 않음 |
| 공식 문서·API 조사 결과 기록 | [`research`](../../skills-packages/community-codex/research/SKILL.md) | 1차 출처 접근과 background agent가 가능한 조사 작업 | 조사 목적이 없는 구현·유지보수에는 추가하지 않음 |
| 기존 표·목록의 항목 순서만 정리 | [`reorder`](../../skills-packages/paperthin/reorder/SKILL.md) | 항목·문구·개수는 그대로 두고 하나의 정렬 기준을 적용할 때 | 추천 항목 추가·제거·설명 개선은 이 스킬의 범위를 넘음 |

후보를 실제 프로젝트에 전달하기 전에는 **그 리비전의** 패키지 구조·지원 리소스·provider 검사 결과와 기존 설치 충돌을 확인합니다. 이 표의 manifest 검토는 실제 호출 성공률이나 작업 시간 개선을 측정한 결과가 아닙니다.

`diagnosing-bugs`는 실패를 판별하는 명령을 먼저 만들고, 원래 증상과 최소 사례를 구분하여 검증합니다. 원본의 HITL 스크립트는 사람이 조작해야 재현되는 경우의 마지막 수단이므로, 패키지 등록만으로 실행하지 않습니다.

`reorder`의 원본 frontmatter에 있는 `disable-model-invocation`만으로 Codex 명시 호출 전용이 보장되지는 않습니다. 해당 호스트의 호출 정책을 검증한 후 사용하며, Catalog 목록 정렬 기능을 이 스킬이 자동 제어한다고 해석하지 않습니다.

## 4. 전용 환경 후보와 기본 제외 사유

| 패키지 또는 계열 | 적합한 범위 | 현재 기본셋에서 제외하는 이유 |
| --- | --- | --- |
| [`skills-manager-architecture`](../../skills-packages/skills-manager/skills-manager-architecture/SKILL.md), [`skills-manager-testing`](../../skills-packages/skills-manager/skills-manager-testing/SKILL.md) | `apps/skills-manager`의 provider 모델·Rust/Tauri 서비스·CLI/UI 동작 | Skills Manager의 설계 문서·테스트 행렬을 전제함. Catalog root 개발용 규칙으로 그대로 적용하지 않음 |
| [`skills-manager-ui`](../../skills-packages/skills-manager/skills-manager-ui/SKILL.md), [`skills-manager-tauri`](../../skills-packages/skills-manager/skills-manager-tauri/SKILL.md) | 해당 submodule의 React 또는 Rust 변경 | Catalog UI는 별도 bridge 구조이므로 Tauri invoke 중심 지침과 다름 |
| [`code-review`](../../skills-packages/community-codex/code-review/SKILL.md) | 기준 ref와 요구사항 출처를 정한 2축 리뷰 | 원본이 전제하는 `docs/agents/issue-tracker.md`가 이 저장소에 없어 설정 검토가 먼저 필요함 |
| [`worktree-lifecycle-orchestrator`](../../skills-packages/platform-core/worktree-lifecycle-orchestrator/SKILL.md), Antigravity builtin 계열 | Antigravity 작업·도구가 준비된 환경 | provider와 CLI·권한·merge 운영 계약이 Codex 기본 흐름과 다름 |
| [`logical-completion-core`](../../skills-packages/platform-core/logical-completion-core/SKILL.md) 및 LCH 계열 | 외부 상태·검증 ledger를 갖춘 복합 작업 | 원본의 상태 API·호스트 경로를 실제 런타임 기능과 대조해야 함. 전 계열 설치를 전제로 하지 않음 |
| [`find-skills`](../../skills-packages/shared-agents/find-skills/SKILL.md) | 외부 생태계 탐색 | 자체 운영 가이드와 역할이 겹치고 원본의 인기 지표 중심 기준을 별도 검토해야 함 |
| `skill-creator`, `skill-installer`, `openai-docs`, `imagegen`, `plugin-creator` 저장소 사본 | 원본 비교·업데이트 검토 | 호스트가 이미 제공하는 동명 스킬과 중복 가능. 발견된 system/plugin 스킬을 먼저 확인 |
| Paperthin 전체·OpenWiki 전체 등 family 단위 | 해당 작업 체계를 의도적으로 채택하는 프로젝트 | family 태그가 같다는 이유만으로 모든 역할이 현재 작업에 필요한 것은 아님 |

보류는 영구 금지가 아닙니다. 대상 프로젝트·도구·의존성이 충족되고 원본을 검토하면 해당 작업의 후보로 다시 판단합니다. 반대로 정적 검사에서 `conformant`가 나와도 런타임 의존성이나 작업 적합성이 자동으로 충족되는 것은 아닙니다.

## 5. Catalog에서 정렬·추천·선택이 작동하는 방식

| 설정 또는 결과 | 실제 기능 | 의미하지 않는 것 |
| --- | --- | --- |
| 스킬 profile의 purpose, use-when, tags, provider, review state | 설명·검색·검토에 쓰는 메타데이터 | 추천 점수 기반 자동 설치 |
| UI·API·CLI 검색 결과 | 공용 필터와 profile title 이름순 정렬 | 관련도·health 순위 또는 사용자 지정 순서 저장 |
| preset 목록 | 이름 기준 정렬, `Pristine` 별도 표시 | 사용 빈도나 품질 순위 |
| project assignment `role: recommended` | 프로젝트에 추천 프리셋 연결을 기록 | effective set에 자동 포함 |
| project assignment `role: default` | 기본 선택에 포함되는 고정된 프리셋 버전 | 새 템플릿 버전 자동 채택 |
| project assignment `role: work_scope_overlay` | 요청한 작업 태그에 맞으면 기본 선택 위에 합성 | 태그가 없는 일반 요청에서도 항상 선택되는 추천 |
| overlay의 `priority` | 동일 lineage 충돌 시 합성 우선순위 | 모델의 실행 순서나 스킬 품질 점수 |
| feedback·evaluation·health | 제공된 실행 근거와 검토 필요 상태 표시 | 근거가 없는 성공률, 자동 승인·선택·차단 |

`recommended` 프리셋은 후보 연결과 실제 선택을 분리하기 위한 기록입니다. 필요할 때 사용자가 default로 지정하거나 작업 overlay로 연결하고, resolve·preview·apply를 거쳐야 실제 전달 대상으로 바뀝니다.

현재 Catalog와 Skills Manager의 [Skill Set Release assignment](../../apps/skills-manager/src-tauri/src/services/skill_sets.rs)는 `recommended`를 미선택 후보, `work_scope_overlay`를 작업 범위에 맞춰 합성하는 역할로 구분합니다. Skills Manager store는 schema 3을 사용합니다. v0/v1의 기존 `recommended`는 `work_scope_overlay`로 대응시켜 선택을 보존하고, v2의 `recommended`는 계속 미선택 후보로 유지합니다. 읽기만으로 과거 파일을 다시 저장하지 않으며 다음 정상 변경에서 현재 schema로 저장합니다. Skills Manager의 일반 Presets는 별개의 provider별 활성화 구성입니다.

출처 검토는 프로젝트의 `review_policy`로 적용 범위를 정합니다. 기본 `advisory`는 기존 동작을 유지합니다. 현재 Skills Platform의 `require_approved` 정책에서는 Catalog가 계획을 만들고 저장·적용할 때 enabled 대상의 정확한 source revision에 대한 최신 결정이 `approved`인지 확인하고, deprecated profile·선택 preset을 차단합니다. disabled 연산은 허용합니다. source revision 승인, profile의 `review_state`, preset의 `lifecycle`을 구분하며, 분류값 `reviewed`는 source 승인을 대신하지 않습니다. 정책 설정과 같은 계획의 적용은 [활용 가이드](../skills-usage.md)를 따릅니다.

현재 UI에 사용자 지정 스킬 정렬 순서를 저장하는 기능은 없습니다. family·역할 태그로 목록을 찾기 쉽게 만든 결과를 수동 순위 정렬 기능이 구현된 것으로 보고하지 않습니다. UI·API·CLI는 provider를 profile의 `provider_constraints`에 있는 정확한 값으로 필터링하고, 일반 검색은 메타데이터와 삭제되지 않은 note 내용을 함께 검색합니다. provider 조건이 비어 있으면 지원 여부를 추정하여 포함하지 않습니다.

Overlay의 세부 규칙은 다음과 같습니다.

- 실제 조건은 **프로젝트 assignment의** `work_scope_tags`입니다. profile이나 preset 자체의 작업 태그만 편집해도 자동 연결되지는 않습니다.
- assignment의 태그가 모두 요청 태그에 포함되어야 일치합니다. 여러 태그는 AND 조건입니다.
- 빈 assignment 태그는 모든 작업 범위에 일치하므로 특정 작업용 overlay에는 태그를 지정합니다.
- 낮은 priority부터 합성하고 같은 lineage는 나중 항목이 덮으므로 높은 숫자가 우선합니다. 프로젝트 개별 override는 이후에 적용됩니다.
- UI는 일치하는 overlay 전체와 priority를 합성 순서대로 표시하고 각 스킬의 최종 `selected_by` 출처를 보여줍니다. 편집기는 현재 작업 태그 하나의 overlay를 교체하며, 여러 태그와 명시 priority 설정은 CLI를 사용합니다.

Skills Manager의 다중 작업 범위는 선택적 `work_scope_tags` 배열을 기준으로 합니다. 배열이 있으면 기존 `work_scope` 문자열보다 우선하며, 모든 태그가 요청에 포함되어야 합니다.

| Manager assignment의 작업 범위 | 해석 |
| --- | --- |
| `work_scope_tags: ["debugging", "ui"]` | 요청에 두 태그가 모두 있어야 overlay가 일치 |
| `work_scope_tags: []` | 명시적인 모든 작업 범위 |
| 배열 없이 `work_scope: "debugging"` | 기존 단일 태그 |
| 배열 없이 `work_scope: "debugging,ui"` | 쉼표를 포함한 하나의 문자열. 두 태그로 분할하지 않음 |
| 배열 없이 빈 `work_scope` | 모든 범위로 바꾸지 않음. 기존 overlay는 불일치하며 해당 overlay 적용·새 overlay 할당·effective set 조회에 필요한 범위가 없으면 거절 |

Catalog에서는 반복 `--work-scope`로 다중 태그를 지정합니다. 단일 문자열에 쉼표를 넣어 여러 태그를 표현하지 않습니다. `recommended`는 범위가 일치하더라도 자동 선택되지 않는 역할입니다.

이 규칙은 source code의 [프로젝트 선택 해석](../../apps/skills-catalog/src/catalog-workflows.js)과 [프로젝트·프리셋 상태](../../apps/skills-catalog/src/catalog-state.js)를 기준으로 합니다. 사람에게 보이는 순서를 바꾸기 위해 priority를 조정하면 실제 충돌 해석까지 바뀔 수 있으므로 별도로 다룹니다.

출처 업데이트 화면은 최신 import와 최신 approved 후보를 함께 표시합니다. 현재 고정 리비전보다 새로운 후보를 구분하여 보여주므로, 최신 import가 아직 미검토라고 해서 그보다 앞선 approved 후보를 놓치지 않게 합니다. 후보가 표시된 것만으로 템플릿 버전이나 프로젝트 선택이 바뀌지는 않습니다.

## 6. 조회하고 필요할 때만 선택하기

모든 명령은 Skills Platform 저장소 루트에서 실행합니다. 먼저 현재 상태를 읽습니다.

```bash
node apps/skills-catalog/src/cli.js skill list \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js preset list \
  --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js preset show skills-platform-debugging-codex \
  --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js project resolve skills-platform-codex \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
```

추천 프리셋이 없는 다른 머신에서는 해당 선언을 검사·등록한 후 조회합니다. 아래 예제는 **debugging 작업에 추천 프리셋을 실제로 선택하려는 경우**의 상태 변경이며, 추천 기록만 남기려면 실행하지 않습니다. `PRESET_VERSION`은 조회한 실제 버전으로 바꿉니다.

```bash
node apps/skills-catalog/src/cli.js preset assign \
  skills-platform-codex skills-platform-debugging-codex \
  --catalog ./.skills-platform/catalog \
  --version PRESET_VERSION --role work_scope_overlay \
  --work-scope debugging --priority 10
node apps/skills-catalog/src/cli.js project resolve skills-platform-codex \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --work-scope debugging
```

그다음 같은 work scope로 계획을 저장하고 preview합니다. `--enabled-only`는 선택한 enabled 스킬만 포함합니다. strict 프로젝트에서는 먼저 선택한 source revision의 승인 상태를 확인하고, 응답의 `plan_id`를 `PLAN_ID`로 사용합니다.

```bash
node apps/skills-catalog/src/cli.js history record-plan skills-platform-codex \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --work-scope debugging --enabled-only \
  --out ./.skills-platform/debugging-plan.json
node apps/skills-catalog/src/cli.js history apply PLAN_ID \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
```

원래 기본셋과 debugging 후보가 정확히 선택되었는지, revision·digest·대상 경로·충돌을 확인한 뒤 같은 `history apply PLAN_ID`에 `--confirm`을 추가하여 적용합니다. 저장된 계획의 무결성과 현재 검토 정책을 다시 검사하고 보고서를 이력에 남깁니다. 자세한 [같은 계획 적용 절차](../skills-usage.md#5-계획을-확인하고-적용하기)를 참고하고 파일 전달 후 호스트 발견과 실제 호출을 따로 확인합니다. 독립 adapter CLI는 Catalog 승인 정책을 모르는 기계적 전달 검증 도구이므로 이 경로의 대체물로 사용하지 않습니다.

공유 경로의 실제 변경이 preview에 나타나면 provider·경로별 영향 목록을 확인합니다. UI의 동의는 새 preview에만 반영하고, CLI는 **새 계획을 만들 때** `--confirm-shared-root`를 지정합니다. 기존 `history apply` 호출에 이 옵션을 추가하여 계획을 바꿀 수는 없습니다. 알려진 직접·간접 symlink 소비자 영향은 표시하지만, 기존 상태가 같은 Manager `noop`에는 공유 변경 동의를 요구하지 않습니다.

작업 태그를 바꾸는 것은 **원하는 선택**을 다시 계산하는 동작입니다. 이미 설치한 overlay 스킬을 자동으로 제거하지 않습니다. `--enabled-only` 기본셋 계획을 적용해도 기존 debugging binding은 남을 수 있으므로 작업 후 제거가 필요하면 전체 계획의 disable 대상을 검토하여 조정합니다.

동시에 분류·추천·검토를 수정해도 Catalog는 파일 잠금 안에서 최신 snapshot을 기준으로 변경을 저장합니다. 계획은 한 선택 snapshot에서 생성·기록하고, 같은 실제 전달 루트의 reference·bridge 적용은 공유 잠금으로 직렬화합니다. 연결된 UI는 늦게 도착한 이전 프로젝트·작업 범위 응답을 새 상태로 사용하지 않으며, 현재 상태가 준비되지 않거나 선택·공유 동의·영향이 바뀌면 변경·적용 준비 상태를 해제합니다. 이 동작을 시스템 외부의 비관리 파일 변경까지 포함한 원자성 보장으로 확대하지 않습니다.

## 7. 실제 적용 결과와 재현

### 2026-09-08 초기 실험 기록

아래는 후속 정책·UI·recipe 보완 전에 이 checkout에서 실행한 결과입니다. 다른 머신의 현재 설치 수나 현재 기능 한계를 뜻하지 않습니다. 당시 근거는 [초기 시스템 평가](../reports/2026-09-08-skill-platform-evaluation.md), lineage별 분류 결과는 [분류 증거 JSON](../reports/2026-09-08-skill-curation.json)에 있습니다. 후속 결과는 [hardening 보고서](../reports/2026-09-08-platform-hardening.md)와 [stabilization 보고서](../reports/2026-09-08-platform-stabilization.md), 현재 동작은 앞 절의 지침을 기준으로 합니다.

| 항목 | 적용 전 | 적용 후 |
| --- | --- | --- |
| Catalog 스킬 inventory | 79 | 81 |
| 태그가 있는 profile | 3 | 81 |
| purpose가 있는 profile | 3 | 9 |
| `reviewed` profile | 3 | 5 |
| 프로젝트에 설치된 기본 스킬 | 2 | 3 |

분류를 정리한 나머지 76개 profile은 `unreviewed`를 유지했습니다. source·family 태그를 채운 것이 전체 스킬의 내용·동작 검증을 완료했다는 뜻은 아닙니다.

| collection 태그 | 당시 inventory 수 |
| --- | ---: |
| `collection:platform-core` | 3 |
| `collection:community-codex` | 6 |
| `collection:paperthin` | 29 |
| `collection:baseline-suite` | 31 |
| `collection:maintenance-suite` | 12 |

`collection:platform-core`는 출처 분류이고 `skills-platform:base`는 기본 역할 분류입니다. 둘 다 당시 3개지만 구성은 다릅니다. 기본셋의 `writing-great-skills`는 `community-codex` 출처이며, `platform-core` 출처의 `svg-authoring`은 기본셋에 포함되지 않습니다.

정리한 결과는 새 정렬 엔진 없이 기존 native 검색으로 조회합니다.

```bash
node apps/skills-catalog/src/cli.js skill search \
  --tag collection:platform-core \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js skill search \
  --tag skills-platform:base \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js skill search \
  --tag skills-platform:debugging \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
```

기본 프리셋의 **로컬 버전 3**으로 세 스킬을 선택하여 reference adapter로 적용했습니다. 계획 `759d4c0b-b1e4-41fc-befe-13d8397946f5`에서 기존 binding 1개를 교체하고 1개를 생성했으며, 이미 일치한 1개는 건너뛰었습니다. 다시 preview한 결과는 `noop` 3개였고 전달 대상 세 개의 digest가 계획과 일치했습니다.

`skills-platform-debugging-codex` **로컬 버전 2**는 `recommended`, priority `10`, 태그 `debugging`으로 연결했습니다. 기본 effective set에 추가되지 않고 실제 파일도 설치되지 않는 것을 확인했습니다. 기본셋 외 후보를 함께 설치한 실험은 아닙니다.

UI에서는 `collection:platform-core` 필터로 `3/81` 결과를 확인했고 Projects에서 기본 세 스킬의 선택과 적용 이력을 확인했습니다. 설치된 `skills-platform-guide`는 명시적 파일 읽기와 독립 에이전트의 검사를 통과했으며, 새 에이전트의 Available skills 목록에도 나타났습니다. 일반 자연어 요청에서의 자동 호출, 다른 기본 두 스킬의 실제 작업 효과는 아직 검증하지 않았습니다. 당시 upstream Skills Manager inspector는 사용할 수 없어 운영 bridge의 실제 적용·binding 조회까지 통과한 결과로 확대하지 않습니다.

### 선언을 다른 환경에서 재현하기

작성용 패키지 구성은 [`skills-platform-authoring-recipe.json`](../../skills-platform-authoring-recipe.json), 현재 프로젝트의 기본셋과 추천 연결은 [`skills-platform-project-recipe.json`](../../skills-platform-project-recipe.json), debugging 후보만 필요한 경우에는 [`skills-platform-debugging-recipe.json`](../../skills-platform-debugging-recipe.json)을 사용합니다. 작성용 선언은 검토 참조 `skill-creator`와 Antigravity 프리셋까지 유지하며, 프로젝트 export는 현재 프로젝트에 연결한 기본 세 개와 debugging 추천을 재현하는 별도 목적입니다. debugging 원본은 상대 locator로 최초 등록했으므로 저장소를 함께 복제한 환경에서 같은 출처 표기를 유지합니다.

현재 recipe schema 1은 선택적 `skills[].profile`과 프로젝트 `preset_assignments`를 지원합니다. 프로젝트로 export하면 고정된 템플릿 버전, 역할·priority·작업 태그·enabled 상태, 프로젝트 상대 전달 경로와 `review_policy`를 재현할 수 있습니다. 실제로 고정한 이전 버전도 보존하며, 같은 숫자의 다른 snapshot이 대상 Catalog에 있으면 기존 이력을 덮지 않고 대응하는 로컬 버전을 사용합니다.

profile의 `review_state`는 분류로 내보낼 수 있지만 source 승인 결정·평가 근거·실행 이력은 export하지 않습니다. 새 Catalog의 strict 프로젝트에서는 import한 정확한 source revision을 검토·승인한 다음 계획을 생성합니다. 선택적 필드가 없는 기존 recipe는 선언하지 않은 profile 필드와 기존 추가 assignment를 유지하고, 명시적인 `preset_assignments` 목록은 전체 선택 선언으로 적용합니다. 기존 strict 정책은 recipe의 advisory 선언이나 필드 생략으로 낮아지지 않습니다.

debugging 후보만 export한 recipe에는 프로젝트 선언이 없습니다. 이 파일로 등록할 때는 `--path`를 생략하고 추천 연결을 따로 기록합니다. `--path`를 넣으면 recipe의 첫 프리셋을 프로젝트 기본값으로 지정하는 기존 fallback 동작이 있으므로 추천만 추가하려는 목적에 사용하지 않습니다.

```bash
node apps/skills-catalog/src/cli.js recipe inspect \
  ./skills-platform-debugging-recipe.json
node apps/skills-catalog/src/cli.js recipe apply \
  ./skills-platform-debugging-recipe.json \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
```

다음은 대상 프로젝트가 이미 등록되어 있고 후보 프리셋의 실제 버전을 조회한 뒤 실행하는 추천 연결입니다. 이 명령은 설치하지 않습니다.

```bash
node apps/skills-catalog/src/cli.js preset assign \
  skills-platform-codex skills-platform-debugging-codex \
  --catalog ./.skills-platform/catalog --version PRESET_VERSION \
  --role recommended --priority 10 --work-scope debugging
```

recipe import 후 프로젝트에 연결하지 않은 프리셋과, `recommended`로 연결한 프리셋과, 실제 선택된 overlay는 서로 다른 상태입니다.

일반 `import-local`은 절대 source locator를 사용하며 recipe export도 그 값을 보존합니다. 머신 경로가 들어간 export는 다른 머신에서 그대로 재현된다고 가정하지 않습니다. source locator를 임의로 상대 경로로 바꾸면 새 source·lineage가 생길 수 있으므로 기존 기록을 먼저 대조합니다.

### 이후 작업 품질 평가

추천을 평가할 때는 다음 근거를 나누어 기록합니다.

| 확인 대상 | 필요한 근거 |
| --- | --- |
| 분류가 유용함 | family·역할로 필요한 후보를 찾을 수 있고 중복·보류 사유가 보임 |
| 기본셋이 맞음 | `project resolve`와 plan이 의도한 리비전만 선택함 |
| 추천이 자동 설치되지 않음 | `recommended` 추가 전후 기본 effective set이 동일함 |
| 파일 전달 성공 | 같은 계획의 adapter report와 대상 binding 검사 |
| 호스트 발견·실제 사용 | 호스트 목록, 명시 호출 또는 실제 작업의 사용 기록 |
| 작업 품질 개선 | 이전과 비교할 수 있는 작업 결과·독립 검증·실패 기록 |

등록·분류·계획·파일 전달 실험만으로 작업 품질 개선까지 입증했다고 보고하지 않습니다. 실패나 미검증 단계는 그 상태로 남겨 다음 보완의 근거로 사용합니다.
