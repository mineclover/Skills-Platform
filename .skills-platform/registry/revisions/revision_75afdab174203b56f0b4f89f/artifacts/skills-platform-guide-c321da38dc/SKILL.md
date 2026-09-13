---
name: skills-platform-guide
description: >-
  Skills Platform의 목적과 사용 흐름을 안내하고 스킬 탐색, 설치, 사용 확인, 업데이트,
  제거를 지원한다. 플랫폼 온보딩, 추천 스킬셋과 검토 정책, Vercel Skills CLI 설치와
  Catalog 관리 방식 선택, 설치된 스킬의 경로·중복·인식 문제를 다룰 때 사용한다.
  시스템 훅과 가드 제어, 컴패니언 훅 연동, Antigravity Protojson 규격 검증도 안내한다.
---

# Skills Platform 사용 안내

Skills Platform은 작업에 맞는 스킬의 출처, 검토한 버전, 프로젝트 선택과 전달 결과를
관리한다. 사용자의 목적에 맞는 설치 경로를 선택하고 실제 사용 가능 여부까지 확인한다.

## 요청에 맞는 경로

- 목적·온보딩·팀 프리셋·검토 버전 관리: [플랫폼 운영](references/platform-workflow.md).
- `npx skills`로 직접 설치·검색·업데이트·제거: [직접 설치](references/direct-installation.md).
- 인식 실패·중복·업데이트 불일치: [사용 확인과 복구](references/verification.md).
- 스킬 분류·추천 세트·프로젝트 적용 평가: [추천 스킬셋](references/skillsets.md).
- 훅·가드 제어·컴패니언 훅·Protojson 동기화: [훅과 가드 관리](references/hooks-and-guards.md).

필요한 참조만 읽는다. 스킬 내용 자체의 작성·리뷰 요청은 대상 환경에
`skill-authoring-standard`가 있으면 연결하고, 없으면 해당 호스트의 공식 작성 규격을 확인한다.

## 일관된 사용 흐름

1. 요청과 현재 작업 경로에서 대상 프로젝트, 에이전트, 스킬 출처, 설치 범위를 파악한다.
   불명확하면 프로젝트 범위를 기본으로 제안한다. 이미 지정한 선택은 다시 묻지 않는다.
2. 같은 이름의 기존 설치와 관리 주체를 확인한다. 출처·이름·대상 경로가 같은지 확인한
   뒤 필요한 스킬만 선택한다. 외부 CLI 설치를 Catalog 등록으로 간주하지 않는다.
3. 선택한 관리 도구로 변경 내용을 확인하고 요청된 작업을 실행한다. 설치 요청은 지정된
   범위의 설치 권한으로 해석한다. 문서 작성·조회 요청은 실제 설치로 확대하지 않는다.
   플랫폼의 `--confirm`은 실행 옵션이지 매번 대화 승인을 다시 받으라는 뜻이 아니다.
4. **등록 → 파일 전달 → 호스트 발견 → 작업에서 사용**을 각각 확인한다.
   링크나 설치 목록만 보고 실제 호출이 검증되었다고 보고하지 않는다.
5. 결과에는 관리 방식, 스킬/출처, 프로젝트 또는 전역 범위, 대상 경로, 완료한 확인과
   다음 업데이트 방법을 짧게 남긴다. 미검증 단계가 있으면 그 단계만 명시한다.

## 유지보수

원본은 Skills Platform 저장소의 `skills-packages/platform-core/skills-platform-guide/`다.
이 폴더를 편집하고 대상 호스트별 정적 검증을 수행한다. 레시피로 배포할 때는 콘텐츠
digest를 갱신한 새 Registry revision을 검토하고 plan/adapter로 전달한다. 개발용 직접
참조 링크는 원본을 즉시 노출하므로 별도 선택한 경우에만 사용한다. 불변 revision이나
설치 복사본을 원본 대신 수정하지 않는다.

설치 후에도 이 패키지의 `references/`만으로 기본 안내가 가능해야 한다. 전체 저장소가
있는 환경에서는 `docs/skills-usage.md`와 `docs/guides/skills-installation-guide.md`의 현재
가이드북을 우선 확인하고, CLI나 호스트 문서가 달라졌으면 버전과 차이를 함께 기록한다.
