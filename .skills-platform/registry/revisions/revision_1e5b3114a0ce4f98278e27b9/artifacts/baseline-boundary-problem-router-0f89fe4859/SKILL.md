---
name: baseline-boundary-problem-router
description: Route problems located in consumed, observed, or external elements into diagnosis, owned boundary mitigation, handoff, observation, or out-of-scope outcomes without absorbing unowned internal maintenance responsibility. Use when the root cause lies outside the current management envelope.
---

# Boundary Problem Router

## 역할

비관리 요소에서 발견된 문제를 현재 태스크가 대신 내부 수정하지 않도록 적절한 처리 경로로 변환한다.

## 입력

- 문제 증거와 재현
- suspected origin
- 현재 Responsibility Envelope
- 외부 provider 계약과 지원 채널
- 관리 중인 어댑터·경계
- 위험과 사용자 영향

## 처리 유형

| 유형 | 의미 |
|---|---|
| `diagnose-only` | 원인과 증거를 확정하되 변경하지 않음 |
| `boundary-mitigation` | 소유한 어댑터·검증·폴백에서 완화 |
| `capability-detection` | 미지원·버전 차이를 감지하고 제한 |
| `handoff` | 실제 owner에게 이슈·변경 요청 전달 |
| `observe` | 정보가 부족해 추가 관찰 |
| `accept-risk` | 승인된 위험 수용 |
| `out-of-scope` | 현재 시스템의 책임 밖으로 종료 |

## 경계 완화 조건

완화는 다음을 충족해야 한다.

- owned boundary에만 배치됨
- 외부 비공개 동작에 영구 의존하지 않음
- 데이터 손상이나 보안 약화를 만들지 않음
- 제거·재검토 조건이 있음
- 근본 원인 owner와 이관 상태를 숨기지 않음

## 출력

```yaml
boundary_route:
  issue_id: ISSUE-EXT-014
  symptom_location: chromium-workspace
  suspected_origin: chromium-file-mapping
  resolution_owner: external.chromium
  current_authority: none
  selected_route: boundary-mitigation
  owned_mitigation:
    location: chrome-devtools-adapter
    type: capability-detection-and-fallback
  prohibited_actions: []
  handoff: {}
```

## 금지 규칙

- 외부 결함을 로컬 제품 defect resolved로 기록하지 않는다.
- 임시 완화를 근본 해결로 표시하지 않는다.
- undocumented internal behavior를 표준 계약처럼 사용하지 않는다.
- 비공식 fork를 owner·release·security 책임 없이 도입하지 않는다.

## 완료 게이트

- 실제 resolution owner가 명시됨
- 현재 시스템의 허용 완화가 구분됨
- 금지되는 내부 변경이 있음
- 이관·재검토·제거 조건이 있음
