# Skills Platform 안정화 결과 — 2026-09-08

이전 [보완 보고서](./2026-09-08-platform-hardening.md)의 공유 경로·작업 범위 차이를 처리하고,
실제 동시 요청에서 재현한 저장 유실과 화면 전환 오류를 수정했다. 현재 프로젝트의 검토
필수 정책과 기본 스킬 3개를 보존한 상태에서 CLI·UI 전달과 사후 검증을 완료했다.

## 처리한 이슈

| 이슈 | 재현한 문제 | 안정화 결과 |
| --- | --- | --- |
| Catalog 동시 저장 | review 20개가 모두 성공을 반환했지만 1개만 남음. profile 저장과 정책·승인 철회가 충돌해 이전 상태로 복귀 | 파일 잠금 뒤 최신 snapshot을 읽고 변경·저장을 한 트랜잭션으로 처리. 모든 Catalog writer를 같은 경계로 이관 |
| 프로세스 간 저장 | 별도 Node 프로세스 10개의 override 저장이 1개만 남음 | 프로세스 간 잠금과 오래된 snapshot의 CAS 충돌 검사. 성공한 변경 유실 방지 |
| Registry import | 동시 import 6개 성공 후 source/skill index가 각 1개만 남음 | index 로드·artifact materialization·저장을 같은 Registry 잠금으로 직렬화. Git fetch와 source 검사는 별도 준비 단계 |
| 적용 경쟁 | 같은 프로젝트의 서로 다른 plan이 동시에 upstream write 실행 | 실제 delivery root 기준으로 Catalog reference/bridge가 공통 잠금 사용. 경로 별칭·다른 Catalog·별도 프로세스도 같은 대상에서는 직렬화 |
| 프로젝트 공유 경로 | `.agents/skills`의 project consumer를 global root만으로 판단. 원본 rename에 의존하는 다른 symlink 영향 누락 | 직접 target와 알려진 간접 소비자의 실제 root를 표시. 실제 공유 변경만 명시 확인을 요구하며 noop에는 요구하지 않음 |
| 확인 우회 | 일부 Manager 단일·일괄·preset/release 경로가 UI 확인에 의존 | CLI/Tauri/backend에서 실제 변경 직전 확인 여부 재검사 |
| 작업 범위 형식 | Manager scalar와 Catalog의 태그 배열 AND 조건 차이 | Manager store v3에 배열을 추가하고 기존 scalar·역할·마이그레이션 보존 |
| UI 비동기 전환 | 연결 로딩 중 demo가 섞이고 이전 프로젝트·범위의 결과가 새 화면에 표시됨 | context별 snapshot과 요청 ticket으로 늦은 응답 차단. 해석 전 변경 버튼 비활성화 |
| 미리보기 일관성 | selection·계획·표시가 서로 다른 Catalog 상태를 읽을 수 있음 | 서버의 해석·기록을 같은 snapshot으로 처리. UI는 effective-set에 포함된 전체 assignment를 함께 사용 |

Catalog의 project/preset/assignment/override/history, source review/adoption, profile/note/
feedback, evaluation, observed state, recipe 변경이 새 트랜잭션을 사용한다. 중첩 mutation이
실패하면 전체 트랜잭션을 취소하며, commit 뒤늦게 진입한 분리 작업은 명시적으로 거절한다.
임시 파일과 rename만으로 동시 저장이 안전하다고 간주하지 않는다.

외부 low-level `saveCatalog`·`saveRegistry`에서 로드했던 snapshot이 오래되었으면
`CATALOG_WRITE_CONFLICT`·`REGISTRY_WRITE_CONFLICT`로 거절한다. 최신 상태를 읽어 원하는
변경만 다시 적용한다. provenance 없는 literal snapshot 교체는 fixture/admin 경계이며,
일반 운영은 플랫폼 API를 사용한다. 실행 중인 소유자의 잠금은 임의로 제거하지 않고,
종료된 프로세스의 잠금은 소유권을 확인하여 복구한다.

코드와 재현: [Catalog 트랜잭션](../../apps/skills-catalog/src/catalog-state.js),
[파일 잠금](../../apps/skills-catalog/src/file-locks.js),
[적용 잠금](../../apps/skills-catalog/src/activation-locks.js),
[Registry](../../apps/skills-catalog/src/registry.js),
[Catalog 동시성 검사](../../apps/skills-catalog/test/catalog-concurrency.test.js),
[Registry 동시성 검사](../../apps/skills-catalog/test/registry-concurrency.test.js),
[적용 동시성 검사](../../apps/skills-catalog/test/activation-concurrency.test.js).

## 공유 경로와 확인

Manager preview의 `target_root`는 직접 변경할 경로다. `impacts`에는 같은 경로의 consumer와
원본을 참조하는 다른 프로젝트의 symlink consumer가 함께 있을 수 있다. Catalog는 직접
target만 계획과 비교하고, 간접 영향은 확인 목록으로 표시한다. 필드가 없는 예전 응답은
첫 번째 요청 provider의 impact를 직접 target으로 해석한다.

간접 영향 탐색은 설정·발견된 provider/project root의 관련 binding을 대상으로 제한한다.
무관한 전체 홈 디렉터리를 탐색하지 않는다. symlink chain은 최대 64단계이며 cycle이나
해석 불가한 변경은 차단한다. 끊어진 복구 대상은 이유를 표시한다.

공유 변경의 UI 흐름은 **영향 목록 확인 → 체크박스 → 새 preview → 새 plan 적용**이다.
선택·동의·영향 목록이 바뀌면 이전 plan은 적용할 수 없다. CLI에서는 확인한 경우에만 새
계획 생성에 `--confirm-shared-root`를 사용한다. `history apply`에 이 옵션을 붙여 기존 계획을
변경하려 하면 거절한다. Manager에는 검토한 계획의 확인 값만 전달한다.

현재 프로젝트의 세 binding은 이미 일치하므로 shared consumer를 표시하면서도
`requires_confirmation: false`였다. 불필요한 공유 확인을 요구하지 않고 적용이 완료됐다.

## Manager store v3 호환성

- `work_scope_tags`가 있으면 배열이 authoritative하며 모든 태그가 있어야 일치한다.
- 배열 없는 기존 `work_scope` 문자열은 하나의 태그다. 쉼표를 새 구분자로 해석하지 않는다.
- 명시적인 빈 배열은 모든 범위에 일치한다. 배열 없는 옛 빈 문자열은 overlay 매칭·조회에서
  유효한 조건으로 간주하지 않는다.
- v0/v1의 recommended→overlay 마이그레이션과 v2의 기존 역할을 유지한다. 읽기만으로
  파일을 변경하지 않고 다음 정상 저장에서 v3를 기록한다.
- 이전 버전이 배열을 무시하고 잘못 적용하지 않도록 store version을 올렸다.

[Manager 모델](../../apps/skills-manager/src-tauri/src/models/skill_set.rs),
[범위 해석](../../apps/skills-manager/src-tauri/src/services/skill_sets.rs),
[공유 영향](../../apps/skills-manager/src-tauri/src/services/provider_inventory.rs),
[운영·마이그레이션 기록](../../apps/skills-manager/DEVELOPMENT.md)에 구현과 계약이 있다.

## 실제 적용 증거

| 항목 | 결과 |
| --- | --- |
| 프로젝트 | `skills-platform-codex` |
| 검토 정책 | `require_approved` |
| 기본 preset | `skills-platform-authoring-codex@5` |
| 설치 | 안내·작성 표준·명시 리뷰 스킬 3개 |
| 안내 스킬 revision | `revision_00e1070ca2c0448daf5eb2b5` |
| 안내 갱신 계획 | `49177218-c937-484c-b6f5-731f982d9058`: 변경 1·유지 2·실패 0 |
| UI 적용 계획 | `ff24e0c9-5583-451a-835f-3ad165030315` |
| UI 보고서 | `activation_report_9d7edf8e-1fca-44e5-b4c4-8da71e90a6be` |
| UI 적용 | 요청 81·변경 0·유지 81·실패 0, 사후 `verified: true` |
| 재-preview | noop 3 |

81은 전체 계획의 연산 수이며 설치 수가 아니다. 기본 3개의 digest가 계획과 일치하고,
디버깅 추천은 미설치로 유지됐다. [현재 프로젝트 recipe](../../skills-platform-project-recipe.json)를
다시 export했다. 자체 안내 스킬도 공유 확인·동시 작업·v3 범위 규칙으로 갱신했다.

브라우저에서는 연결 초기에 demo 대신 `Resolving project`와 변경 불가 상태가 보였다.
Codex → OpenWiki → Codex를 빠르게 전환했을 때 이전 snapshot을 숨겼으며, 해석 후에는
현재 Codex v5의 기본 3개만 선택됐다. 같은 계획을 UI에서 적용하고 완료 보고서를 확인했다.
공유 mutation의 거절·확인·간접 영향은 임시 환경의 회귀 테스트로 검증했다.

## 검증 범위

- 모노레포 `npm run check`, `npm run build`, `npm test` 통과.
- 모노레포 테스트 862개 중 **861개 통과, Windows 전용 1개 건너뜀**, 실패 0.
  Catalog 455개(454 통과), UI 308개, ledger 1개, contracts 59개, adapter 39개다.
- Skills Manager JavaScript **295개**, Rust 전체 **377개** 통과. frontend build와 최신
  inspector build, format 검사도 통과했다.
- 단일·다중 프로세스 동시 저장, source 승인 철회 보존, recipe/review 병행, import 중복,
  crash/stale lock 복구, 동일 대상의 reference/bridge 혼합 적용을 임시 환경에서 검증했다.
- 실제 프로젝트의 검토·설치 상태와 UI 전달을 확인하고, 별도 브라우저·개발 서버는 검증 후
  종료했다. 기록은 이 머신의 `.skills-platform/operations/2026-09-08-stabilization/`에 보존한다.

검증은 macOS의 로컬 파일시스템에서 수행했다. 각 Catalog/Registry 저장과 참여하는
Catalog 적용 경로가 보호되며, 임의 외부 도구의 파일 변경이나 모든 저장소·호스트를 아우르는
분산 트랜잭션까지 보장하지 않는다. Windows 전용 검증과 장기 운영 지표는 이 결과에 포함하지 않는다.
