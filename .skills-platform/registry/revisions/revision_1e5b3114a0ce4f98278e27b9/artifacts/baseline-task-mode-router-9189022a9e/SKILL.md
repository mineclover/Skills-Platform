---
name: baseline-task-mode-router
description: Classify a maintenance, design, or implementation request by task intent and execution orientation before domain routing. Use when a request may be exploratory, problem-solving, mixed, or recursively switch between horizontal topic discovery and vertical resolution.
---

# Task Mode Router

## 역할

사용자 요청이나 유지보수 신호를 다음 두 축으로 판정한다.

```text
task_intent        exploration | resolution
context_orientation horizontal | vertical
```

두 값을 하나의 enum으로 합치지 않는다. 일반적으로 탐색은 수평, 해결은 수직에 가깝지만 다음 조합도 유효하다.

| intent | orientation | 의미 |
|---|---|---|
| exploration | horizontal | 여러 후보·관계·원인을 탐색 |
| exploration | vertical | 후보 하나를 깊게 조사하되 아직 변경하지 않음 |
| resolution | vertical | 하나의 토픽을 구현·검증해 폐쇄 |
| resolution | horizontal | 여러 요소의 공유 계약·관계 문제를 조정해 해결 |

## 입력

- 사용자 지시문 또는 Maintenance Signal
- 현재 `focus_path`
- 기존 Topic Registry
- 상위 Maintenance Case 상태
- 명시된 변경·탐색 동사와 완료 요구

## 출력

```yaml
mode_route:
  task_intent: exploration
  context_orientation: horizontal
  primary_focus:
    root_id: browser-live-editing
    relation_plane: candidate-save-paths
  requires:
    - baseline-horizontal-context-builder
    - baseline-horizontal-exploration-behavior
  forbidden_shortcut:
    - do-not-start-implementation
  split_tasks: []
```

혼합 요청은 하나의 거대한 작업으로 유지하지 않고 순서가 명시된 하위 작업으로 분해한다.

```yaml
split_tasks:
  - id: H-01
    intent: exploration
    orientation: horizontal
    objective: 접근 방식과 책임 경계를 탐색한다.
  - id: V-01
    intent: resolution
    orientation: vertical
    depends_on: [H-01]
    objective: 선별된 토픽을 해결한다.
```

## 판정 절차

1. 요청의 **완료 의도**를 먼저 판정한다.
   - 찾기, 조사, 비교, 분류, 후보 선별이 완료라면 `exploration`.
   - 수정, 구현, 검증, 완료, 폐쇄가 완료라면 `resolution`.
2. 정보 이동 방향을 판정한다.
   - 복수 후보와 관계 평면을 넓히면 `horizontal`.
   - 선택된 하나의 토픽을 내부 조건까지 추적하면 `vertical`.
3. 현재 초점과 relation plane을 지정한다.
4. 관리 책임이 불명확한 해결 요청은 바로 수직 실행하지 않고 responsibility routing을 선행한다.
5. 탐색과 해결이 섞였으면 H→V 또는 V→H 전환으로 분리한다.
6. 필요한 컨텍스트 빌더와 행동 스킬을 라우팅한다.

## 금지 규칙

- 대상이 여러 개라는 이유만으로 자동 수평 판정하지 않는다.
- 문서가 자세하다는 이유만으로 자동 수직 판정하지 않는다.
- 해결 요청을 조사 보고서로 대체하지 않는다.
- 탐색 요청에서 하나의 후보를 임의 구현하지 않는다.
- 책임이 없는 외부 요소를 수직 해결 토픽으로 확정하지 않는다.

## 완료 게이트

- intent와 orientation이 각각 명시됨
- primary focus와 relation plane이 있음
- 혼합 요청이 실행 가능한 하위 태스크로 분해됨
- 다음 컨텍스트·행동 스킬이 정해짐
- 금지되는 단축 경로가 기록됨
