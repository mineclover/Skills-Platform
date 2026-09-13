# 스킬 분류와 추천 세트

분류는 찾기 쉽게 만드는 메타데이터이며 추천이나 승인 자체가 아니다. 먼저 현재 Catalog의
source/lineage와 profile을 조회하고 태그·목적·사용 조건을 보완한다. 출처에서 확실히 알 수
있는 collection 분류와 내용을 검토해야 판단할 수 있는 작업 적합성을 구분한다.

## 최소 기본셋과 작업별 선택

Skills Platform 자체를 사용하는 프로젝트의 기본셋은 `skills-platform-guide`,
`skill-authoring-standard`, `writing-great-skills`다. 마지막 스킬은 Codex 명시 호출 전용이다.
이 구성을 모든 다른 프로젝트의 기본값으로 일반화하지 않는다.

- 재현 가능한 버그·회귀 진단: `diagnosing-bugs`를 검토한 작업별 후보로 둔다.
- 설계 검토: `codebase-design`의 용어와 방식이 프로젝트에 맞는지 확인한다.
- 테스트 우선 구현: `tdd`의 테스트 경계 사전 합의 조건을 확인한 후 선택한다.
- 코드 리뷰: 이 저장소의 `code-review`는 issue-tracker 설정과 별도 준비 스킬을 전제한다.
  전제가 없으면 준비가 필요한 후보로 표시한다.
- 내장 `skill-creator`와 동명 저장소 패키지는 출처를 구분한다. 저장소 사본은 비교용으로
  관리하고 기본 전달셋에는 넣지 않는다.

추천은 패키지 내용, 호스트·도구 전제와 실제 수행 근거로 설명한다. 설치 수나 이름만으로
품질 점수를 만들지 않는다. 전제 때문에 적용을 보류하는 경우 그 패키지와 조건을 밝힌다.

## Catalog 역할과 정렬

| 항목 | 실제 의미 |
| --- | --- |
| `default` | 프로젝트 기본 선택 |
| `recommended` | 추천 후보 기록. Catalog에서는 자동 활성화되지 않음 |
| `work_scope_overlay` | assignment의 모든 작업 범위 태그가 맞을 때 기본셋에 합성 |
| `priority` | 같은 lineage가 충돌할 때 큰 숫자가 우선. 추천 점수나 스킬 실행 순서가 아님 |

Catalog CLI/API 검색의 기본 정렬은 profile title 순이다. 태그로 좁힌 뒤 이름순으로
확인한다. 원하는 추천 제시 순서는 가이드에 별도로 기록한다. Skills Manager store v3도
같은 역할과 여러 태그의 AND 조건을 사용한다. `work_scope_tags` 배열이 있으면 기존
`work_scope` 문자열보다 우선한다. 배열 없는 예전 문자열은 쉼표를 포함해 하나의 태그다.
명시적 빈 배열은 모든 범위와 일치하므로 특정 작업용 overlay에는 태그를 지정한다.
v0/v1의 recommended는 기존 활성 동작을 보존하도록 work_scope_overlay로 읽으며,
v2의 기존 역할도 유지한다. 마이그레이션은 읽기만으로 파일을 바꾸지 않는다.

## 적용과 평가

현재 선택과 대상 경로를 확인하고, 검토한 revision으로 고정 plan을 만든다. 추가 설치에는
`history record-plan --enabled-only`를 사용하고 `history apply PLAN_ID`로 같은 계획을
preview/apply한다. 이 경로는 정책 검사와 report 기록을 함께 수행한다. 추천 후보가 요청
없이 활성화되지 않았는지도 확인한다.

`advisory`는 검토 기록을 강제하지 않는다. `require_approved`는 Catalog 계획과 실제 적용에서
최신 source 승인을 요구하고 폐기된 선택을 차단한다. 독립 adapter는 이 정책을 읽지 않는다.
미검토 또는 거절된 콘텐츠를 “검토 완료”로 표시하지 않으며 source·profile·preset의 검토
상태와 호스트 발견·실제 사용 결과를 별도로 기록한다.

평가에는 적용 전후 구성, 분류 범위, 검토 근거, 계획/보고서 ID, 재-preview 결과와 미검증
단계를 남긴다. 현재 recipe export는 포함된 스킬 profile과 프로젝트 assignment의
role/priority/태그/enabled/고정 버전을 보존한다. source 승인과 평가 이력은 이식하지 않으며,
프리셋에 포함되지 않은 전체 스킬 목록의 백업도 아니다. 전체 가이드는 플랫폼 체크아웃의
`docs/guides/recommended-skillsets-guide.md`를 확인한다.
