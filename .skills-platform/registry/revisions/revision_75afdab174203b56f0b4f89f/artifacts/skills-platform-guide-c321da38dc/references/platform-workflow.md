# 플랫폼 운영

## 목적과 상태

Catalog는 스킬 출처와 불변 revision, 검토 기록, preset과 프로젝트별 선택, 전달 계획을
관리한다. Registry에 있다는 사실은 활성화됐다는 뜻이 아니다. 전달 후 호스트가 실제로
발견하고 해당 작업에 사용했는지도 따로 확인한다.

| 요청 | 사용할 경로 |
| --- | --- |
| 단일 스킬을 빠르게 개인 프로젝트에 사용 | Vercel Skills CLI 직접 설치 |
| 팀 공통 구성, 검토 버전, 전달 이력이 필요 | Catalog의 recipe/preset/plan |
| 플랫폼 원본 스킬을 수정하며 즉시 시험 | 명시적으로 선택한 개발용 `project link` |

직접 설치는 Catalog의 검토·선택·이력을 만들지 않는다. 같은 대상 경로를 두 관리 도구로
갱신하지 않는다. 레시피와 Vercel의 lock 파일도 서로 대체하지 않는다.

## 현재 체크아웃 확인

Skills Platform CLI는 저장소의 `apps/skills-catalog/src/cli.js`다. 설치된 스킬 폴더에서
상대 경로로 실행하지 말고 플랫폼 체크아웃 루트를 먼저 찾는다. 없으면 직접 설치 안내는
계속할 수 있지만 Catalog 명령을 실행했다고 보고할 수 없다. 플랫폼 실행 준비는 루트
README의 `npm ci`와 `npm run build:packages`를 따른다.

루트에서 현재 상태를 조회한다. 다른 저장소를 관리할 때도 Catalog/Registry 경로를
명시하고, 프로젝트 목록의 실제 ID와 provider/delivery root를 사용한다.

```bash
node apps/skills-catalog/src/cli.js project list --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js skill list --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js preset list --catalog ./.skills-platform/catalog
```

## 검토한 구성 전달

1. 출처를 검사하고 `import-local` 또는 `import-git`로 revision을 만든다. 저장소 제공
   레시피를 사용할 때는 `recipe inspect` 후 `recipe apply`로 선언을 재구성한다.
2. 해당 revision의 내용과 리소스를 검토하고 source review에 근거를 기록한다.
3. 실제 registry skill ID로 preset/프로젝트 선택을 구성한다. 이름만으로 중복 출처를
   임의 선택하지 않는다.
4. 프로젝트의 `review_policy`를 확인한다. `require_approved`는 enabled revision의 최신
   source 승인과 폐기 상태를 검사한다. 처음 전달할 고정 계획은
   `history record-plan PROJECT_ID --enabled-only --out PLAN_FILE`로 저장한다.
   반환된 plan ID를 `history apply PLAN_ID`로 미리 보고, 범위가 맞으면 같은 ID에
   `--confirm`을 붙여 전달한다. 실제 `--catalog`와 `--registry`를 각 명령에 명시한다.
5. adapter report, `project resolve`, `history list --project-id PROJECT_ID`와 재-preview를
   확인한다. 이어 호스트에서 발견과 사용을 확인한다.

`PROJECT_ID` 등은 실제 조회값으로 바꾸는 자리표시자다. 정확한 인자는 현재 CLI usage와
저장소 `docs/skills-usage.md`를 확인한다.

## 변경 효과를 구분할 것

- `recipe inspect`: 구조 검사이며 파일 digest 일치나 실제 설치를 증명하지 않는다.
- `recipe apply` without `--confirm`: Registry와 Catalog는 변경한다. provider 전달만 preview다.
- `project apply` without `--confirm`: 전달 preview다. `--enabled-only`가 없으면 전체 원하는
  구성을 조정하며 비선택 관리 스킬의 disable도 포함한다.
- `history apply PLAN_ID`: 저장된 같은 계획의 preview/apply다. Catalog의 현재 검토 정책을
  다시 확인하므로 preview 이후 승인 철회도 반영한다.
- `project link`: preview/`--confirm` 없이 링크를 즉시 변경하는 고급 경로다. 기존 symlink를
  교체할 수 있고 plan/adapter의 동일한 ownership 검사를 보장하지 않는다.
  `require_approved` 프로젝트에서는 이 직접 연결 경로가 차단된다.
- `project status`: 링크/sidecar 관찰이다. digest, 원본 검토나 실제 호스트 사용의 증거는 아니다.

원본 업데이트는 canonical package 수정 → 대상 호스트 검증 → 레시피 digest 갱신 → 새
revision 검토 → 선택/preview/apply → 사용 확인 순서다. 전역 설치나 다른 provider로의
확대는 사용자가 요청한 범위일 때만 선택한다.

“최신으로 업데이트” 요청에서는 upstream의 최신 후보와 최신 검토 revision을 구분해
표시한다. 후보를 검사·검토한 뒤 해당 프로젝트가 사용할 revision을 선택한다. 여러
프로젝트가 공유하는 preset을 바꾸기 전에 영향 범위를 확인하고, 프로젝트 하나만의
요청이면 프로젝트 override 또는 별도 preset으로 범위를 유지한다. 네트워크나 검토
근거가 없으면 실제 확인한 revision만 보고하며 최신이라고 단정하지 않는다.

## 검토 정책과 inspector

기존 정책이 생략된 프로젝트는 `advisory`로 동작한다. 검토한 버전만 적용하도록 구성할
요청이면 `project set-policy PROJECT_ID --review-policy require_approved`를 사용한다.
source 승인을 profile의 `reviewed` 표시나 recipe import로 대체하지 않는다. 비활성화는
복구를 위해 허용된다. standalone adapter는 Catalog를 모르는 기계적 전달 경로이므로
검토 정책을 적용할 때는 Catalog의 history/project apply를 사용한다.

inspector 초기 설정이 없으면 지원 CLI의 `project add --path PROJECT_DIRECTORY`로
대상 프로젝트를 등록하고, 반환된 ID를 Catalog의
`project bind-manager PROJECT_ID --upstream-project-id MANAGER_PROJECT_ID`로 연결한다.
기존 프로젝트를 삭제·재등록하지 않는다. upstream preview의 전달 루트가 계획과 다르면
적용하지 말고 provider의 설정 디렉터리와 스킬 디렉터리를 구분해 원인을 확인한다.

## 공유 경로와 동시 작업

Manager preview의 `target_root`는 직접 변경할 루트이고 `impacts`에는 그 경로와 원본을
참조하는 다른 에이전트·프로젝트의 영향이 포함될 수 있다. 실제 공유 변경에는 명시적
확인이 필요하지만 이미 일치하는 noop에는 불필요하다. UI에서는 영향 목록을 확인한 뒤
체크박스로 새 preview를 만든다. CLI로 계획을 만들 때는 확인한 경우에만
`history record-plan PROJECT_ID --confirm-shared-root`를 사용한다. 기존 계획의 확인 값을
수정하지 말고 새 계획 ID를 검토한다. 독립 설치 도구가 이 확인 계약을 지킨다고 추정하지 않는다.

Catalog·Registry 변경은 플랫폼 API의 최신 snapshot 트랜잭션을 사용한다. 오래된 JSON을
다시 저장하다 `CATALOG_WRITE_CONFLICT` 또는 `REGISTRY_WRITE_CONFLICT`가 나면 최신 상태를
다시 읽고 원하는 변경만 적용한다. 잠금 파일을 수동 삭제해서 실행 중인 작업을 우회하지 않는다.
Catalog reference/Manager bridge의 같은 물리 전달 루트 적용은 직렬화되지만, 외부 도구와
임의 파일 변경까지 하나의 원자적 작업으로 묶는 것은 아니다.
