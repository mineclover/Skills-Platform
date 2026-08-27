---
name: maintenance-signal-intake
description: Normalize logs, metrics, test failures, user reports, security notices, dependency changes, design drift, and manual observations into deduplicated maintenance signals without prematurely declaring defects or resolution ownership. Use at the start of maintenance cases.
---

# Maintenance Signal Intake

## 역할

운영·개발·문서에서 발생한 원시 신호를 비교 가능한 `Signal`로 정규화한다.

```text
Signal ≠ Confirmed Problem
Signal ≠ Topic
Signal ≠ Owned Defect
```

## 입력 소스

- runtime error, log, trace, metric
- test failure
- user feedback
- security/advisory
- dependency or API change
- performance regression
- architecture/config drift
- repeated manual workaround
- documentation–implementation mismatch

## 출력

```yaml
signal_id: SIG-2026-00418
source: runtime-monitor
observed_at: 2026-08-27T10:00:00+09:00
summary: DevTools 종료 직후 마지막 CSS 변경이 저장되지 않음
subject_hints: []
evidence_refs: []
severity: medium
confidence: observed
dedup_key: <stable-key>
status: new
```

## 절차

1. 원본과 수집 시각을 보존한다.
2. 증상과 해석을 분리한다.
3. 개인 정보·비밀·민감 데이터를 최소화한다.
4. 동일 현상과 반복 이벤트를 dedup/aggregate한다.
5. 관련 Element·Topic 힌트를 추가하되 확정하지 않는다.
6. severity, frequency, blast radius, urgency를 분리한다.
7. 즉시 containment 필요 여부를 판정한다.
8. Horizontal Context Builder 또는 기존 Topic Case로 라우팅한다.

## 중복 규칙

다음이 유사해도 무조건 병합하지 않는다.

- 증상은 같지만 환경·버전이 다름
- 원인은 같지만 사용자 영향이 다름
- 동일 오류 코드지만 subject element가 다름

## 금지 규칙

- 신호 제목에 원인을 확정해 기록하지 않는다.
- 외부 오류를 현재 제품 defect로 자동 분류하지 않는다.
- 로그 volume을 중요도와 동일시하지 않는다.
- 원시 민감 데이터를 증거 저장소에 그대로 복제하지 않는다.

## 완료 게이트

- signal ID, source, time, evidence가 있음
- observation과 interpretation이 분리됨
- dedup 상태와 severity가 있음
- 다음 탐색 또는 기존 case route가 결정됨
