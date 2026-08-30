# Teamwork Prompt Scaffold Template

Authoritative template for `<appDataDir>\brain\<conversation-id>/prompt_draft.md`.

---

```markdown
# Teamwork Project Prompt — Draft

> Status: Ready for launch — awaiting user approval
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: [none — teamwork routes from the description]

[Project description — 1-2 sentences stating purpose and target audience]

Working directory: ~/teamwork_projects/{PROJECT_NAME}
Integrity mode: development

[Optional: ## Reference Material
- Spec URL / Paper / API Docs link]

## Requirements

### R1. [Primary Deliverable]
[Clear description of what must be built/delivered; avoid prescribing internal architecture]

### R2. [Secondary Deliverable or Constraint]
[Additional functional requirements or external environment constraints]

[Optional: ### R3. [Controlled Infrastructure]
- Controlled API usage for cloud storage, cluster compute, or network calls]

## Verification Resources (Optional)
- User-provided test fixtures, I/O samples, or reference CLI outputs

## Acceptance Criteria

### Core Functionality
- [ ] [Objective, checkable condition verifying R1]
- [ ] [Objective, checkable condition verifying R2]

### Quality & Regression Guardrails
- [ ] All unit and integration test suites pass with 0 errors
- [ ] Zero unhandled exceptions or memory leaks under benchmark load

---
*Next: when approved → delegate via invoke_subagent (see Delegation Protocol)*
```
