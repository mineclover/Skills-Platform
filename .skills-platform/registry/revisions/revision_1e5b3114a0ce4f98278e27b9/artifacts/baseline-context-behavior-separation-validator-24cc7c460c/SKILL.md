---
name: baseline-context-behavior-separation-validator
description: Validate that prior context and action behavior remain separate: contexts contain declarative identity, goals, conventions, methods, responsibility, and acceptance; behaviors contain execution, tool calls, changes, and results. Use before publishing contexts, behaviors, or maintenance runs.
---

# Context–Behavior Separation Validator

## 역할

컨텍스트와 행동이 서로의 책임을 침범하지 않는지 검사한다.

## 컨텍스트에서 허용

- ID, 역할, 목표
- 탐색 Method와 선택 규칙
- 컨벤션과 계약
- 현재 사실·가설·증거 ref
- 책임 범위
- 수용·종료·재개 조건
- 토큰 예산

## 컨텍스트에서 금지

- 실제 Tool Invocation 로그
- 수행 완료 결과
- 특정 파일을 반드시 이 순서로 수정한다는 실행 계획
- 검증을 수행했다는 주장
- 실행 중 동적으로 발견한 후보 목록

## 행동에서 허용

- Method 선택
- Toolchain plan과 호출
- 검색·측정·변경·검증 절차
- 결과, 증거, 상태 전환 요청
- Context Patch Proposal

## 행동에서 금지

- 출처 없이 새 목표·컨벤션·권한을 하드코딩
- Context를 직접 수정
- topic ID를 실행 중 교체
- acceptance를 임의 완화

## 검사 항목

```text
SEP-01 context에 procedural-only 필드가 있는가
SEP-02 behavior가 context_ref를 가지는가
SEP-03 behavior가 새로운 규범을 결과가 아니라 규칙으로 삽입하는가
SEP-04 context가 실제 실행 결과를 current fact로 위장하는가
SEP-05 patch proposal 없이 context version이 바뀌었는가
SEP-06 horizontal context/result, vertical context/result가 혼합되었는가
```

## 출력

```yaml
separation_validation:
  status: PASS | FAIL | WARN
  violations: []
  required_moves:
    - from: vertical_context.steps
      to: behavior_plan
  patch_required: true
```

## 완료 게이트

- 규범 정보와 절차 정보가 분리됨
- 모든 행동이 immutable context ref를 가짐
- 변경 제안이 patch proposal로 표현됨
- 수평·수직의 context/result 경계가 명확함
