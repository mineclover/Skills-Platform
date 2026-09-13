# 커뮤니티 레시피와 개방형 프리셋 확장 가이드 (Community Recipes & Extensible Presets Guide)

> **상태**: 공식 커뮤니티 가이드 (Official Community Guide)  
> **적용 범위**: Skills Platform CLI (`apps/skills-catalog`), 카탈로그 엔진, 레시피 배포 규격  
> **핵심 원칙**: 개방형 조합 프레임워크 (Open Composability Substrate) 및 느슨한 결합 (Loose Coupling)

---

## 1. 개요: 개방형 조합 프레임워크 (Open Composability Substrate)

Skills Platform은 특정 에이전트 아키텍처나 단일 제어 평면(Control Plane)을 모든 프로젝트에 획일적으로 강제하지 않습니다.  
과거 플랫폼 문서에서 언급되던 **Modular Lifecycle Context (MLC)**, 10단계 케이스 상태 머신, 또는 3단계 라이프사이클 루프(Plan ➔ Inner Loop TDD ➔ Release Gate)는 엄격한 결정론적 거버넌스가 필요한 시스템을 위해 검증된 **'참고용 레퍼런스 템플릿(Optional Reference Template)'**이자 다양한 조합 예시 중 하나입니다.

본 플랫폼의 진정한 목표는 **개방형 조합 기저(Open Composability Substrate)**로서, 커뮤니티와 개별 프로젝트가 자신만의 개발 철학과 도구 환경에 맞는 독자적인 스킬 조합을 1급 시민으로 자유롭게 정의, 조합, 오버레이, 공유할 수 있도록 지원하는 것입니다.

---

## 2. 카탈로그 탐색 패싯 (Discovery Facets: Tier 1~4)

`recipes/index.json` 매니페스트에 정의된 Tier 1~4는 상하 종속적인 강제 계층 사다리가 아니라, 프로젝트 상황과 관심사에 따라 스킬 조합을 선별할 수 있는 **'카탈로그 탐색 패싯(Discovery Facets)'**입니다.

```text
[ Skills Platform Catalog Discovery Facets ]
  ├── Facet 1: Foundation & Platform Core (Tier 1)
  │     ↳ 플랫폼 온보딩, 프로바이더별 스킬 작성 규칙, 선택적 디버깅 추천 팩
  ├── Facet 2: Lifecycle Procedure Loops (Tier 2)
  │     ↳ 절차적 워크플로우: 외루프 기획(Plan), 내루프 TDD(Execute), 릴리스 검증(Gate)
  ├── Facet 3: Modular Architecture & Context Engines (Tier 3)
  │     ↳ MLC 레퍼런스 컴포넌트: 80k 기준선 압축기, 재귀 탐색 엔진, 도메인 오버레이
  └── Facet 4: Multi-Provider & Community Ecosystems (Tier 4)
        ↳ Paperthin 코딩 반사신경, Antigravity 네이티브 워크트리, Codex 및 커뮤니티 풀스택 팩
```

### 패싯별 특징 및 채택 가이드

| 패싯 | 경로 | 성격 | 추천 시나리오 |
|---|---|---|---|
| **Facet 1: Platform Core** | `recipes/tier1-platform-core/` | 기반 인프라 | 새로운 스킬을 작성하거나, 프로젝트 기본 환경을 설정하거나, 버그를 심층 진단할 때 |
| **Facet 2: Procedure Loops** | `recipes/tier2-procedure-loops/` | 절차적 루프 | PRD 분해부터 핀포인트 TDD, 회귀 게이트까지 단계별 통제가 필요할 때 |
| **Facet 3: MLC Architecture** | `recipes/tier3-mlc-architecture/` | 레퍼런스 모델 | 대규모 코드베이스에서 80k 토큰 압축 및 10단계 케이스 머신 거버넌스를 채택할 때 |
| **Facet 4: Ecosystem & Community** | `recipes/tier4-ecosystem/` | 생태계 및 자율 | Antigravity Git 격리 환경, 고밀도 코딩 반사신경, 또는 커뮤니티 개발 도구셋을 사용할 때 |

---

## 3. 커스텀 프리셋 생성 및 관리 워크플로우

개발팀은 카탈로그 CLI를 사용하여 손쉽게 자신만의 독자적인 프리셋을 생성하고 버전 관리할 수 있습니다.

### 3.1 스킬 탐색
```bash
# 로컬 레지스트리의 전체 등록 스킬 조회
node apps/skills-catalog/src/cli.js skill list

# 키워드 검색 및 태그 필터링
node apps/skills-catalog/src/cli.js skill search "test" --tag "authoring"
```

### 3.2 프리셋 생성 (`preset create`)
```bash
node apps/skills-catalog/src/cli.js preset create my-team-starter \
  --name "My Team Starter Suite" \
  --description "Lean everyday coding and code review preset" \
  --purpose "Standard team onboarding preset focusing on TDD and review" \
  --work-scope coding \
  --work-scope review \
  --owner "Frontend Guild" \
  --lifecycle draft \
  --skill reg_scoped_tdd_executor \
  --skill reg_grill_me
```

#### 주요 옵션 설명:
- `--name`: 프리셋의 사람이 읽을 수 있는 명칭.
- `--description` / `--purpose`: 프리셋의 설계 의도 및 역할 서술.
- `--work-scope <tag>`: 동적 오버레이 활성화에 사용될 작업 스코프 태그 (다중 지정 가능).
- `--lifecycle`: 생명주기 상태 (`draft`, `reviewed`, `deprecated`). 초기 생성 시 `draft` 권장.
- `--skill <id>`: 레지스트리에 등록된 스킬 ID (다중 지정 가능).

### 3.3 프리셋 조회 및 협업 메모 추가
```bash
# 등록된 프리셋 목록 확인
node apps/skills-catalog/src/cli.js preset list

# 프리셋 상세 정보 및 활성 버전 스냅샷 확인
node apps/skills-catalog/src/cli.js preset show my-team-starter

# 템플릿에 협업 변경 메모(Note) 추가
node apps/skills-catalog/src/cli.js preset note add my-team-starter \
  --author "Alice" \
  --body "Adopted scoped TDD executor for faster feedback loops."
```

---

## 4. 휴대용 커뮤니티 레시피 내보내기 (`recipe export`)

생성한 프리셋을 다른 프로젝트나 팀원, 또는 오픈소스 커뮤니티에 배포하려면 독립형 레시피 JSON 파일로 내보냅니다.

```bash
node apps/skills-catalog/src/cli.js recipe export \
  --preset my-team-starter \
  --name "Community Team Starter Recipe" \
  --description "Portable starter recipe exported for community distribution" \
  --out recipes/tier4-ecosystem/community-team-starter-recipe.json
```

### 레시피 내보내기 엔진의 자동 처리:
1. **리비전 고정**: 프리셋에 포함된 모든 스킬의 Git 커밋 해시와 SHA-256 `content_digest`를 불변으로 박제합니다.
2. **프로필 메타데이터 정제**: 로컬 감사 로그, 승인자 서명 등 비휴대용 내부 필드를 제외하고 안전한 공개 필드(`RECIPE_PROFILE_FIELDS`)만 추출합니다.
3. **계약 스키마 검증**: `@skills-platform/contracts`의 `validateSkillRecipe`를 통해 스키마 무결성을 보증합니다.

---

## 5. 느슨한 결합(Loose Coupling)과 동적 오버레이 (`--work-scope`)

모든 스킬을 에이전트 세션에 한 번에 주입하면 토큰 낭비, 모델 주의력 분산, 도구 오작동이 발생합니다.  
Skills Platform은 **작업 스코프 태그(`--work-scope`) 기반의 동적 오버레이**를 통해 필요한 순간에만 스킬을 주입합니다.

### 5.1 프로젝트 프리셋 할당 3대 역할

| 역할 (Role) | 활성화 시점 | 동작 특징 |
|---|---|---|
| **`role: "default"`** | 세션 실행 시 상시 활성화 | 프로젝트의 필수 기본 스킬셋. 프로젝트당 정확히 1개 할당. |
| **`role: "recommended"`** | **자동 활성화되지 않음 (Advisory)** | 프로젝트에 권장되는 후보 프리셋을 카탈로그에 기록만 함. 팀의 명시적 선택 전까지 비활성. |
| **`role: "work_scope_overlay"`** | **요청된 태그 일치 시에만 동적 활성화** | 평소에는 비활성 상태이며, CLI나 에이전트가 해당 `--work-scope` 태그를 명시할 때만 활성화. |

### 5.2 태그 매칭 로직 (`hasAllTags` 진부분집합 규칙)

오버레이 할당의 태그 매칭은 **선언된 모든 태그가 요청된 태그 집합에 포함될 때만** 성립합니다:

$$\text{Active}(O) \iff O.\text{work\_scope\_tags} \subseteq \text{RequestedTags}$$

- **단일 태그 선언** (`["debugging"]`):  
  `--work-scope debugging` 전달 시 즉시 활성화.
- **다중 태그 선언** (`["security", "audit"]`):  
  `--work-scope security --work-scope audit` 두 태그가 모두 전달되어야 활성화. 하나만 전달되면 활성화되지 않음.
- **빈 태그 선언** (`[]`):  
  오버레이 호출 시 항상 활성화.

### 5.3 우선순위(Priority) 및 리니지 재정의(Collision Resolution)

여러 오버레이가 동시에 활성화될 때의 충돌 해결 원칙:
1. **오름차순 정렬**: 오버레이는 `priority` 오름차순(낮은 번호 ➔ 높은 번호)으로 순차 적용됩니다.
2. **리니지 단위 덮어쓰기 (`selectedByLineage`)**: 상위 우선순위 오버레이가 동일한 `lineage_id`를 가진 스킬을 제공할 경우, 기존 기본셋이나 하위 오버레이의 스킬을 깨끗하게 교체합니다.
3. **비충돌 스킬의 합집합 결합**: 서로 다른 `lineage_id`를 가진 스킬들은 충돌 없이 기존 목록에 안전하게 추가(Union)됩니다.
4. **결정론적 타이 브레이크**: 두 오버레이의 `priority`가 동일할 경우, `preset_id`의 사전순 정렬을 통해 결과의 100% 결정론성을 보장합니다.

---

## 6. 경량 독립형 레시피 설계 패턴 (Lean Recipes)

### 6.1 메가 번들(Mega-Bundle) 안티패턴 방지
"스킬이 많을수록 좋다"는 생각으로 30~50개 스킬을 하나의 거대 번들로 묶는 것은 대표적인 안티패턴입니다.  
- 모델의 프롬프트 지시 이행 능력이 급격히 저하됩니다.
- 불필요한 훅과 파일 감시기가 과도한 리소스를 점유합니다.
- 특정 스킬 하나를 수정하거나 디버깅하기 위해 전체 시스템을 검증해야 합니다.

### 6.2 마이크로 프리셋(Micro-Preset) 모범 사례
단일 작업 목적에 특화된 **1~5개의 스킬로 구성된 가벼운 프리셋**을 구성하는 것이 가장 효과적입니다.

#### 플랫폼 내 검증된 경량 레시피 사례:
- **1-Skill 디버깅 오버레이** (`recipes/tier1-platform-core/skills-platform-debugging-recipe.json`):
  - 포함 스킬: `diagnosing-bugs` (1개)
  - 작업 태그: `["debugging"]`
  - 의존성: 제로 훅, 제로 프로젝트, 순수 독립형.
- **6-Skill 커뮤니티 개발 스위트** (`recipes/tier4-ecosystem/community-dev-recipe.json`):
  - 포함 스킬: `diagnosing-bugs`, `synthesizing-specs`, `test-first-opt-in`, `resolving-conflicts`, `requesting-code-reviews`, `receiving-code-reviews` (6개)
  - 작업 태그: `["community", "development", "fullstack"]`
  - 용도: 복잡한 아키텍처 제어 엔진 없이도 일상 개발 라이프사이클을 온전히 지원.

---

## 7. 패키징 및 Git 소스 배포 절차

### 7.1 표준 레시피 JSON 스키마 (`SkillRecipe` v1)

```json
{
  "schema_version": 1,
  "recipe_id": "recipe-community-web-tools",
  "name": "Community Web & Vector Design Tools",
  "description": "Standalone community recipe for modern frontend styling and vector graphic generation.",
  "created_at": "2026-09-13T12:00:00.000Z",
  "created_by": "community",
  "sources": [
    {
      "source_id": "src_community_repo",
      "type": "git",
      "locator": "https://github.com/my-community/agent-skills.git",
      "ref": "main",
      "resolved_commit": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ],
  "skills": [
    {
      "name": "modern-web-guidance",
      "artifact_type": "skill",
      "invocation_mode": "hybrid",
      "source_id": "src_community_repo",
      "source_relative_path": "skills/modern-web-guidance",
      "content_digest": "4a5e1e582e32be50f90b4597553098440499d65036a30ae5ebec6fac90f3d538",
      "description": "Search tool and guidance for modern HTML/CSS and clientside JS standards."
    }
  ],
  "presets": [
    {
      "id": "community-web-tools",
      "name": "Community Web Tools Preset",
      "version": 1,
      "owner": "Community Contributors",
      "lifecycle": "reviewed",
      "purpose": "Provides modern web layout and SVG generation skills.",
      "work_scope_tags": ["frontend", "ui"],
      "skills": [
        {
          "skill_name": "modern-web-guidance",
          "source_relative_path": "skills/modern-web-guidance",
          "artifact_type": "skill",
          "required": true
        }
      ]
    }
  ],
  "projects": []
}
```

### 7.2 적용 및 검증 명령
```bash
# 1. 무결성 검증
node apps/skills-catalog/src/cli.js recipe inspect <recipe-file>

# 2. 사전 시뮬레이션 (Dry-Run Preview)
node apps/skills-catalog/src/cli.js recipe apply <recipe-file> --path <target-project>

# 3. 확정 적용 (Confirmed Apply)
node apps/skills-catalog/src/cli.js recipe apply <recipe-file> --path <target-project> --confirm
```

---

## 8. 커뮤니티 기여 및 품질 체크리스트

새로운 레시피를 `recipes/` 또는 프로젝트에 등록할 때는 다음 항목을 확인하십시오:

1. **식별자 규칙**: `recipe_id`와 `preset_id`는 kebab-case(`recipe-<domain>-<name>` 또는 `<domain>-<name>`)를 준수합니다.
2. **해시 검증**: 모든 스킬 엔트리에 유효한 64자리 16진수 SHA-256 `content_digest`가 포함되어야 합니다.
3. **명확한 목적과 태그**: 프리셋에 구체적인 `purpose`와 dynamic overlay용 `work_scope_tags`가 명시되어야 합니다.
4. **점진적 생명주기**: 커뮤니티 기고 시 `draft`로 등록하고, 테스트 통과 및 검토 후 `reviewed`로 승격합니다.
5. **무회귀 검증 통과**:
   ```bash
   node apps/skills-catalog/src/cli.js preset list
   npm run check
   npm test
   node tests/e2e/run-all.js
   ```

---

## 9. 관련 가이드 및 문서 색인

- 📖 **레시피 디렉터리 안내서**: [recipes/README.md](../../recipes/README.md)
- 🎯 **스킬 선별 및 정렬 기준**: [docs/guides/recommended-skillsets-guide.md](./recommended-skillsets-guide.md)
- 🔄 **루프 유형별 매트릭스 거버넌스 사양서**: [docs/guides/loop-types-and-skill-presets-matrix.md](./loop-types-and-skill-presets-matrix.md)
- 📋 **통합 카탈로그 인덱스 매니페스트**: [recipes/index.json](../../recipes/index.json)
- 🏛️ **플랫폼 불변식 기준선**: [MASTER_BASELINE.md](../../MASTER_BASELINE.md)
