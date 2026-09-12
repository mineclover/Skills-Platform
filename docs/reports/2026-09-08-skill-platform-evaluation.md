# Skills Platform 실제 적용 평가 — 2026-09-08

현재 Skills Platform Codex 프로젝트에서 스킬 분류, 기본셋 적용, 선택형 추천 등록과
설치된 안내 스킬 사용을 수행했다. **CLI의 등록·선택·전달·이력 경로는 정상 동작했다.**
추천·표시 정렬·검토 정책은 운영자의 판단을 여전히 필요로 하며, UI와 Skills Manager의
용어·상태 해석을 맞추는 보완이 필요하다. 이번 결과는 작업 생산성 향상이나 전체 제품의
품질 점수를 측정한 벤치마크가 아니다.

## 적용 결과

| 항목 | 적용 전 | 적용 후 |
| --- | ---: | ---: |
| Catalog skill lineage | 79 | 81 |
| 분류 태그가 있는 profile | 3 | 81 |
| 목적이 정리된 profile | 3 | 9 |
| 검토된 profile | 3 | 5 |
| 현재 프로젝트 설치 스킬 | 2 | 3 |

기존 스킬을 삭제하거나 이름에 순위 번호를 붙이지 않았다. Catalog의 native profile
명령으로 출처와 이 프로젝트의 추천 용도를 분류했다. 기본 표시 정렬은 여전히 이름순이고,
사용자 지정 순서 저장이나 품질 기반 추천 엔진을 추가한 것은 아니다.

| 출처 분류 태그 | 개수 |
| --- | ---: |
| `collection:platform-core` | 3 |
| `collection:community-codex` | 6 |
| `collection:paperthin` | 29 |
| `collection:baseline-suite` | 31 |
| `collection:maintenance-suite` | 12 |

분류만 수행한 패키지는 미검토 상태를 유지했다. 후보별 목적·조건·제외 사유는
[추천 가이드](../guides/recommended-skillsets-guide.md)에 있고, 전체 관찰 목록은
[분류 기록 JSON](./2026-09-08-skill-curation.json)에 있다. 이 JSON은 실행 레시피가 아니다.

### 실제 선택과 설치

대상 프로젝트는 `skills-platform-codex`, 범위는 현재 저장소의 `.agents/skills`다.

| 스킬 | 프로젝트 선택 | 결과 |
| --- | --- | --- |
| `skills-platform-guide` | 기본 preset v3 | 새 불변 revision으로 설치 |
| `skill-authoring-standard` | 기본 preset v3 | 기존 관리 링크를 새 revision으로 교체 |
| `writing-great-skills` | 기본 preset v3 | 같은 digest 유지, 명시 호출 전용 정책 유지 |
| `diagnosing-bugs` | debugging preset v2, `recommended` | 추천만 연결, 미설치 |

디버깅 assignment는 `priority: 10`, `work_scope_tags: [debugging]`이다. 일반 resolve와
debugging 범위 resolve 모두 기본 3개만 선택했다. Catalog의 `recommended`는 자동
overlay가 아니므로 의도한 결과다. 실제 작업에 선택할 때는 가이드의
`work_scope_overlay` 절차를 사용한다.

기본셋은 [authoring recipe](../../skills-platform-authoring-recipe.json), 선택형 후보는
[debugging recipe](../../skills-platform-debugging-recipe.json)에 저장했다. debugging source는
처음부터 상대 locator로 등록하고 시스템의 `recipe export`로 내보냈다. project assignment의
역할·priority·태그는 별도 재현이 필요하다.

## 사용한 시스템 경로와 증거

1. `project list`, `preset list`, `skill list`로 기존 상태를 조회했다.
2. `recipe apply`로 원본과 불변 revision을 조정하고, 각 적용 revision의 내용을 검토해
   `source review approve`를 기록했다.
3. `skill profile set`으로 기존 태그를 보존하며 분류·주요 사용 조건을 보강했다.
4. `preset assign --role recommended`로 디버깅 후보만 연결했다.
5. `project-plan --enabled-only --out`으로 추가 적용 계획을 생성했다. CLI의
   `history record-plan`은 현재 `--enabled-only`를 전달하지 않으므로 공개 Catalog 함수
   `recordActivationPlan`으로 **이 동일한 계획**을 기록했다.
6. reference adapter의 `preview`와 `apply --confirm`에 같은 계획 파일을 사용했다.
   `history record-report`로 결과를 Catalog 이력에 연결했다.
7. 같은 계획의 재-preview, 세 전달 경로의 digest, 추천 미설치를 확인했다.

| 증거 | 값 |
| --- | --- |
| 계획 ID | `759d4c0b-b1e4-41fc-befe-13d8397946f5` |
| Catalog report ID | `activation_report_408b360d-5e10-46c0-8871-35fc20a271ad` |
| 결과 | completed: applied 2, skipped 1, failed 0 |
| 재-preview | noop 3 |
| 전달 콘텐츠 검증 | 계획 digest와 3/3 일치 |
| 안내 스킬 revision | `revision_f7160bda00f7639d81619bcb` |
| 평가 case | `platform-guide-live-curation-2026-09-08` |
| 평가 run | `evaluation_run_8ef11f43-67a7-4c03-81ff-cb49e11df0cb` |
| feedback | `feedback_53c35ef3-fa72-4947-b6e3-0d23703f9b73` |

평가 run은 실제 관찰한 기본 선택, 콘텐츠 일치, 추천 미설치, 설치된 안내 스킬의 읽기 전용
사용이라는 네 기준을 수동 기록한 것이다. 평가 기록 자체를 테스트 실행기로 보지 않는다.

변경 전 Catalog·Registry 목록·관리 링크와 적용 기록은 이 머신의 ignored 경로
`.skills-platform/operations/2026-09-08-skill-curation/`에 보존했다. 과거 불변 revision은
그대로 남아 있어 이전 선택으로 새 계획을 만드는 복구 경로를 사용할 수 있다. 이 로컬
백업을 다른 머신에 그대로 복사하는 것을 이식 가능한 설치 절차로 삼지 않는다.

## 발견·사용·UI 확인

독립 에이전트가 실제 설치 경로 `.agents/skills/skills-platform-guide/SKILL.md`와 필요한
참조를 읽고 현재 기본셋·추천셋·설치를 CLI로 확인했다. 후속 에이전트에 제공된 Available
skills 목록에도 새 안내 스킬의 설치 경로가 나타났다. 추가 승인이나 설치 변경 없이
현재 상태를 정확히 설명했다. 자연어만으로 자동 선택되는 동작과 다른 두 기본 스킬의
실제 작업 품질은 이번 검증 범위에 포함하지 않았다.

Catalog bridge와 Vite UI를 실행해 브라우저에서 다음을 확인했다.

- Skills에서 `collection:platform-core` 검색 시 3/81 스킬로 좁혀졌다.
- 안내 스킬 상세에서 갱신한 목적·사용 조건·Hybrid·Reviewed 상태가 표시됐다.
- Projects에서 기본 preset v3의 선택 3개와 completed 적용 이력이 보였다.
- 현재 별도 Skills Manager inspector는 unavailable로 표시됐다. 따라서 UI의 upstream
  전달 경로 검증은 미완료이며 이번 실제 전달은 **reference adapter CLI**로 수행했다.

## 평가와 보완 우선순위

| 우선순위 | 확인한 문제 | 보완 방향과 완료 기준 |
| --- | --- | --- |
| P1 | `preset adopt`는 승인 확인을 하지만 일반 create/update/plan 경로에는 같은 검사가 없다. 임시 fixture에서 rejected revision·deprecated preset도 enabled 계획이 생성됐다. | 검토 강제 여부와 예외를 공통 plan 정책으로 명시. 모든 생성 경로에서 동일 결과가 나오는 계약 검증 필요 |
| P1 | Catalog의 `recommended`는 미선택 후보지만 Skills Manager는 일치하는 범위의 overlay로 합성한다. | 역할 이름 또는 경계 매핑을 통일. 동일 선언의 양쪽 effective set 비교로 검증 |
| P2 | CLI/API provider 필터는 profile 조건을, UI는 설명·태그 등의 문자열을 사용한다. 검색 대상 필드도 다르다. | 공유 검색 계약 또는 API 필터 사용. 같은 조건에서 결과 ID 집합이 일치해야 함 |
| P2 | 다중 overlay는 높은 priority가 충돌에서 이기지만 UI는 첫 overlay 하나만 대표로 표시한다. | 적용 overlay 전체와 lineage별 최종 선택 이유 표시. 두 overlay 충돌 사례 검증 |
| P2 | profile 분류와 recommendation assignment가 recipe export로 온전히 복원되지 않는다. additive 고정 계획의 이력 기록에도 API 호출이 필요했다. | profile/assignment의 휴대 가능한 선언과 CLI의 additive 이력 기록 지원. 새 Catalog 재현 결과 비교 |
| P2 | 업데이트 후보는 최신 import 중심이어서 그보다 오래된 approved revision이 가려질 수 있다. | 최신 출처와 검토 완료 적용 후보를 분리해 표시 |

근거는 [Catalog 선택](../../apps/skills-catalog/src/catalog-workflows.js),
[상태·계획 기록](../../apps/skills-catalog/src/catalog-state.js),
[검색](../../apps/skills-catalog/src/skill-management.js),
[승인·업데이트 후보](../../apps/skills-catalog/src/source-review.js),
[Catalog UI](../../apps/catalog-ui/src/CatalogApp.tsx),
[Skills UI](../../apps/catalog-ui/src/components/SkillWorkspace.tsx),
[Skills Manager의 역할 해석](../../apps/skills-manager/src-tauri/src/services/skill_sets.rs)다.
이 항목들은 이번에 확인한 개선 후보이며 공통 정책이나 추천 엔진을 구현 완료했다는 뜻은 아니다.

### 이번에 보완한 항목

가이드와 실제 추천셋을 연결하고, 설치된 자체 안내 스킬에 분류·추천·우선순위·평가 절차를
추가했다. 과거 loop matrix는 현재 설치 상태와 구분하고, 스킬 원본의 실제 용도와 맞지 않는
기본 추천을 정정했다. UI에서 관찰한 **0건 성공률 100% 표시**를 수정했다. 실행 표본이
없으면 성공률·평균 지연은 `— / No data`, 활성 provider는 `0`으로 표시한다. 관측값이 있는
경우 기존 비율과 지연 계산은 유지하며, 백엔드 집계 계약은 변경하지 않았다.

검증 결과:

- 실제 컴포넌트 렌더 테스트 5개: 0건, 성공, 실패, 혼합, recent event 없이 집계만 있는 사례.
- UI 타입 검사와 전체 UI 테스트 245개 통과.
- Catalog recipe·authoring 테스트 22개 통과.
- 두 recipe의 임시 Catalog 재현, source digest 일치, 안내 스킬의 Codex·Antigravity
  정적 검증 통과.
- 실행 중인 브라우저에서도 0건의 성공률·평균 지연이 `No data`, provider가 `0`으로
  바뀐 것을 확인했다.

수정과 회귀 검증은 [SkillWorkspace](../../apps/catalog-ui/src/components/SkillWorkspace.tsx)와
[telemetry 렌더 테스트](../../apps/catalog-ui/test/skill-telemetry-render.test.js)에 있다.

다음 제품 보완은 공통 검토 정책과 역할 매핑을 먼저 정한 뒤, 검색·추천 표시와 선언 재현을
맞추는 순서가 적절하다. 작은 분류·전달 실험의 성공을 자동 추천 품질의 증거로 확대하지 않는다.
