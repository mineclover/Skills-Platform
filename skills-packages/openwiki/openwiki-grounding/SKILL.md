---
name: openwiki-grounding
description: Standard guide for creating, structuring, and maintaining OpenWiki documentation with 2-axis organization, OKF v0.2 frontmatter grounding, grounded claims, and graph visualization. Use whenever updating, splitting, or creating OpenWiki docs, or serving the visualizer.
---

# OpenWiki Grounding & Knowledge Graph Skill

이 스킬은 `openwiki/` 디렉토리 기반의 코드베이스 지식 그래프 구축, OKF v0.2 메타데이터 스펙 그라운딩, 근거 기반 검증(Grounded Claims) 규칙을 안내합니다.

---

## 1. 2축 문서화 원칙 (Two-Axis Structure)

OpenWiki는 코드베이스 문서를 패키지/시스템 경계(구조적 축)와 교차 워크플로우(동작 축)의 2축으로 분리하여 체계화합니다:

- **구조적 축**: `openwiki/packages/`, `openwiki/api/`, `openwiki/cli/`
- **동작 축**: `openwiki/workflows/`, `openwiki/architecture/`, `openwiki/domain/`, `openwiki/operations/`

상세한 분할 기준과 디렉토리 배치 가이드는 [2축 분류 체계 레퍼런스](./references/two-axis-taxonomy.md)를 참고하세요.

---

## 2. 스펙 그라운딩 필수 규칙 (OKF v0.2 Frontmatter)

모든 OpenWiki 마크다운 문서는 상단에 표준 YAML frontmatter를 포함해야 합니다.

- 필수 필드(`type`, `title`, `description`)
- 코드 추적 필드(`openwiki.source_paths`, `openwiki.symbols`, `openwiki.test_paths`, `openwiki.invariants`)
- 시스템 소유 메타데이터(`generated: by: "openwiki/0.5.0"`)

전체 필드 명세와 불변식 작성 규칙은 [OKF v0.2 Frontmatter 규격서](./references/okf-frontmatter-spec.md)를 참고하세요.

---

## 3. Grounded Claims & 희소 화해(Sparse Reconciliation)

OpenWiki v0.5.0은 코드베이스 사실(AST, 심볼, 테스트)과 문서 간 일치성을 검증하는 고도화된 **Grounded Claims 엔진**을 탑재하고 있습니다:

1. **소멸/변경 감지**: 소스 코드 변경 시 오래되거나 왜곡된(Stale/Hallucinated) 주장을 자동으로 탐지 및 수정.
2. **희소 화해(Sparse Reconciliation)**:
   - 변경 없는 정상 주장은 모델 프롬프트를 왕복하지 않고 자동으로 유지(Retained automatically).
   - 검토 필요한 주장만 명시적 결정: `confirmedClaimIds`(확인), `claims`(수정/신규), `retractedClaimIds`(철회).
   - 필요 시 `openwiki_inspect_page_claims`로 페이지 내 전체 주장을 온디맨드 조회.
3. **내구성 있는 진행도 매니페스트**:
   - `openwiki/.page-manifest.json`을 통해 로컬, CI, 호스트 간 중단된 실행을 원자적으로 재개.

---

## 4. 시각화 및 정적 내보내기 명령

```bash
# 1. 로컬 실시간 인터랙티브 노드 그래프 & 리더 구동 (:4321, 크기 조절/접기 패널, 라벨 디클러터링 지원)
openwiki visualize
# 또는 포트 지정 및 브라우저 자동 오픈 방지
openwiki visualize openwiki --port 3000 --no-open

# 2. 팀 공유 및 정적 호스팅용 독립 패키지 내보내기
openwiki visualize openwiki --export ./public/wiki-graph
# 결과: index.html, client.js, client-lib.js, styles.css, graph.json
```

---

## 5. 스킬 거버넌스 및 유지보수 워크플로 (Skills Platform Maintenance & Golden Path)

본 스킬은 Skills Platform의 불변 레지스트리 및 참조 링크(`symlink`) 아키텍처에 의해 관리됩니다:

- **원본 패키지 (Canonical Source)**: `~/workflow/Skills-Platform/skills-packages/openwiki/openwiki-grounding/`
- **배포 및 관리 방식**: Skills Platform Registry 불변 스냅샷 $\to$ Skills Manager 어댑터 참조 링크(`symlink`) 배포
- **업데이트 사이클 (Golden Path)**:
  1. **원본 수정**: 명세 추가 및 규칙 보완 시 원본 패키지(`skills-packages/openwiki/openwiki-grounding/`)를 편집합니다.
  2. **정적 거버넌스 검증**:
     ```bash
     node apps/skills-catalog/src/cli.js skill validate skills-packages/openwiki/openwiki-grounding --provider antigravity
     node apps/skills-catalog/src/cli.js skill validate skills-packages/openwiki/openwiki-grounding --provider codex
     ```
  3. **새 불변 리비전 임포트 (필요 시)**:
     ```bash
     node apps/skills-catalog/src/cli.js import-local skills-packages/openwiki/openwiki-grounding
     ```
  4. **프로젝트 참조 링크 최신화**:
     ```bash
     node apps/skills-catalog/src/cli.js project link openwiki openwiki-grounding --latest
     ```
  5. **참조 링크 직접 수정 시의 동기화**: 프로젝트 작업 중 심볼릭 링크를 통해 직접 수정한 경우라도, 작업 완료 후 원본 패키지에 변경 사항을 반영하고 위 절차를 통해 레지스트리 무결성을 유지합니다.
