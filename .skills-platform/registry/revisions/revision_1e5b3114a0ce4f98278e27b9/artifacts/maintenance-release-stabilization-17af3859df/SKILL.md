---
name: maintenance-release-stabilization
description: Plan and control deployment, migration, rollout, rollback, post-release observation, and stabilization windows after validation. Use when a maintenance change must move into real environments without equating test success with operational stability.
---

# Release and Stabilization Controller

## 역할

검증된 Change Set을 실제 환경에 안전하게 반영하고 안정화 기준을 판정한다.

## 입력

- Validation Gate PASS/CONDITIONAL 결과
- Change Set과 artifact IDs
- release topology
- migration plan
- rollout strategy
- rollback trigger와 procedure
- stabilization metrics and window

## 릴리스 전략

- dry run
- feature flag
- canary
- staged rollout
- blue/green
- rolling deployment
- controlled migration

환경과 변경 가역성에 맞춰 선택한다.

## 출력

```yaml
release_result:
  release_id: RELEASE-001
  change_set_refs: []
  environments: []
  rollout_events: []
  migration_evidence_refs: []
  rollback_status: armed
  stabilization:
    window: 24h
    metrics: []
    anomalies: []
    status: observing
```

## 안정화 판정

- 원래 신호가 재발하지 않음
- 오류율·지연·자원 사용 악화 없음
- 데이터 무결성과 계약 호환성 유지
- 다른 기능 회귀 없음
- 임시 폴백이 기대대로 동작
- rollback trigger 미충족

## 실패 전환

- 안전 임계값 초과 → 자동/수동 rollback
- 데이터 마이그레이션 불일치 → write freeze 또는 restore
- 신규 별도 결함 → child Signal/Case
- 원래 문제 재발 → `REOPENED`

## 금지 규칙

- CI green을 안정화 완료로 간주하지 않는다.
- rollback 없는 비가역 변경을 일반 경로로 배포하지 않는다.
- 관찰 지표가 없는 상태에서 canary를 종료하지 않는다.
- 임시 조치를 제거 조건 없이 영구화하지 않는다.

## 완료 게이트

- release와 rollback evidence가 있음
- 지정 stabilization window와 metrics가 있음
- production evidence가 closure controller에 전달됨
- rollback/continue/extend 결정이 명확함
