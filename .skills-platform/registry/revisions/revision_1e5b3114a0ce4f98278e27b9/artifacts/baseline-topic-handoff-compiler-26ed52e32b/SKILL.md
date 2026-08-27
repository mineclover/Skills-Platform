---
name: baseline-topic-handoff-compiler
description: Compile a minimal, traceable handoff from horizontal exploration into a canonical selected topic and the requirements for its vertical context. Use when moving from discovery and selection to problem resolution without copying the full exploration history.
---

# Topic Handoff Compiler

## 역할

수평 행동 결과 전체를 수직 컨텍스트에 복사하지 않고, 선택된 토픽에 필요한 최소 정본 정보를 전달한다.

## 입력

- Horizontal Result
- selected candidate
- Topic Registry
- Element Registry
- Responsibility hints
- 관련 evidence refs
- 필요한 Convention refs

## 출력

```yaml
handoff_id: HANDOFF-resource-mapping-001
from_exploration_run_id: HRUN-browser-editing-004
topic_id: TOPIC-browser-resource-mapping
subject_refs: []
role_summary: 저장과 버전 관리가 동일 원본을 추적하게 한다.
selection_reason: []
evidence_refs: []
known_unknowns: []
responsibility_hint: {}
required_convention_refs: []
vertical_context_requirements: []
```

## 컴파일 규칙

- 후보가 기존 Topic과 동일하면 기존 ID를 사용한다.
- 선택 이유는 영향도뿐 아니라 관리 가능성과 검증 가능성을 포함한다.
- 탐색 과정의 탈락 후보 전체를 전달하지 않는다.
- 수직 해결에 필요한 known unknown만 남긴다.
- 해결책을 handoff에서 확정하지 않는다.
- 외부 문제는 owned topic 대신 boundary mitigation 또는 handoff topic으로 변환한다.

## 검증

Handoff는 다음 질문에 답해야 한다.

```text
무엇을 해결하는가?
왜 지금 선택했는가?
어떤 Element가 관련되는가?
어떤 근거가 있는가?
무엇이 아직 불확실한가?
누가 관리할 가능성이 있는가?
어떤 컨벤션과 계약이 필요한가?
```

## 금지 규칙

- Horizontal Context 자체를 수직 Context로 재사용하지 않는다.
- candidate ID를 canonical topic ID로 간주하지 않는다.
- 관리 책임이 확인되지 않은 상태를 `owned`로 표기하지 않는다.
- 구현 단계와 파일 변경 목록을 handoff에 넣지 않는다.

## 완료 게이트

- canonical topic ID가 있음
- role, selection reason, evidence, unknown이 있음
- vertical context requirements가 있음
- 불필요한 탐색 역사와 후보 목록이 제거됨
