---
name: baseline-recursive-context-composer
description: Compose bounded execution contexts across recursively alternating horizontal and vertical frames while preserving parent-child focus paths, responsibility depth, topic identity, and 80,000-token limits. Use when a task drills into subtopics, reopens exploration, or resumes a parent resolution after child work.
---

# Recursive Context Composer

## 역할

수평·수직 프레임이 반복되는 작업에서 현재 행동에 필요한 정보만 조립한다.

```text
H₀ → V₀ → H₁ → V₁ → ...
```

전체 상위 문서를 매번 복사하지 않는다. `focus_path`와 Projection으로 연결한다.

## 프레임 계약

```yaml
frame_id: FRAME-004
parent_frame_id: FRAME-003
root_id: source-map-matcher
orientation: vertical
relation_plane: implementation
entry_reason: strategy-selected
exit_condition: acceptance-passed
context_ref: {}
responsibility_envelope_ref: {}
```

## 조립 규칙

1. 현재 primary frame을 결정한다.
2. 부모 프레임에서는 역할·계약·미완료 조건만 Projection한다.
3. 현재 관리 대상은 상세 정본을 포함한다.
4. 형제 프레임은 직접 의존 인터페이스만 포함한다.
5. 해결된 자식 결과는 evidence와 patch projection으로만 부모에 전달한다.
6. stale snapshot을 감지하고 재개 전에 버전을 선택한다.
7. 총 토큰을 72k 목표, 80k 하드 캡으로 검증한다.

## 우선순위

```text
현재 topic 목표·책임·수용 기준
→ 현재 관리 요소 상세
→ 직접 계약과 상태
→ 부모 미완료 조건
→ 자식 결과 projection
→ 간접 역사와 사례
```

## 금지 규칙

- 모든 부모·형제·자식 정본을 한 번에 포함하지 않는다.
- 자식 토픽 완료를 부모 완료로 자동 승격하지 않는다.
- 상위 프레임 권한을 하위 프레임에 자동 상속하지 않는다.
- orientation 전환을 암묵적으로 수행하지 않는다.

## 완료 게이트

- focus path가 끊기지 않음
- 각 frame의 orientation과 relation plane이 있음
- 현재 행동에 불필요한 상세가 제거됨
- 책임 깊이가 올바르게 적용됨
- 80k 하드 캡을 통과함
