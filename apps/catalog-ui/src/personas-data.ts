export type KnowledgeType = "specialized" | "general";

export interface PersonaSkill {
  skillId: string;
  skillName: string;
  knowledgeType: KnowledgeType;
  specializationLevel: 1 | 2 | 3; // 1: 기본 활용, 2: 실무 숙련, 3: 독보적 정본 권위
  routingReason: string; // 왜 이 전문가에게 가면 더 전문적인 분석을 받을 수 있는가
  authoritativeAssets?: string[];
  companionHooks?: string[];
}

export interface ExpertPersona {
  id: string;
  name: string;
  englishTitle: string;
  avatarIcon: string; // Lucide icon name
  color: string;
  badgeBg: string;
  tagline: string;
  mission: string;
  primaryDomain: string;
  collaboratesWith: string[]; // IDs of personas often paired with
  skills: PersonaSkill[];
}

export const EXPERT_PERSONAS: ExpertPersona[] = [
  {
    id: "debugging-specialist",
    name: "디버깅 전문가",
    englishTitle: "Runtime & Memory Debugging Specialist",
    avatarIcon: "Bug",
    color: "#EF4444",
    badgeBg: "rgba(239, 68, 68, 0.12)",
    tagline: "비동기 레이스 컨디션, 메모리/이벤트루프 핸들 누수, 런타임 이상 징후 정밀 추적",
    mission: "예상치 못한 프로세스 멈춤(Hang), 좀비 태스크, 소켓 미해제, 타이밍 이슈 등 복합 런타임 장애의 근본 원인(Root Cause)을 이벤트 루프 및 OS 시그널 수준에서 추적하고 교정합니다.",
    primaryDomain: "Runtime Fault Isolation & Libuv Diagnostics",
    collaboratesWith: ["chrome-automation-specialist", "qa-deterministic-specialist", "web-programming-specialist"],
    skills: [
      {
        skillId: "deterministic-test-runner",
        skillName: "Deterministic Test Runner & Lifecycle Guard",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "libuv 활성 핸들(Active Handles) 누수 및 이벤트 루프 비동기 멈춤 현상을 감지하고, C++ Protobuf 가드와 0ms 프로세스 자가 종료 시그널로 제어하는 가장 깊은 진단을 제공합니다.",
        authoritativeAssets: ["scripts/node-teardown-hook.mjs", "scripts/test-execution-guard.js", "references/node-test-lifecycle.md"],
        companionHooks: ["deterministic-test-guard"]
      },
      {
        skillId: "lch-failure-recovery",
        skillName: "LCH Failure Recovery & Fault Mitigation",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "에이전트가 장애 상황에 직면했을 때 실패 전파를 차단하고, 불변식 롤백 및 대체 경로를 도출하는 복구 상태 머신을 통제합니다.",
        authoritativeAssets: ["references/failure-taxonomy.md"]
      },
      {
        skillId: "workflow-feedback-optimizer",
        skillName: "Workflow Feedback Optimizer",
        knowledgeType: "specialized",
        specializationLevel: 2,
        routingReason: "테스트 및 실행 실패 피드백 루프를 분석하여 잘못된 시도 패턴을 교정하고 에이전트의 자기 수정 경로를 최적화합니다."
      },
      {
        skillId: "scoped-tdd-executor",
        skillName: "Scoped TDD Executor",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "버그 재현을 위한 1:1 핀포인트 단위 테스트 격리 실행 시 공통으로 활용되는 필수 기반 역량입니다."
      },
      {
        skillId: "skill-authoring-standard",
        skillName: "Skill Authoring Standard",
        knowledgeType: "general",
        specializationLevel: 1,
        routingReason: "진단 및 복구 도구 스크립트의 실행 권한 및 패키지 무결성 정적 검증에 공통 활용됩니다."
      }
    ]
  },
  {
    id: "chrome-automation-specialist",
    name: "크롬 자동화 전문가",
    englishTitle: "Chrome CDP & Headless Lifecycle Specialist",
    avatarIcon: "Compass",
    color: "#3B82F6",
    badgeBg: "rgba(59, 130, 246, 0.12)",
    tagline: "CDP 프로토콜 제어, 헤드리스 프로세스 수명주기 격리, 브라우저 자동화 위생",
    mission: "macOS 단일 인스턴스 위임 메커니즘을 꿰뚫고 있으며, 헤드리스 크롬이 사용자의 GUI 창을 가로채는 '헤드리스 트랩'과 포트 9222 점유 문제를 선별적으로 해제하고 브라우저 수명주기를 완벽히 격리합니다.",
    primaryDomain: "Browser Automation, CDP & Process Hygiene",
    collaboratesWith: ["debugging-specialist", "web-programming-specialist", "qa-deterministic-specialist"],
    skills: [
      {
        skillId: "chrome-instance-hygiene",
        skillName: "Chrome Instance & Headless State Hygiene",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "일반 GUI 크롬 창을 보존하면서 갇혀 있는 헤드리스 프로세스만 선별 종료하고, 포트 9222 및 SingletonLock 락파일을 안전하게 복구하는 독보적인 실전 솔루션을 보유합니다.",
        authoritativeAssets: ["scripts/chrome-doctor.sh", "scripts/chrome-purge-headless.sh", "scripts/chrome-reset-locks.sh", "references/macos-chrome-architecture.md"]
      },
      {
        skillId: "chrome-extensions",
        skillName: "Chrome Extensions Manifest V3 Authoring",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "Manifest V3 규격의 서비스 워커 수명주기, declarativeNetRequest 규칙, 콘텐츠 스크립트 격리 컨텍스트 설계에 특화된 권위 있는 가이드를 제공합니다.",
        authoritativeAssets: ["references/manifest-v3-guidelines.md"]
      },
      {
        skillId: "modern-web-guidance",
        skillName: "Modern Web Guidance & Standards",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "크롬 최신 브라우징 환경에서 지원되는 웹 API 및 성능 최적화 기준을 준수하기 위한 공유 지식입니다."
      },
      {
        skillId: "deterministic-test-runner",
        skillName: "Deterministic Test Runner",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "브라우저 E2E 테스트 및 자동화 스크립트 종료 시 고아 프로세스 잔류를 차단하는 테어다운에 필수적으로 연계됩니다."
      }
    ]
  },
  {
    id: "photoshop-workflow-specialist",
    name: "포토샵 작업 전문가",
    englishTitle: "Photoshop Automation & Generator TCP Specialist",
    avatarIcon: "Layers",
    color: "#8B5CF6",
    badgeBg: "rgba(139, 92, 246, 0.12)",
    tagline: "Generator TCP 49494 소켓 통신, 선언적 Action Manager JSX, TypeSpec 스키마 정합성",
    mission: "Adobe Photoshop 데스크톱 인스턴스와 TCP 49494 암호화 소켓으로 실시간 통신하며, 무헤드 PSD 파싱, 27개 폐쇄 변형 라우트, 선언적 Action Manager JSX 변환 및 TypeSpec 계약을 완벽히 동기화합니다.",
    primaryDomain: "PSD Authoring, Generator TCP 49494 & Action Manager",
    collaboratesWith: ["design-specialist", "web-programming-specialist", "debugging-specialist"],
    skills: [
      {
        skillId: "photoshop-toolchain-workflow",
        skillName: "Photoshop Toolchain & Generator TCP Workflow",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "Adobe Generator TCP 49494 패킷 프로토콜, 58개 Action Manager JSX 템플릿, TypeSpec 마스터 스키마(OpenAPI 3.2.0/3.1.0) 연동을 전담하여 PSD 레이어 변형을 완벽히 통제합니다.",
        authoritativeAssets: ["packages/spec-registry", "packages/photoshop-remote-primitives"]
      },
      {
        skillId: "svg-authoring",
        skillName: "SVG Vector Authoring",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "PSD 벡터 마스크 및 셰이프 레이어를 SVG 패스로 상호 변환하거나 내보낼 때 공통으로 결합되는 지식입니다."
      },
      {
        skillId: "scoped-tdd-executor",
        skillName: "Scoped TDD Executor",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "PSD 변형 및 Generator 패킷 왕복 검증 테스트를 안전하게 회귀 검증하기 위한 공통 TDD 역량입니다."
      }
    ]
  },
  {
    id: "web-programming-specialist",
    name: "웹 프로그래밍 전문가",
    englishTitle: "Modern Web Platform & TypeScript AST Specialist",
    avatarIcon: "Code2",
    color: "#10B981",
    badgeBg: "rgba(16, 185, 129, 0.12)",
    tagline: "현대적 웹 표준(CSS/JS API), React 19/TypeScript AST, 무손실 계약 컴파일",
    mission: "최신 웹 플랫폼 진화(Container Queries, View Transitions, :has())를 반영하고, TypeScript AST 기반의 무손실 양방향 코드-엔티티 동기화 및 플러그형 타입 어댑터(Zod, Typia) 패턴을 구현합니다.",
    primaryDomain: "Frontend Architecture, Modern Web Standards & TS AST",
    collaboratesWith: ["design-specialist", "chrome-automation-specialist", "qa-deterministic-specialist"],
    skills: [
      {
        skillId: "modern-web-guidance",
        skillName: "Modern Web Guidance (MANDATORY Web Standards)",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "구형 패턴을 배제하고 View Transitions, Anchor Positioning, Scroll-driven Animations, CWV 최적화 등 최신 웹 표준을 정확히 구현하는 독보적 설계 지침을 보유합니다.",
        authoritativeAssets: ["skills/modern-web-guidance/SKILL.md"]
      },
      {
        skillId: "lch-contract-compiler",
        skillName: "LCH Contract Compiler & AST Synchronizer",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "V3 통합 아키텍처에 따라 TypeScript AST를 활용하여 EntitySpec과 코드 간 제로-로스 양방향 동기화 및 타입 가드를 컴파일합니다."
      },
      {
        skillId: "deterministic-test-runner",
        skillName: "Deterministic Test Runner",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "모던 웹 API 서버 및 컴포넌트 통합 테스트의 안전한 실행과 테어다운에 필수적으로 공통 차용됩니다."
      },
      {
        skillId: "generative_ui",
        skillName: "Generative UI Rendering",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "웹 컴포넌트 시각화 및 인터랙티브 위젯을 HTML/CSS로 렌더링할 때 공통으로 연계됩니다."
      }
    ]
  },
  {
    id: "design-specialist",
    name: "디자인 전문가",
    englishTitle: "Mathematical Vector Graphics & UI Design Specialist",
    avatarIcon: "Paintbrush",
    color: "#F59E0B",
    badgeBg: "rgba(245, 158, 11, 0.12)",
    tagline: "수학적 정밀도의 벡터 그래픽(SVG), 인터랙티브 UI 디자인 시스템, 시각 계층 설계",
    mission: "W3C SVG 1.1/2 표준 수학 공식(베지에 곡선, 레이더/도넛 차트 각도 계산, 산키 다이어그램)을 직접 계산하여 완벽한 벡터를 생성하고, Glassmorphism과 컴포넌트 디자인 시스템을 설계합니다.",
    primaryDomain: "Mathematical SVG Engineering & Visual Design Systems",
    collaboratesWith: ["web-programming-specialist", "photoshop-workflow-specialist", "storyteller-specialist"],
    skills: [
      {
        skillId: "svg-authoring",
        skillName: "SVG Authoring (W3C Standard Mathematical Recipes)",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "3차 베지에 곡선, 극좌표 호(Arc) 기하학, 도넛/레이더/산키 차트의 수학적 매핑을 픽셀 단위로 정확하게 설계하는 유일한 도메인 정본 지식을 보유합니다.",
        authoritativeAssets: ["references/svg-chart-recipes.md", "references/bezier-math.md"]
      },
      {
        skillId: "generative_ui",
        skillName: "Generative UI & Visual Widget Engine",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "인라인 인터랙티브 위젯, 교육용 워크스루, 데이터 시각화 컴포넌트를 일관된 디자인 토큰과 Glassmorphism 스타일로 렌더링합니다."
      },
      {
        skillId: "modern-web-guidance",
        skillName: "Modern Web Guidance (CSS Styling)",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "CSS 최신 레이아웃, 컬러 공간(OKLCH), 테마 토큰 및 반응형 컨테이너 쿼리를 시각 디자인에 반영하는 공통 지식입니다."
      },
      {
        skillId: "scene-content-authoring",
        skillName: "Scene Content Authoring",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "디자인 에셋을 인터랙티브 스토리 화면의 시각적 요소로 배치하고 합성할 때 결합되는 협업 역량입니다."
      }
    ]
  },
  {
    id: "storyteller-specialist",
    name: "스토리 텔러",
    englishTitle: "Interactive Narrative & Scene Experience Specialist",
    avatarIcon: "Sparkles",
    color: "#EC4899",
    badgeBg: "rgba(236, 72, 153, 0.12)",
    tagline: "인터랙티브 서사 구조화, 순수 데이터 딕셔너리 매핑(view(state)), 3-lane 스케줄링",
    mission: "Scene Platform 기반으로 교육용 퀴즈, 시뮬레이션, 인터랙티브 서사를 제작하며, view(state) 순수 데이터 딕셔너리와 3-lane(sync, normal, frame) 스케줄러로 매끄러운 사용자 경험을 설계합니다.",
    primaryDomain: "Scene Architecture, Interactive Storytelling & Knowledge Grounding",
    collaboratesWith: ["design-specialist", "web-programming-specialist"],
    skills: [
      {
        skillId: "scene-content-authoring",
        skillName: "Scene Content Authoring & 3-Lane Scheduling",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "view(state) 순수 딕셔너리 매핑, 동기/일반/프레임 3차선 스케줄러, 리소스 스코프 분리를 적용하여 끊김 없는 인터랙티브 서사를 빌드하는 정본 기술을 갖추고 있습니다.",
        authoritativeAssets: ["references/scene-runtime-spec.md"]
      },
      {
        skillId: "openwiki-grounding",
        skillName: "OpenWiki Grounding & 2-Axis Knowledge Docs",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "지식의 근거(OKF v0.2 frontmatter)를 2축으로 체계화하고 실시간 시각 그래프로 서사 구조를 가시화하는 문서화 방법론을 관장합니다.",
        authoritativeAssets: ["references/okf-grounding-spec.md"]
      },
      {
        skillId: "openwiki-cli",
        skillName: "OpenWiki CLI & Graph Visualizer",
        knowledgeType: "specialized",
        specializationLevel: 2,
        routingReason: "리포지토리 문서 생성, 지식 그래프 정적 시각화 및 LLM 프로바이더 연동을 실행합니다."
      },
      {
        skillId: "svg-authoring",
        skillName: "SVG Authoring",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "서사형 씬 및 인터랙티브 퀴즈에서 사용되는 벡터 일러스트레이션을 표현하기 위한 공통 그래픽 지식입니다."
      },
      {
        skillId: "generative_ui",
        skillName: "Generative UI",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "스토리 중간 단계의 인터랙티브 사용자 입력 폼이나 퀴즈 컨트롤 위젯을 생성할 때 공통으로 결합됩니다."
      }
    ]
  },
  {
    id: "qa-deterministic-specialist",
    name: "QA 전문가",
    englishTitle: "QA & Deterministic Test Governance Specialist",
    avatarIcon: "CheckCircle2",
    color: "#06B6D4",
    badgeBg: "rgba(6, 182, 212, 0.12)",
    tagline: "결정론적 프로세스 테어다운, 1:1 핀포인트 TDD 거버넌스, 테스트 스톰 원천 차단",
    mission: "테스트 스톰과 무분별한 회귀 스캔을 기계적 훅으로 원천 차단하고, 1:1 핀포인트 단위 테스트 격리 원칙과 libuv 테어다운을 강제하여 무결점 릴리스 게이트를 수호합니다.",
    primaryDomain: "Deterministic Testing, TDD Governance & Guard Enforcement",
    collaboratesWith: ["debugging-specialist", "web-programming-specialist", "chrome-automation-specialist"],
    skills: [
      {
        skillId: "deterministic-test-runner",
        skillName: "Deterministic Test Runner & Lifecycle Guard",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "테스트 종료 시점에 이벤트 루프 핸들을 전수 강제 회수하고 Antigravity Protojson PreToolUse 가드로 멈춤 위험을 사전 차단하는 결정론적 검증 체계를 운영합니다.",
        authoritativeAssets: ["scripts/node-teardown-hook.mjs", "scripts/test-execution-guard.js"],
        companionHooks: ["deterministic-test-guard"]
      },
      {
        skillId: "scoped-tdd-executor",
        skillName: "Scoped TDD Executor & Test Storm Guard",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "이너루프 TDD 주기 동안 전역 회귀 테스트(npm test, pytest 등)를 기계적으로 차단하고 1:1 핀포인트 격리 검증을 강제하는 컴패니언 가드를 제어합니다.",
        authoritativeAssets: ["scripts/test-storm-guard.js"],
        companionHooks: ["test-storm-guard"]
      },
      {
        skillId: "lch-independent-auditor",
        skillName: "LCH Independent Code & Invariant Auditor",
        knowledgeType: "specialized",
        specializationLevel: 3,
        routingReason: "독립된 서브에이전트 관점에서 구현 코드와 정본 불변식(Invariants) 간의 계약 위반 및 스펙 드리프트를 감시합니다."
      },
      {
        skillId: "chrome-instance-hygiene",
        skillName: "Chrome Instance Hygiene",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "브라우저 자동화 E2E 테스트 완료 후 발생하는 좀비 크롬 프로세스와 포트 점유를 방지하고 정리하는 QA 공통 역량입니다."
      },
      {
        skillId: "skill-authoring-standard",
        skillName: "Skill Authoring Standard & Static Validation",
        knowledgeType: "general",
        specializationLevel: 2,
        routingReason: "스킬 패키지 릴리스 전 프로바이더 규격(Google Antigravity / OpenAI Codex) 정적 적합성을 판정하는 QA 품질 게이트입니다."
      }
    ]
  }
];

export interface RoutingRecommendation {
  taskKeyword: string;
  recommendedPersonaId: string;
  secondaryPersonaId?: string;
  primarySkillId: string;
  expertAdvantageRationale: string;
}

export const COMMON_ROUTING_SCENARIOS: RoutingRecommendation[] = [
  {
    taskKeyword: "크롬 창이 안 열리거나 9222 포트 에러가 발생할 때",
    recommendedPersonaId: "chrome-automation-specialist",
    secondaryPersonaId: "debugging-specialist",
    primarySkillId: "chrome-instance-hygiene",
    expertAdvantageRationale: "단순히 프로세스를 강제 종료(kill -9)하면 정상 GUI 크롬까지 닫힐 수 있습니다. 크롬 자동화 전문가는 macOS 단일 인스턴스 위임 구조를 바탕으로 사용자의 브라우징 세션을 100% 보존하면서 오직 고아 헤드리스 인스턴스와 락파일만 선별 제거하는 독보적 해법을 적용합니다."
  },
  {
    taskKeyword: "node --test 실행 후 프로세스가 끝나지 않고 멈출 때",
    recommendedPersonaId: "debugging-specialist",
    secondaryPersonaId: "qa-deterministic-specialist",
    primarySkillId: "deterministic-test-runner",
    expertAdvantageRationale: "출력 스트림 텍스트 감시 대신 libuv의 활성 핸들(Active Handles)을 열거하여 미종료 HTTP/소켓 연결을 파괴하고, Antigravity C++ Protojson 규격 가드로 사전 차단하는 수준 높은 시스템 런타임 제어를 제공받을 수 있습니다."
  },
  {
    taskKeyword: "PSD 파일의 특정 텍스트/레이어 배치 변형이 필요할 때",
    recommendedPersonaId: "photoshop-workflow-specialist",
    secondaryPersonaId: "design-specialist",
    primarySkillId: "photoshop-toolchain-workflow",
    expertAdvantageRationale: "불안정한 osascript나 UI 자동화 대신 Adobe Generator TCP 49494 패킷 통신과 선언적 Action Manager JSX 디스크립터를 사용하여, 포토샵 상태를 오염시키지 않는 100% 무손실 변형을 보장합니다."
  },
  {
    taskKeyword: "복잡한 곡선이나 데이터 차트(베지에/산키/레이더)를 그래픽으로 구현할 때",
    recommendedPersonaId: "design-specialist",
    secondaryPersonaId: "web-programming-specialist",
    primarySkillId: "svg-authoring",
    expertAdvantageRationale: "CSS나 단순 캔버스 대신 W3C SVG 1.1/2 표준에 근거한 극좌표계 기하학 및 3차 베지에 공식으로 픽셀 하나 틀림없는 정밀 벡터 산출물을 수학적으로 계산하여 완성합니다."
  },
  {
    taskKeyword: "사용자 참여형 인터랙티브 스토리나 퀴즈 교육 화면을 제작할 때",
    recommendedPersonaId: "storyteller-specialist",
    secondaryPersonaId: "design-specialist",
    primarySkillId: "scene-content-authoring",
    expertAdvantageRationale: "프레임워크 종속적인 상태 관리 대신 view(state) 순수 데이터 딕셔너리와 3차선(sync, normal, frame) 스케줄러를 적용하여, 프레임 드랍 없는 일관된 사용자 몰입형 서사를 구축합니다."
  },
  {
    taskKeyword: "TDD 개발 중 전체 테스트 스위트가 불필요하게 돌아 개발이 지연될 때",
    recommendedPersonaId: "qa-deterministic-specialist",
    secondaryPersonaId: "debugging-specialist",
    primarySkillId: "scoped-tdd-executor",
    expertAdvantageRationale: "전역 회귀 테스트(npm test)를 기계적으로 차단하는 Test Storm Guard 컴패니언 훅을 발동시켜 오직 변경된 타깃 1개만 1:1로 검증하는 초고속 이너루프 거버넌스를 강제합니다."
  }
];
