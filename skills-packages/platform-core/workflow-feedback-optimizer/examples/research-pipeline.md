# 예제: 기술 블로그 수집의 구축 절차에 통합

**가상 예제다.** 아래 단계·경로·revision·권한·실행 상황은 설명용이다. 실제 사이트 조사, 프로젝트 도구 연결, LLM 실행, 사용자 승인 또는 성능 측정의 결과가 아니다. 예제의 상태 표시는 실제 보고 형식을 시연한다.

## 1. 프로젝트 목표와 두 가지 과정

목표는 회사 목록에서 공식 기술 블로그를 찾아 근거와 함께 정리하는 것이다. 제3자 재배포 사이트는 공식 목록에서 제외하고, 근거 부족은 미확인으로 분리한다.

### 구축 절차 — 이 예제에서만 사용하는 단계

| ID | 목적·수행 활동 | 진입 입력 | 담당·산출물 | 완료 조건 | 실패·후속 |
|---|---|---|---|---|---|
| B1 목표·판정 기준 | 포함·제외·미확인 기준을 정의한다 | 사용자 요청 | 요구 담당 / `spec/goal.md`, `spec/criteria.md` | 기준별 판단 조건과 경계 예시가 연결됨 | 보완은 B1, 완료 후 B2 |
| B2 단계·계약 설계 | 단계 책임, 데이터 전달, 완료·실패 경로를 정의한다 | B1 산출물 | 계약 담당 / `spec/pipeline.md`, `contracts/evidence.md` | 모든 필수 입력에 생산자가 있고 실패 반환이 정의됨 | 목표 미확정은 B1, 완료 후 B3·B4 |
| B3 지시문·구현 | 계약에 맞는 프롬프트와 변환 코드를 작성한다 | B2 산출물 | 구현 담당 / `prompts/`, `src/` | 계약 필드 사용·전달과 도구 연결이 확인됨 | 계약 문제는 B2, 완료 후 B5 |
| B4 평가 준비 | 고정 기준의 사례·검사·비교 환경을 준비한다 | B1·B2 산출물 | 평가 담당 / `eval/` | 사례 용도와 비교 조건·회귀 기준이 정해짐 | 기준 충돌은 B1·B2, 완료 후 B5 |
| B5 통합 검증 | 실제 실행·평가·실패 분류를 수행한다 | B3·B4 완료 | 검증 담당 / 실행·비교 증거 | 필수 기준·회귀·예산 조건이 충족됨 | 정본 소유 단계로 재작업, 완료 후 B6 |
| B6 반영·인계 | 권한·최신성 확인 후 정본과 후속 작업을 연결한다 | B5 증거 | 반영 담당 / 현재 정본·인계 | 반영 결과와 다음 담당 작업이 확인됨 | stale이면 영향 단계 재검토 |

B3와 B4는 병렬이며 B5는 둘의 완료 조건을 요구한다. 이 순서는 스킬의 고정 개발 단계가 아니라 가상 프로젝트가 정한 과정이다.

### 실행 파이프라인

```text
E1 discover → E2 collect → E3 verify → E4 format
후보 탐색      근거 수집      공식성 판정     목록 정리
```

실행 단계의 `verify`는 업무 판정 단계다. B4가 준비하는 외부 평가기의 기준과 혼동하지 않는다.

### 정본 소유권 연결

| 정본 | 소유 구축 단계 | 사용하는 실행 단계 | 변경 시 영향 |
|---|---|---|---|
| `contracts/evidence.md` | B2 | E2·E3 | 수집 출력·판정 입력, 관련 구현·평가 사례 |
| `prompts/collect.md` | B3 | E2 | E2 이후 실행 결과 |
| `prompts/verify.md` | B3 | E3 | E3·E4 결과 |
| `eval/officialness.md` | B4 | 외부 평가 | 비교 기준선·채택 판단 |

## 2. B2 산출물 검토에 호출

B2 담당자는 계약 초안을 만든 뒤 스킬에 입출력 전달의 누락 검토를 맡긴다고 가정한다. 실제 자동 hook은 연결하지 않은 `proposed` 상태다.

```yaml
work_id: demo-review-contract-01
construction_context_ref: spec/build-process.md@demo-process-01
at_stage: B2
requested_action: 계약 초안의 필수 입력 생산자와 전달 경로를 검토한다.
target_refs:
  - contracts/evidence.md@demo-contract-01
criteria_ref: spec/build-process.md#B2-exit
authority_ref: demo-policy#review-and-propose-only
evidence_refs: []
return_to:
  owner: 계약 담당
  stage: B2
  next_action: 검토 피드백을 반영할 계약 후보를 결정한다.
```

### 필수 인식 결과 시연

```text
목표: 공식 기술 블로그를 운영 근거로 판정할 수 있는 파이프라인을 만든다.
현재: B2 계약 초안 검토. B3·B4는 계약 확정 후 진행할 예정이다.
입력: 구축 절차 demo-process-01, 기준 문서, 계약 demo-contract-01.
작업: E2 출력과 E3 입력 사이의 근거 전달 계약을 검토한다.
경계: 읽기·피드백·후보 제안만 허용. 정본 반영·실행은 요청하지 않았다.
검증: 실제로 읽은 계약의 필드·생산자·소비자 일치를 검사한다.
인계: B2 계약 담당에게 반환하고 후보 선택·보완을 이어 하게 한다.
미확정: 실행 도구는 미연결이나 이번 문서 검토에는 필요하지 않다.
```

가상 호출에서 필요한 자료를 읽었다는 조건이면 `alignment_status: ready`가 가능하다. 이것이 실제 실행 권한이나 성능 검증 완료를 뜻하지 않는다.

### 설계 검토 피드백 시연

E3 입력에 `ownershipEvidence`가 필요한데 E2 출력 계약에는 전달 필드가 없다는 상황을 가정한다.

```yaml
feedback_id: demo-missing-evidence-field
# 예제이므로 illustrative다. 실제 문서를 읽어 검토한 운영 기록에서는 design_review를 사용한다.
evidence_kind: illustrative
observation: E3 입력은 ownershipEvidence를 요구하지만 E2 출력 계약은 이를 정의하지 않는다.
criterion_ref: spec/build-process.md#B2-exit
cause_hypothesis: 단계 간 근거 전달 계약이 누락되었을 수 있다.
runtime_location: E2 출력 → E3 입력; 실제 실행하지 않음
target_ref: contracts/evidence.md@demo-contract-01
owner_stage: B2
proposal: 근거의 생성 위치·형식·미확보 상태와 전달 필드를 계약 후보로 정의한다.
recheck:
  - E2에 근거 필드를 생산할 책임이 있는지 확인한다.
  - E3가 근거 없음과 접근 실패를 처리할 수 있는지 확인한다.
  - B3 구현과 B4 사례가 변경 계약을 입력으로 받도록 인계한다.
invalidated_refs: []  # 이 시점에는 아직 B3·B4 산출물이 없다는 가정
```

후보 제안이므로 `candidate`, 검증은 문서 검토 범위, 런타임은 `not_run`, 정본 반영은 미수행으로 반환한다. 계약 보완 전 B3 지시문에서 근거를 추정하도록 만들지 않는다.

## 3. B5 실행 실패 후에 호출

이후 B3·B4를 완료하고, E2가 제3자 재배포 근거를 전달했는데 E3가 회사명만 보고 accepted를 반환하는 trace를 얻었다고 **가정**한다. 실제 trace는 이 패키지에 없다.

인식 절차는 이제 현재 위치 B5, 최신 계약·지시문, 평가 기준·사례·실행 환경을 다시 읽어야 한다. B2 시점 맥락을 그대로 사용하지 않는다.

| 확인 내용 | 해당 호출에서의 해석 |
|---|---|
| 계약·전달 구현에 근거가 있음 | 앞선 설계 누락과 다른 문제 |
| E3가 전달된 근거와 충돌하는 판정을 함 | E3 지시문·적용 방식에 대한 원인 가설 |
| 현재 허용 범위가 분석·제안뿐임 | B3 소유 지시문을 임의 반영하지 않고 재작업 인계 |
| 실제 trace가 아직 없거나 읽을 수 없음 | 가설 검증에 필요한 관측을 반환; 원인 확정 금지 |

가상 제안은 `prompts/verify.md`에 운영 주체 근거와 이름 일치를 구분하는 지시를 넣는 것이다. 실제 후보는 기존 지시문·계약을 읽고 만든다. 이름이 같은 재배포 사이트와 외부 플랫폼의 공식 블로그를 모두 회귀 사례에 포함한다.

### 재작업 인계 시연

```yaml
work_id: demo-runtime-failure-01
alignment_status: ready
result_status: candidate
scope: prompts/verify.md 변경 제안; 적용하지 않음
verification:
  kind: none
  status: not_run
  evidence_refs: []
  claim_scope: 이 문서는 가상 예제이며 실제 성능 차이를 확인하지 않았다.
invalidated_refs:
  - 지시문이 바뀌면 E3·E4에 의존하는 이전 실행·평가 증거를 재검증해야 한다.
handoff:
  kind: rework
  owner: 구현 담당
  stage: B3
  next_action: 기존 계약을 보존하는 verify 지시문 후보를 작성한다.
  required_inputs:
    - 실제 실패 trace
    - 현재 지시문·계약의 revision
    - 허용된 변경 범위
  done_when: 후보와 영향 분석을 준비하고 B5에서 비교 검증할 수 있다.
host_state_update: not_performed
```

기대 복귀 경로는 B5 → B3 재작업 → B5 비교 검증 → 조건 충족 시 B6이다. 단계 이동을 실제 실행한 것은 아니다.

## 4. B5에서 계약 누락을 발견했다면

실제 검사 결과 E3 입력에 필드 자체가 없다면 B3가 아니라 B2로 반환한다. B2의 계약 후보가 채택되면 영향받는 B3 구현·지시문과 B4 평가 사례를 다시 확인하고, 준비가 끝난 뒤 B5로 돌아온다.

변경된 계약으로 B3·B4가 자동 완료되지는 않는다. 이전 산출물의 무엇을 재검토해야 하는지와 원래 검증 위치로 돌아올 조건을 함께 인계한다.

## 5. 이 예제에서 확인할 행동

같은 스킬이라도 B2에서는 설계 계약을 검토하고, B5에서는 실제 실행 근거를 분석한다. 실패 유형과 정본 소유권에 따라 B2 또는 B3로 반환한다. 실행되지 않은 작업을 실행 검증으로 표시하지 않으며, 스킬의 인계와 호스트의 실제 단계 이동을 구분한다.
