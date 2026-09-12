# Skills Platform 후속 보완과 실제 적용 — 2026-09-08

[초기 사용 평가](./2026-09-08-skill-platform-evaluation.md)의 우선 보완 항목을 구현했다.
현재 프로젝트에 검토 필수 정책을 적용했고, 이전에 미검증이었던 **UI → Catalog → Skills
Manager CLI 전달과 사후 검증**까지 완료했다. 기본 설치는 3개이며 디버깅 추천은 미설치다.

## 구현한 보완

| 영역 | 변경된 동작 |
| --- | --- |
| 검토 정책 | 프로젝트 `review_policy`가 `require_approved`이면 enabled 대상의 정확한 revision에 대한 최신 source 승인을 확인한다. 폐기된 스킬·선택 프리셋과 대상/Registry 불일치를 차단한다. 기존 누락 정책은 `advisory`로 호환한다. |
| 적용 직전 재검사 | Catalog 계획 생성·기록·적용에서 같은 검사를 사용한다. preview 이후 승인 철회도 실제 연산 직전에 다시 검사한다. 비활성화 복구는 허용한다. |
| 우회 방지 | strict 범위의 직접 `project link`, 동일 전달 루트의 advisory 별칭, symlink 별칭, ID 없는 raw 계획이 정책을 우회하지 못하도록 검사한다. |
| 고정 계획과 이력 | `history record-plan --enabled-only --out`과 `history apply PLAN_ID [--confirm]`으로 같은 계획을 미리 보고 적용·보고서를 기록한다. |
| 실패 전파 | 실패한 recipe 전달은 `applied=false`이고 보고서를 남긴다. 후속 hooks·lifecycle runner는 진행하지 않으며 CLI는 실패 JSON과 exit 1을 반환한다. |
| 추천 역할 | Catalog와 Skills Manager에서 `recommended`는 미활성 후보, `work_scope_overlay`는 범위 일치 시 합성이다. Manager 구 v0/v1 추천은 기존 활성 동작을 유지하는 overlay로 읽는다. |
| 검색·표시 정렬 | UI·HTTP API·CLI가 공용 matcher를 사용한다. provider는 profile 조건, 검색은 목적·조건·태그·도메인·활성 note를 포함하며 제목순 정렬을 공유한다. note 저장 후 목록도 갱신한다. |
| 선택 이유 | 적용 overlay 전체의 버전·priority·범위와 스킬별 최종 `selected_by` 근거를 표시한다. |
| 승인된 업데이트 후보 | 최신 import와 최신 approved update를 구분해 제시한다. 같은 timestamp에서는 기록 순서를 사용하며, 현재 pin보다 과거인 승인본은 업데이트로 오인시키지 않는다. |
| 구성 재현 | recipe v1 optional 필드로 profile과 assignment의 역할·priority·태그·enabled·고정 버전, 상대 전달 경로와 정책을 보존한다. 동일 preset의 여러 버전도 재현한다. |

검토 강제는 **Catalog를 사용하는 경로의 정책**이다. 독립 reference adapter는 Catalog를
모르는 기계적 전달 도구이므로 이 정책의 대체물이 아니다. 각 연산 직전의 재검사는
다중 프로세스의 Catalog 상태와 파일 변경을 하나의 원자적 트랜잭션으로 만드는 것은 아니다.
recipe에 profile의 `reviewed` 분류가 있어도 실제 source 승인이나 평가 증거를 가져오지는 않는다.

주요 코드: [검토 정책](../../apps/skills-catalog/src/activation-policy.js),
[CLI](../../apps/skills-catalog/src/cli.js), [레시피](../../apps/skills-catalog/src/recipes.js),
[공용 검색](../../packages/skill-contracts/src/skill-search.mts),
[업데이트 후보](../../apps/skills-catalog/src/source-review.js),
[프로젝트 표시](../../apps/catalog-ui/src/components/ProjectWorkspace.tsx).

## 현재 프로젝트 적용

| 항목 | 값 |
| --- | --- |
| Catalog 프로젝트 | `skills-platform-codex` |
| 검토 정책 | `require_approved` |
| 기본 preset | `skills-platform-authoring-codex@4` |
| 기본 설치 | `skills-platform-guide`, `skill-authoring-standard`, `writing-great-skills` |
| 추천 preset | `skills-platform-debugging-codex@2`, role `recommended`, priority 10, tag `debugging` |
| Manager 연결 ID | `workspace-4844cf93282d94de` |
| 프로젝트 스킬 경로 | `.agents/skills` |

자체 안내 스킬에도 검토 정책, 같은 계획 적용, 추천 역할과 구성 재현 방법을 반영했다.
새 revision `revision_373918045a7b3386e94dc6a0`을 검토한 뒤 strict 경로로 교체했다.

| 실행 증거 | 결과 |
| --- | --- |
| strict 기존 구성 계획 `93a205c2-5900-4692-9f9a-f0a25610a398` | completed, 변경 0·유지 3·실패 0 |
| 안내 스킬 갱신 계획 `dd03f1bc-0655-4ae0-b081-607fc266dd63` | completed, 변경 1·유지 2·실패 0 |
| UI bridge 계획 `3e539317-6bb5-4985-b319-2014cb435b56` | Skills Manager CLI completed, 요청 81·변경 0·유지 81·실패 0 |
| UI bridge 보고서 | `activation_report_a7bb7ca7-59a4-4fb9-962f-eb50d11028ab` |
| UI bridge 사후 검증 | `verified: true` |
| 최종 파일 검증 | 기본 3개 모두 계획한 revision/digest와 일치 |

UI의 전체 계획은 선택 3개와 비선택 78개를 나타낸다. 81개의 설치가 있다는 의미가 아니다.
실제 전달 상태가 이미 맞았으므로 UI apply는 모두 skip으로 완료됐다. 새로운 파일 생성과
경로 변경은 별도의 임시 환경 통합 테스트에서도 검증했다.

현재 구성의 재현 파일은 [프로젝트 recipe](../../skills-platform-project-recipe.json)다.
기존 [authoring recipe](../../skills-platform-authoring-recipe.json)는 비교용 `skill-creator`와
Antigravity preset도 보존하는 원본 관리 선언으로 유지한다. 프로젝트 export는 실제 연결된
기본·추천 preset의 profile과 assignment를 담으며, 81개 전체 Registry 백업은 아니다.

새 프로젝트 recipe를 임시 Catalog에 적용해 profile 4개, 기본 v4, 디버깅 추천 v2와
priority 10을 재현했다. 가져온 source 승인 기록은 0개였고 strict preview는 승인 전
차단됐다. 해당 revision을 명시적으로 검토한 뒤 preview가 통과했다. 이 검증에서는
호스트 파일을 설치하지 않았다.

## Inspector와 전달 경로 수정

초기 실패 원인은 실행파일 부재가 아니라 `.skills-manager/config.json` 초기 설정 부재였다.
지원 CLI로 프로젝트를 등록하고 새 `project bind-manager`로 기존 Catalog 프로젝트에
연결했다. 읽기 전용 조회가 초기화나 설치를 수행하지 않도록, 설정이 없는 경우에는
수행할 초기화·연결 명령을 오류에 안내한다.

실제 preflight에서는 Manager가 Codex의 `.codex/skills`를 제시하는 추가 불일치를 발견했다.
적용하지 않은 상태에서 다음을 수정했다.

- Codex **프로젝트 skill root**를 `.agents/skills`로 분리했다. `.codex/config.toml`과
  전역 설정, repository root가 없는 legacy binding의 경로는 보존한다.
- upstream preview가 제공한 root가 계획과 다르면 적용 전에 거절한다.
- 사후 binding의 ID가 같아도 반환된 target path가 다르면 검증 성공으로 처리하지 않는다.

inspector를 다시 빌드한 후 세 스킬 모두의 root/digest 일치를 확인하고 UI에서 같은 계획을
실제로 적용했다. 코드와 검증은 [WorkspaceService](../../apps/skills-manager/src-tauri/src/services/workspace.rs),
[upstream bridge](../../apps/skills-catalog/src/upstream-apply.js),
[inspector 진단](../../apps/skills-catalog/src/upstream-inspector.js)에 있다.

## UI 결과 표현

초기 보완의 0건 지표 처리를 유지한다. 표본이 없으면 성공률·지연은 `— / No data`,
활성 provider는 0이다. 이번 UI 검증에서는 preflight만 끝났는데 적용 81건으로 표시하던
추가 문제도 발견했다. 미리보기 결과와 실제 apply 결과를 별도 상태로 표현하여 계획·사전
검증 수와 실제 적용·유지·실패 수를 혼동하지 않도록 수정했다. 미리보기는
`Preview Complete: 81 planned · preflighted`로 표시하고 Plan·Inspect·Preview 3단계만
완료한다. 실제 성공 보고서가 있어야 `Activation Complete`와 적용 수를 표시한다.
실패·부분 적용 보고서와 재시도도 별도로 유지한다.

최종 검토에서 adapter의 승인 재검사가 전달을 차단해도 recipe가 성공으로 반환하는
문제를 격리 환경에서 재현했다. 실제 실패 상태를 보존하고 후속 작업을 중단하도록
[recipe](../../apps/skills-catalog/src/recipes.js),
[lifecycle](../../apps/skills-catalog/src/lifecycle-loop.js),
[CLI](../../apps/skills-catalog/src/cli.js)의 결과 전달을 수정했다.
레시피 화면도 실패 보고서를 오류로 보존하고, 미적용·데모는 정보로 표시한다. `applied: true`와
실제 완료 보고서가 함께 있을 때만 성공으로 표시하며, Codex 경로 예시를 `.agents/skills`로 맞췄다.

브라우저에서 새 계획 `9880c21c-52bc-44bf-8627-101565a33d70`의 미리보기 완료를 다시 확인했다.
이 계획은 preflight까지만 수행했으며 설치 실행으로 기록하지 않았다. 실제 UI apply 증거는
위의 `3e539317-6bb5-4985-b319-2014cb435b56`과 완료 보고서다.

## 검증과 남은 경계

- 모노레포 `npm run check` 통과. 최종 테스트 범위는 Catalog 426, UI 291, ledger 1,
  contracts 59, adapter 39개다. 미리보기/실제 적용 SSR 10개, recipe 결과 UI 9개,
  recipe·lifecycle·CLI 실패 전파 6개를 포함해 검증했다.
- Skills Manager: TypeScript 검사, JavaScript 테스트 285개, Rust 서비스 테스트 251개,
  format 검사와 inspector 빌드 통과.
- 검색: 실제 import fixture를 사용해 UI helper·HTTP·CLI의 ID/순서 일치 검증. 최소 지원
  Node 20.19에서도 ESM helper require와 CLI 검색을 실행했다.
- 실제 운영: strict 계획 적용, source digest 확인, 새 Catalog recipe 재현, 브라우저의
  inspector 연결·UI bridge 적용과 사후 검증을 수행했다.

Manager store의 v0/v1 역할은 메모리에서 v2 의미로 읽으며, 다음 정상 저장에서 v2를
기록한다. 기존 overlay를 조용히 비활성화하지 않는다. Manager의 단일 work scope와
Catalog의 여러 태그 AND 조건은 데이터 형식 차이가 남아 있어 변환 시 범위를 확인해야 한다.
프로젝트 `.agents/skills`를 여러 provider가 공유한다는 별도 UI 영향 표시는 아직 제한적이다.

이 결과는 검토·추천·전달의 계약과 재현성을 보강한 증거다. 자연어 자동 스킬 선택의 성공률,
장기 작업 품질이나 작업 시간 개선을 측정한 결과는 아니다. 실행 증거는 이 머신의 ignored
경로 `.skills-platform/operations/2026-09-08-hardening/`에 보존했다.
