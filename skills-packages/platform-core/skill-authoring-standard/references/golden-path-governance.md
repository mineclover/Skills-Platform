# Skill Governance & Maintenance Golden Path Standard

Every canonical skill package hosted in `skills-packages/` must document its governance lifecycle in the final section of `SKILL.md` (conventionally Section 10, or the concluding section before appendixes).

---

## 1. Canonical Governance Section Specification

Each skill's `SKILL.md` must declare:
1. **Canonical Source Path**: Explicit repository path under `skills-packages/<group>/<skill-name>/`.
2. **Delivery Mechanism**: Reference to the 2-tier delivery model (Skills Platform Registry snapshot / direct source symlink via Skills Manager adapter).
3. **The 5-Step Golden Path Lifecycle**:
   - Step 1: Canonical source modification.
   - Step 2: Static governance validation via CLI (`skill validate`).
   - Step 3: Optional immutable revision ingestion (`import-local` or `skill freeze`).
   - Step 4: Project link synchronization (`project link`).
   - Step 5: In-place direct edit reconciliation.

---

## 2. Standard Markdown Template

Include the following template in the skill's `SKILL.md` (localized into Korean or English to match the document's primary language):

```markdown
## 스킬 거버넌스 및 유지보수 워크플로 (Skills Platform Maintenance & Golden Path)

본 스킬은 Skills Platform의 불변 레지스트리 및 참조 링크(`symlink`) 아키텍처에 의해 관리됩니다:

- **원본 패키지 (Canonical Source)**: `~/workflow/Skills-Platform/skills-packages/<group>/<skill-name>/`
- **배포 및 관리 방식**: Skills Platform Registry 불변 스냅샷 $\to$ Skills Manager 어댑터 참조 링크(`symlink`) 배포
- **업데이트 사이클 (Golden Path)**:
  1. **원본 수정**: 기능 추가 및 수식/규격 보완 시 원본 패키지(`skills-packages/<group>/<skill-name>/`)를 편집합니다.
  2. **정적 거버넌스 검증**:
     ```bash
     node apps/skills-catalog/src/cli.js skill validate skills-packages/<group>/<skill-name> --provider antigravity
     node apps/skills-catalog/src/cli.js skill validate skills-packages/<group>/<skill-name> --provider codex
     ```
  3. **새 불변 리비전 임포트 (필요 시)**:
     ```bash
     node apps/skills-catalog/src/cli.js import-local skills-packages/<group>/<skill-name>
     # 또는 특정 버전 동결 인스턴스 생성
     node apps/skills-catalog/src/cli.js skill freeze <skill-name> --version <semver>
     ```
  4. **프로젝트 참조 링크 최신화**:
     ```bash
     # 실시간 최신 개발 트랙 (Tier 1: floating_latest)
     node apps/skills-catalog/src/cli.js project link <project-id> <skill-name> --latest
     # 또는 특정 버전 고정 (Tier 2: version_pinned)
     node apps/skills-catalog/src/cli.js project link <project-id> <skill-name> --version <semver>
     ```
  5. **참조 링크 직접 수정 시의 동기화**: 프로젝트 작업 공간(`.agents/skills/<skill-name>`)에서 심볼릭 링크를 통해 직접 수정한 경우라도, 작업 완료 후 원본 패키지에 변경 사항이 안전하게 반영되었는지 확인하고 위 절차를 통해 레지스트리 무결성을 검증합니다.
```

---

## 3. Review Rules for Governance Compliance

- **Validation Rule**: If a canonical package is intended for multi-project distribution, verify that its `SKILL.md` links back to its canonical platform path.
- **Sidecar Requirement**: Ensure the delivery target has a companion `*.skills-platform-link-ownership.json` recording `method: "direct_source_symlink"` and `binding_policy: "floating_latest" | "version_pinned"`.
