# Product Spine Convergence Skill Pack

소프트웨어 프로젝트에서 스펙, 패키지, 계약, 런타임, 데모와 검증 표면이 실제 제품보다 빠르게 증가했을 때 사용하는 수렴 스킬 팩이다.

이 팩의 목적은 더 정교한 아키텍처를 추가하는 것이 아니다. 다음 네 가지를 결정하고 강제하는 것이다.

1. 사용자가 끝까지 수행해야 하는 **단 하나의 Golden Path**
2. 모든 기능이 연결되는 **제품 스파인(Product Spine)**
3. 현재 단계에서 인정할 **단 하나의 정본 모델·런타임·저장 경로**
4. 문서·테스트·패키지를 포함한 모든 자산의 **유지·병합·격리·폐기 판정**

## 구성

- `SKILL.md`: 요청을 분류하고 전문 스킬을 호출하는 상위 라우터
- `skills/product-spine-auditor/`: 제품 스파인과 구조 확산 문제 진단
- `skills/convergence-planner/`: 수렴 목표와 단계별 축소·통합 계획 작성
- `skills/architecture-governor/`: 패키지·계약·런타임·문서 경계 통제
- `skills/delivery-evidence-auditor/`: 내부 구현 증거와 사용자 완료를 분리해 검증
- `references/principles.md`: 공통 원칙과 용어
- `workflows/recovery-workflow.md`: 저장소 회복 전체 절차
- `templates/`: 정본 문서 및 보고서 템플릿
- `tests/trigger-cases.md`: 스킬 발동 및 회귀 검증 사례

## 권장 사용 순서

```text
product-spine-auditor
→ convergence-planner
→ architecture-governor
→ delivery-evidence-auditor
```

작은 요청은 상위 `SKILL.md`가 필요한 단계만 선택한다. 전면 회복 요청은 네 단계를 모두 수행한다.

## 핵심 운영 원칙

- 제품 동작이 패키지 구조보다 우선한다.
- 스펙은 설명뿐 아니라 변경을 거절하는 규칙이어야 한다.
- 안정되지 않은 개념은 독립 패키지나 public contract로 승격하지 않는다.
- 여러 구현 후보를 동시에 정본으로 유지하지 않는다.
- `done`은 타입, 어댑터, 데모, 단위 테스트가 아니라 사용자의 끝단 작업으로 판정한다.
- 현재 상태는 한 곳만 소유하고, 나머지 문서는 링크한다.
- 실험은 삭제하지 않아도 되지만 제품 정본 경로에서는 격리한다.

## 설치

이 디렉터리를 에이전트 스킬 경로에 복사하고 루트 `SKILL.md`를 진입점으로 사용한다.

단일 파일만 지원하는 환경에서는 함께 제공되는 `product-spine-convergence-standalone-SKILL.md`를 사용한다.
