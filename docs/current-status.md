# Skills Platform: Current Status

> 현재 확인: **2026-09-08, macOS 로컬 환경**. 현재 상태와 검증 근거는
> [안정화 결과](./reports/2026-09-08-platform-stabilization.md)에 기록한다.

Skills Platform은 원본·불변 revision·검토·프로젝트 선택·전달 결과를 구분한다.
현재 Catalog의 등록·검색·추천·고정 계획·검토 필수 적용과 Manager UI/CLI 전달 경로를
검증했다. source/profile의 검토 표시와 실제 호스트 사용의 증거도 구분한다.

## 현재 프로젝트

| 항목 | 현재 값 |
| --- | --- |
| Catalog 프로젝트 | `skills-platform-codex` |
| 검토 정책 | `require_approved` |
| 기본 preset | `skills-platform-authoring-codex@5` |
| 실제 설치 | `skills-platform-guide`, `skill-authoring-standard`, `writing-great-skills` |
| 선택형 추천 | `skills-platform-debugging-codex@2`, 미설치 |
| 전달 루트 | 프로젝트 `.agents/skills` |
| Manager 연결 | `workspace-4844cf93282d94de` |

`writing-great-skills`는 Codex 명시 호출 전용이며, 저장소 `skill-creator` 사본은 비교용으로
관리한다. Antigravity preset은 별도로 유지하며 현재 프로젝트에 혼합 적용하지 않는다.

## 지원하는 운영 계약

- Catalog·Registry 변경은 프로세스 간 파일 잠금과 최신 snapshot 트랜잭션으로 저장한다.
  오래된 low-level snapshot 저장은 충돌로 거절한다.
- 같은 물리 전달 루트에 대한 Catalog reference/Manager bridge 적용은 직렬화한다.
  검토 정책과 실제 revision은 변경 직전에 재검사한다.
- `history record-plan`과 `history apply`로 같은 계획을 preview/apply하고 이력을 남긴다.
  실패 보고서가 성공·후속 작업으로 전파되지 않도록 처리한다.
- 추천 후보와 범위 overlay는 별도 역할이다. Manager store v3는 배열 태그의 AND 조건과
  이전 역할·scalar 데이터를 호환한다.
- 공유·간접 symlink 영향을 표시하고 실제 공유 변경에 확인을 요구한다. noop은 추가 확인이
  필요 없다. 동의는 기존 계획 수정이 아닌 새 계획 생성에 포함한다.
- UI/API/CLI는 검색 계약을 공유한다. 연결 로딩·프로젝트 전환과 늦은 응답을 구분하며,
  미리보기·실패·표본 없는 지표를 성공으로 표현하지 않는다.

## 원본과 머신별 상태

원본 패키지는 `skills-packages/`, 동결 instance는 `skills-instances/`, 불변 revision은
`.skills-platform/registry/`에서 관리한다. recipe는 이식 가능한 구성 선언이다.
프로젝트 export는 포함된 profile과 assignment를 보존하지만 전체 Registry 백업이나
source 승인·평가 이력의 자동 복원은 아니다.

`.skills-platform/catalog/`, `.agents/skills/`, Manager 연결과 Codex enablement는 머신별
상태다. clone 후에는 [패키지 관리](./guides/project-skill-package-management.md) 절차로
재구성하고, 검토 필수 프로젝트는 해당 revision 검토 후 전달한다.

## 검증과 사용 안내

```bash
npm run check
npm run build
npm test
node apps/skills-catalog/src/cli.js recipe inspect skills-platform-project-recipe.json
node apps/skills-catalog/src/cli.js project resolve skills-platform-codex \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
```

[활용 가이드](./skills-usage.md), [설치 가이드](./guides/skills-installation-guide.md),
[추천·정렬 가이드](./guides/recommended-skillsets-guide.md)를 현재 운영 절차로 사용한다.

이전 관찰은 [초기 적용 평가](./reports/2026-09-08-skill-platform-evaluation.md)와
[후속 보완](./reports/2026-09-08-platform-hardening.md)에 보존한다. Windows 전용 검사와
장기 작업 품질은 이번 로컬 검증의 범위에 포함하지 않는다. 외부 도구의 임의 파일 변경까지
하나의 원자적 작업으로 묶는 계약은 아니다.
