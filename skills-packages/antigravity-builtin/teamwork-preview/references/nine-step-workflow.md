# 9-Step Interactive Prompt Crafting Runbook

Detailed operational guide for guiding the user through Steps 1–9 and preparing the living `prompt_draft.md` artifact.

---

## 1. Elicit the Idea (Step 1)
- **Goal**: Establish the project's core mission in 1–2 sentences.
- **Probe**: Purpose (Demo vs Production vs Benchmark vs Research), primary target audience, core deliverable.
- **Artifact Update**: Replace `[Project description]` in `prompt_draft.md` and transition status to `Step 2`.

---

## 2. Identify Ambiguity & Scale (Step 2)
- **Dimensions**:
  - *Data Sources*: Static dataset vs live crawling vs agent-selected synthetic data.
  - *Tech Constraints*: Hard restrictions (e.g. Python 3.11 only, no external deps).
  - *Quality Bar*: Quick prototype vs production-grade test coverage.
- **Team Scale Opt-Ins**:
  - *Small Focused Team*: For single bug fixes. Phrasing: `"This is a single self-contained fix; keep it small and focused."`
  - *Proof, Very Large Team*: For extreme scale math/formal proofs. Phrasing: `"Use a very large team of agents."`

---

## 3. Determine Integrity Mode (Step 3)
Pose behavioral multiple-choice questions via `ask_question` (`is_multi_select: true`):
1. Copying code from open-source projects for core logic
2. Using pre-built libraries/frameworks for core functionality
3. Running external scripts or delegating execution to other tools
4. Reading test source code before implementing
5. No restrictions — use any approach that works

**Mode Resolution**:
- Option 5 or none selected ➔ `integrity_mode: development`
- Any of 1–4 selected (not all) ➔ `integrity_mode: demo`
- All of 1–4 selected ➔ `integrity_mode: benchmark`

---

## 4. Draft Requirements (Step 4)
- Formulate 2–5 numbered blocks (R1, R2, R3...).
- 1–3 sentences each specifying **what** is delivered, not internal architecture or file layouts.

---

## 5. Design Objective Verification (Step 5)
- **Why it matters**: Verification is a forcing function to compel iterative debugging.
- **Types**:
  - *Programmatic*: Unit test runners (`npm test`, `pytest`), benchmark scripts, CLI exit codes.
  - *Agent-as-Judge*: Explicit rubric concrete enough that two independent auditors reach consensus.
- Incorporate user-provided fixtures or expected I/O samples under `## Verification Resources`.

---

## 6. Set Acceptance Criteria (Step 6)
- Convert verification targets into concrete checkable checkboxes (`- [ ]`).
- Guardrail calibration:
  - *Demo*: Achievable within short time budget.
  - *Production*: Strict linting, 100% target tests, zero regression.
  - *Eval*: Deterministic reproducibility.

---

## 7. Infrastructure Constraints (Step 7)
- State controlled APIs for cloud storage (GCS/S3), compute clusters, or external network access.
- Pattern: *"You must use the provided controlled API for X. Logic is internal; execution is managed externally."*

---

## 8. Choose Working Directory (Step 8)
- Default: `~/teamwork_projects/{PROJECT_NAME}`
- Add top-level directive: `Working directory: <path>`

---

## 9. Assemble, Validate & Present (Step 9)
Run validation checklist:
- [ ] No unsolicited implementation hints
- [ ] Every acceptance criterion is objectively checkable
- [ ] Opt-in team request explicitly stated in prompt opening (if requested)
- [ ] Working directory and integrity mode declared

Present draft to user for final sign-off. Once approved, execute the Delegation Protocol.
