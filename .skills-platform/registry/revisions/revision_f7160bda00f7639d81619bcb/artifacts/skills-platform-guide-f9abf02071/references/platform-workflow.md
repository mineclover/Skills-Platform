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
4. 첫 전달은 `project apply PROJECT_ID --enabled-only`로 미리 보고, 실행 범위가
   맞으면 같은 명령에 `--confirm`을 붙여 전달한다. 각 명령에 실제 `--catalog`와
   `--registry`를 명시한다.
5. adapter report, `project resolve`, `history list --project-id PROJECT_ID`와 재-preview를
   확인한다. 이어 호스트에서 발견과 사용을 확인한다.

`PROJECT_ID` 등은 실제 조회값으로 바꾸는 자리표시자다. 정확한 인자는 현재 CLI usage와
저장소 `docs/skills-usage.md`를 확인한다.

## 변경 효과를 구분할 것

- `recipe inspect`: 구조 검사이며 파일 digest 일치나 실제 설치를 증명하지 않는다.
- `recipe apply` without `--confirm`: Registry와 Catalog는 변경한다. provider 전달만 preview다.
- `project apply` without `--confirm`: 전달 preview다. `--enabled-only`가 없으면 전체 원하는
  구성을 조정하며 비선택 관리 스킬의 disable도 포함한다.
- `project link`: preview/`--confirm` 없이 링크를 즉시 변경하는 고급 경로다. 기존 symlink를
  교체할 수 있고 plan/adapter의 동일한 ownership 검사를 보장하지 않는다.
- `project status`: 링크/sidecar 관찰이다. digest, 원본 검토나 실제 호스트 사용의 증거는 아니다.

원본 업데이트는 canonical package 수정 → 대상 호스트 검증 → 레시피 digest 갱신 → 새
revision 검토 → 선택/preview/apply → 사용 확인 순서다. 전역 설치나 다른 provider로의
확대는 사용자가 요청한 범위일 때만 선택한다.

“최신으로 업데이트” 요청에서는 upstream의 최신 후보와 최신 검토 revision을 구분해
표시한다. 후보를 검사·검토한 뒤 해당 프로젝트가 사용할 revision을 선택한다. 여러
프로젝트가 공유하는 preset을 바꾸기 전에 영향 범위를 확인하고, 프로젝트 하나만의
요청이면 프로젝트 override 또는 별도 preset으로 범위를 유지한다. 네트워크나 검토
근거가 없으면 실제 확인한 revision만 보고하며 최신이라고 단정하지 않는다.
