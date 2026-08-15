# 에이전트 설계 안티패턴: Anthropic과 Codex의 공통 원칙

> 상태: 외부 공식 자료를 바탕으로 한 설계 참고 문서. 이 문서는 현재
> `ActivationPlan`, `ActivationReport`, 또는 provider-delivery 계약을 변경하지
> 않는다.

## 한 줄 결론

에이전트 품질은 툴·컨텍스트·권한을 무조건 적게 주는 데서 나오지 않는다.
현재 역할에 필요한 최소한의 능력만 명확하게 제공하고, 실제 업무 평가로 그
경계를 검증하는 데서 나온다.

따라서 "툴이 5개를 넘으면 에이전트를 분리해야 한다"는 식의 고정 임계값은
사용하지 않는다. Anthropic과 Codex의 공식 문서는 모두 툴·컨텍스트·하위
에이전트의 사용을 작업 경계, 정보 품질, 병렬성, 비용, 그리고 평가 결과에
맞춰 조절하라고 안내한다.

## 검증 범위

Anthropic은 2026년 3월 파트너 대상 기술 인증인 *Claude Certified Architect,
Foundations*를 발표했다. 공개 공지는 인증의 존재와 대상은 확인하지만, 세부
문항 비중이나 시나리오 목록을 공개하지 않는다. 그러므로 그러한 수치를 이
저장소의 규범적 근거로 사용하지 않는다.

이 문서의 설계 근거는 공개된 Anthropic의 툴 설계·API 문서와 OpenAI의 Codex
공식 문서다.

## 안티패턴과 대안

### 1. 툴의 수만 늘리거나, 임의의 숫자로 제한한다

문제는 툴의 절대 개수가 아니다. 같은 기능을 중복하거나, 설명과 입력 스키마가
모호하거나, 에이전트가 의미 없는 저수준 API 단계를 직접 조합해야 할 때 선택
오류와 잘못된 인자 사용이 늘어난다.

대안은 업무 단위가 분명한 툴을 설계하는 것이다. 예를 들어 여러 API를 그대로
노출하기보다, 실제 업무를 마치는 `search_logs`나 `get_customer_context`처럼
의도가 명확한 툴을 고려한다. 툴을 추가·통합·분리할지는 실제 업무 eval에서
정확도, 호출 수, 오류율, 지연 시간, 토큰 비용을 함께 보고 결정한다.

### 2. 모델 응답을 곧바로 최종 답으로 처리한다

클라이언트 툴 호출에서 모델은 툴 이름과 인자를 요청할 뿐, 애플리케이션이 실제
툴을 실행하고 결과를 다시 전달해야 한다. `tool_use`일 때는 실행 후 계속
반복하고, `end_turn`일 때만 자연 종료로 다룬다. `max_tokens`와
`model_context_window_exceeded`는 잘린 응답일 수 있으며, `pause_turn`,
`refusal`, `stop_sequence`도 각기 별도의 처리가 필요하다.

또한 종료 조건이 없는 무한 루프는 피한다. 최대 턴 수, 시간·비용 예산, 재시도
정책, 권한 경계, 인간 검토 지점을 함께 둔다.

### 3. 모든 지침과 작업 기록을 메인 컨텍스트에 쌓는다

긴 로그, 탐색 메모, 스택 트레이스, 원시 툴 출력은 중요한 요구사항과 결정을
묻어버린다. Codex는 이를 context pollution 및 context rot으로 설명하며,
탐색·테스트·로그 분석처럼 독립적인 읽기 중심 작업을 하위 에이전트에서 수행한
뒤 원시 출력 대신 요약을 반환하라고 권고한다.

대안은 검색·필터·페이지네이션·범위 선택으로 툴 출력을 제한하고, 메인 스레드에는
근거 참조, 결정, 미해결 항목, 다음 행동만 넘기는 것이다. 컨텍스트 압축 기준은
15만 토큰 같은 전역 숫자가 아니라 모델·업무·예산·eval에 맞춰 정한다.

### 4. 역할 경계 없이 멀티 에이전트를 늘린다

하위 에이전트는 코드베이스 탐색, 테스트, 트리아지, 요약처럼 독립적이고 병렬화
가능한 읽기 중심 작업에 유용하다. 반면 같은 파일을 동시에 수정하는 쓰기 중심
작업은 충돌과 조정 비용을 높일 수 있다. 각 하위 에이전트는 별도 모델·툴 작업을
수행하므로 단일 에이전트보다 토큰을 더 쓴다.

에이전트 분리는 다음 중 하나가 있을 때 사용한다.

- 서로 다른 권한 또는 데이터 접근 경계
- 독립 검증이 필요한 조사·실행·검토 역할
- 메인 컨텍스트에서 격리해야 하는 대량 출력
- 독립적으로 병렬 실행 가능한 하위 문제

각 하위 에이전트에는 작업 범위, 완료 조건, 허용 도구·권한, 그리고 반환할
구조화된 요약 형식을 명시한다.

### 5. CLAUDE.md·AGENTS.md를 강제 정책으로 오해한다

지침 파일은 모델의 행동을 유도하지만 강제 정책 자체는 아니다. 프로젝트 공통
규칙은 짧고 구체적으로 유지하고, 특정 경로나 작업에만 필요한 규칙은 해당 범위로
옮긴다. 상충하는 규칙은 우선순위에 기대어 방치하지 말고 제거한다.

되돌릴 수 없는 작업, 위험한 명령, 민감 데이터 접근은 지침 문구만으로 통제하지
않는다. 허용·차단 목록, 샌드박스, 승인, 훅 같은 프로그램적 통제와 연결한다.

## Codex에서 확인되는 유사한 원칙

| 주제 | Codex 공식 문서의 입장 | 이 플랫폼에 적용할 원칙 |
| --- | --- | --- |
| 하위 에이전트 | 독립적이고 병렬화 가능한 복잡한 작업에 사용하되, 각 하위 에이전트는 추가 토큰을 사용한다. | 분리 자체를 목표로 삼지 않고, 독립성·병렬성·비용을 기준으로 선택한다. |
| 컨텍스트 | 원시 탐색 결과·테스트 로그가 메인 스레드를 오염시킬 수 있으므로 요약만 되돌린다. | Catalog는 원시 추론·무한 로그가 아니라 증거 참조와 구조화된 결과를 저장한다. |
| 쓰기 충돌 | 병렬 쓰기 작업은 충돌과 조정 비용을 높일 수 있다. | 동일한 delivery target의 동시 변경은 preview·confirm·verify로 직렬화한다. |
| 스킬 | 이름·설명만 먼저 노출하고, 선택된 스킬의 전체 지침을 나중에 읽는 progressive disclosure를 사용한다. | work scope에 필요한 검토 완료 스킬만 선택하고, 항상 전체 Catalog를 프롬프트로 내보내지 않는다. |
| 권한 | 하위 에이전트는 부모의 샌드박스·권한 모드를 상속한다. | 정책 선택과 provider delivery를 분리하고, 작업별 권한 경계를 명시한다. |

Codex 문서는 초기 스킬 목록에 컨텍스트 예산을 두고, 선택된 스킬만 전체 지침을
읽는 progressive disclosure를 사용한다고 설명한다. 이는 이 플랫폼의
`work_scope_overlay`와 최소 능력 집합 원칙에 직접 대응한다.

## Skills Platform 적용 체크리스트

새 기능이나 런타임 연동을 검토할 때 다음을 확인한다.

1. 이 작업에 필요한 최소 스킬·툴·권한 집합은 무엇인가?
2. 툴의 목적·입력·출력이 업무 단위로 명확한가?
3. 원시 로그 대신 증거 참조와 구조화된 요약을 넘길 수 있는가?
4. 하위 에이전트 작업은 독립적이며, 병렬화 이득이 조정 비용보다 큰가?
5. 쓰기 작업의 충돌과 되돌리기 어려운 작업을 프로그램적으로 막는가?
6. 정확도·툴 오류·지연·토큰 비용을 포함한 eval이 있는가?
7. `inspect -> resolve -> preview -> confirm -> apply -> verify -> report`
   경계를 우회하지 않는가?

## 공식 참고 자료

- Anthropic, [Claude Partner Network 및 Claude Certified Architect, Foundations 발표](https://www.anthropic.com/news/claude-partner-network)
- Anthropic, [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- Anthropic, [Handling stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons)
- Anthropic, [How tool use works](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)
- Anthropic, [Claude Code memory and rules](https://code.claude.com/docs/en/memory)
- OpenAI, [Codex subagents](https://developers.openai.com/codex/subagents)
- OpenAI, [Build skills for ChatGPT and Codex](https://developers.openai.com/codex/skills)

## 관련 내부 문서

- [Capability Scoping and Runtime Integration Principles](./agent-execution-principles.md)
- [Architecture](./architecture.md)
