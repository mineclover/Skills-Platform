# Vercel Skills CLI 직접 설치

공식 명령은 [vercel-labs/skills](https://github.com/vercel-labs/skills)의 배포 버전과 help를
기준으로 확인한다. README의 main에만 있는 기능을 현재 npm 버전에서 지원한다고
추정하지 않는다. 설치 도구의 버전 고정은 설치할 스킬 소스의 버전 고정과 별개다.

## 탐색에서 사용까지

1. `node --version`, `npm --version`, `git --version`으로 실행 환경을 확인한다. 사용할
   버전의 Node 요구사항은 `npm view skills@VERSION engines --json`으로 확인한다.
   플랫폼 자체의 Node 요구사항과 같다고 가정하지 않는다.
2. 대상 프로젝트 루트에서 시작한다. 일반 명령 형식은 다음과 같다. 재현이 필요하면
   `skills`를 확인한 `skills@VERSION`으로 고정하고, 대문자 자리표시자를 실제 값으로 바꾼다.

   ```bash
   npx skills find QUERY
   npx skills add SOURCE --list
   npx skills add SOURCE --skill SKILL_NAME --agent AGENT_ID
   npx skills list --agent AGENT_ID
   ```

3. `SOURCE`는 조회한 저장소, 정확한 skill 하위 경로 또는 로컬 패키지 경로다. 이 플랫폼은
   `skills-packages/<group>/<skill>/`에 패키지를 두므로 모노레포 전체를 설치하기보다
   해당 폴더를 소스로 지정한다. 목록으로 이름과 출처를 확인한 뒤 설치한다.
4. 기본은 프로젝트 범위다. 전역 요청이면 설치/목록/제거 명령에 해당 버전이 지원하는
   `--global`을 명시한다. `--copy`는 복사 방식이고, 일반 symlink 설치도 플랫폼 원본으로의
   실시간 연결을 뜻하지는 않는다. 링크의 실제 대상을 확인한다.
5. `--yes`는 CLI 질문 생략이다. 사용자가 정한 범위에서만 사용하며 `--all`은 모든
   스킬/에이전트로 확대할 수 있으므로 기본값으로 제안하지 않는다.
6. 설치 결과와 호스트 스킬 목록을 확인하고, 작은 실제 요청에서 해당 스킬을 사용한다.

## 업데이트·제거·전환

기존 설치에 사용한 도구, 소스, 범위를 먼저 확인하고 그 버전의 update/remove 지원
인자를 따른다. scope 없는 일괄 update가 프로젝트와 전역 중 어디에 작용하는지 먼저
확인한다. CLI lock 파일은 출처와 업데이트 추적 정보이며 Catalog의 검토 revision과
ActivationPlan을 대신하지 않는다. 로컬 소스의 자동 업데이트도 지원 여부를 확인한다.

Catalog 관리로 전환할 때는 원본 출처를 import하고 원하는 구성을 preview한다. 기존
설치의 수정 내용을 보존한 뒤 기존 도구로 해당 설치를 해제하고 Catalog로 전달한다.
sidecar를 직접 만들어 기존 설치가 Catalog 소유인 것처럼 표시하지 않는다.

사설 저장소에는 이미 구성된 Git/SSH/호스트 인증을 사용한다. URL이나 명령 예시에
토큰을 넣지 않는다. 인증 실패는 실제 호스트의 인증 상태와 CLI 오류로 진단한다.

## 경로 불일치

Vercel CLI의 agent별 설치 대상과 호스트 공식 검색 경로는 각각 확인한다. 특히 전역
경로를 하나의 공통 규격으로 단정하지 않는다. 명령 성공 후 호스트에서 보이지 않으면
[사용 확인과 복구](verification.md)의 경로·설정·세션 순서로 점검한다.
