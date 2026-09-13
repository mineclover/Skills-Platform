# 작업 요청·피드백·인계

> 호출자·에이전트 간 의미 계약이다. 실제 MCP 메서드나 실행 가능한 설정 파일이 아니다.
> 기존 이슈·작업 기록에 필요한 부분만 사용한다. 값의 정의는 `references/integration.md`와 `references/contract.md`가 소유한다.

## 1. 요청 — WorkOrder

```yaml
work_id: <이번 작업 ID>
construction_context_ref: <인식 기록 또는 실제 정본 위치>
at_stage: <기준 구축 단계>
requested_action: <작성·검토·분석·후보·비교·반영 중 요청 범위>
target_refs:
  - <실제 대상 경로와 revision>
constraints_ref: <목표·필수 제약 정본>
authority_ref: <수정·실행·반영·예산 권한 근거>
criteria_ref: <현재 산출물의 완료·평가 기준>
evidence_refs: []  # 없으면 미실행·무증거로 취급
return_to:
  owner: <받는 주체>
  stage: <정상 반환할 구축 단계>
  next_action: <호출자가 이어 수행할 구체적 행동>
```

처음부터 누락된 값을 사용자에게 모두 요구하지 않는다. 실제 정본을 읽어 해소한 뒤 작업 범위를 확정한다.

## 2. 피드백

```yaml
feedback_id: <ID>
evidence_kind: <design_review / runtime_test / comparative_eval / illustrative>
evidence_refs: [<문서·실행 증거와 revision>]
observation: <실제로 확인한 사실 또는 명시적 가상 예시>
criterion_ref: <위반한 고정 기준>
cause_hypothesis: <가능한 원인과 확인되지 않은 부분>
runtime_location: <관련 실행 단계·경로 또는 아직 미실행>
target_ref: <정본 경로·앵커·필드·revision>
owner_stage: <해당 정본을 소유한 구축 단계>
proposal: <가설을 확인할 최소 변경>
recheck: [<필수 재검토·실행·회귀 사례>]
invalidated_refs: [<변경 시 재검토할 산출물·증거>]
handoff_if_out_of_scope: <반환 담당·단계·필요 작업>
```

## 3. 후보

- 후보 ID·기반 revision: <값>
- 관련 피드백: <참조>
- 변경 위치·diff: <참조>
- 예상 영향: <소비 구축·실행 단계>
- 검증 계획·결과: <증거 종류와 실제 상태>
- 적용 여부: <미적용 / 적용 완료 / 부분 적용; 실제 근거>

## 4. 종료 — WorkResult

```yaml
work_id: <요청과 동일 ID>
context_ref: <유효한 인식 기록>
alignment_status: <ready / partial / blocked / stale>
result_status: <designed / candidate / accept / reject / blocked>
scope: <설계 문서·실행 지시문·구조 등 이번 결과의 범위>
artifact_refs: [<실제 산출물·정본·revision>]
verification:
  kind: <design_review / runtime_test / comparative_eval / none>
  status: <passed / failed / partial / not_run>
  environment: <실행했으면 live / sandbox / mock / replay; 아니면 해당 없음>
  evidence_refs: []
  claim_scope: <확인된 범위와 미확인 한계>
decision_refs: [<채택·보류·거절 근거>]
open_items: [<미해결 항목·담당·막히는 행동>]
invalidated_refs: [<재검토·재실행할 위치>]
handoff:
  kind: <continue / rework / hold / finish>
  owner: <다음 담당>
  stage: <다음 작업 단계>
  next_action: <직접 이어 할 행동>
  required_inputs: [<필요한 자료·승인·도구>]
  done_when: <다음 행동의 완료 조건>
host_state_update: not_performed
stop_reason: <종료 이유>
```

실제 호스트 상태를 바꿨다면 `host_state_update`에 수행 내용·이전/이후 상태·도구 증거를 기록한다. 반영·검증·단계 이동을 한꺼번에 완료로 표시하지 않는다.
