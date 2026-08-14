# Skills Platform Product Roadmap

> Updated: 2026-08-14
>
> Product thesis: Skills Platform is a registry and activation catalog for agent
> skills. It answers what a skill is for, when it should be used, who trusts it,
> which template should select it, and what is actually active in each project.
> Agent-facing `skills/` directories remain delivery endpoints.

## 1. Product boundary

Skills Platform owns canonical skill sources, immutable revisions, metadata,
usage notes, preset templates, project policy, activation intent, and evidence.
Skills Manager owns provider discovery, link/copy materialization, filesystem
reconciliation, and post-activation verification.

```text
source -> Registry -> metadata / notes -> preset template -> project assignment
       -> immutable ActivationPlan -> Skills Manager adapter -> skills/ path
```

The platform never writes an agent's `skills/` directory directly, never runs
unreviewed installer scripts, and never treats a delivery directory as the
registry source of truth.

## 2. Product concepts

| Concept | Meaning | Key rule |
| --- | --- | --- |
| Skill source | Local, Git, archive, or skills.sh-resolved source. | A source is not itself active. |
| Source revision | Immutable commit/archive/content snapshot. | Existing plans retain it. |
| Registry skill | One `SKILL.md` artifact from a source revision. | Canonical content and provenance are fixed. |
| Skill profile | Management metadata and notes for a skill lineage. | Never overwrites `SKILL.md`. |
| Preset template | Reusable selection policy for a kind of work. | It is intent, not provider state. |
| Project profile | Registered project, provider, and delivery root. | It selects default and overlay templates. |
| Activation plan | Immutable desired state for one target. | Only adapter can apply it. |
| Activation report | Provider operation result. | It supports history and drift. |

## 3. Metadata and notes model

Skill content remains portable while the registry stores management information
by stable skill lineage and source revision.

### 3.1 Skill profile metadata

| Field group | Required information | Delivery phase |
| --- | --- | --- |
| Identity | title, summary, owner, maintainers, visibility | Phase 1 |
| Intent | purpose, use_when, avoid_when, non-goals | Phase 1 |
| Discovery | tags, domains, work_scope_tags | Phase 1 |
| Compatibility | provider constraints, runtime and library requirements | Phase 1 |
| Provenance | source, revision, license, digest | Core MVP; surface in Phase 1 |
| Trust | risk level, review state, reviewer, reviewed_at | Phase 1 |
| Evidence | usage metrics, evaluation summary, health | Phase 6 |

### 3.2 Notes are first-class records

Notes answer why a skill was adopted, what works or fails locally, dependencies,
migration concerns, and decisions around template membership.

```text
SkillNote
- id, skill_lineage_id, optional source_revision_id
- scope: global | project | preset | activation_run
- project_id / preset_id / activation_plan_id when scoped
- kind: usage | caveat | decision | dependency | migration | review
- body, author, created_at, updated_at, visibility
- inject_into_prompt: false by default
```

Rules:

1. Global notes apply across projects; project notes document local context.
2. Revision notes explain change or migration impact without changing source.
3. Preset/activation notes explain why a combination was selected.
4. Notes retain edit history and recoverable deletion.
5. Only explicitly marked notes may be added to a system-prompt export.

### 3.3 Feedback is structured evidence

Feedback is append-only evidence rather than an unscoped rating. Every record
belongs to a skill lineage and can be narrowed to a project, source revision,
preset, or activation run.

```text
SkillFeedback
- id, skill_lineage_id, scope and the matching target identifier
- outcome: success | correction | scope_mismatch | freshness | risk | neutral
- evidence_type: manual | evaluation | activation_report | user_feedback | incident
- summary, optional details, author, created_at, redaction state
- optional counters: attempted, successful, corrections, scope_mismatches,
  freshness_issues, risk_events
```

The default summary exposes outcome/evidence counts, supplied counters,
success rate across non-neutral signals, latest evidence, and a conservative
`healthy` / `needs_review` / `unknown` health state. It never changes preset
policy automatically.

### 3.4 Evaluation cases and review queue

Evaluation cases are versioned contracts for a skill lineage. A recorded result
always pins both the source revision and the case version, so a revised
criterion cannot inherit an earlier pass.

```text
EvaluationCase -> immutable versioned objective + criteria
EvaluationRun  -> case version + source revision + per-criterion result
ReviewQueue    -> inferred evidence only; no automatic activation/policy edit
```

The queue includes unreviewed profiles, high/critical declared risk, unhealthy
feedback, a latest revision missing an active-case result, and failed/blocked
latest evaluations. Human review resolves the underlying profile, source,
case, or feedback; queue entries are never silently dismissed.

## 4. Preset templates

A template replaces a loose collection of toggles with reusable and explainable
policy.

```text
PresetTemplate
- id, name, description, purpose, work_scope_tags, owner, lifecycle, version
- entries[]: skill_lineage_id, revision_policy, required, enabled_by_default
- constraints: provider/runtime/project signals
- template_notes

ProjectPresetAssignment
- project_id, preset_template_id, pinned_template_version
- role: default | recommended | work_scope_overlay
- priority, activation_notes
```

Revision policy is `pinned`, `latest_reviewed`, or `project_pinned`. The
built-in `Pristine` template is immutable: it selects no managed skills and
resolves to explicit disabled operations for every managed skill in scope.

## 5. Activation rules

1. A resolved template defines the complete desired state: each managed skill
   in target scope is enabled or disabled explicitly.
2. A plan includes provider, project/worktree, delivery method, revision,
   digest, canonical path, expected delivery path, and decision reason.
3. Symbolic link is default; copy is an explicit fallback with drift tracking.
4. Adapter preview rejects digest mismatch, collisions, unmanaged paths,
   incompatible provider state, and unconfirmed shared-root impact.
5. Apply requires confirmation and returns per-operation progress/report.
6. Disable changes a delivery binding only; registry content and notes remain.

## 6. Delivery roadmap

### Current — Core CLI MVP complete

- Local import into immutable content-addressed revisions.
- Project profiles, reusable presets, and `Pristine` baseline.
- Full desired-state plan generation and provenance-marked prompt export.
- Reference adapter: digest verification, preview, confirmed linking/removal,
  and unmanaged-path collision rejection.
- Cross-package test from Catalog import to adapter-created link.

Limits: local sources and JSON persistence only, CLI Catalog, and reference
adapter not yet embedded in the existing Skills Manager application.

### Phase 1 — Registry enrichment and skill management

> Status: Core CLI implemented — stable lineages, profile metadata, scoped
> notes, note history/recovery, metadata/note search, and opt-in prompt note
> inclusion, local source inspection, and canonical revision diffs are
> available. A visual source/revision detail view remains.

**Goal:** make each skill understandable, searchable, and curated before a
template can recommend it.

- Add stable skill lineages separate from individual revisions.
- Add Skill Profile metadata, completeness, lifecycle, risk, and review state.
- Add global/project/revision/preset/activation notes with history and scope.
- Add search/filter by purpose, tags, provider, source, owner, status, notes.
- Add source/revision detail and canonical prompt/content diff views.
- Add inspect-before-import; parse skills.sh-compatible source forms without
  executing arbitrary third-party installer commands.

**Exit:** users can import a skill, record purpose/use/avoid guidance and a
project caveat, search for it, and see exact source/revision history without
editing `SKILL.md`.

### Phase 2 — Template and project activation management

> Status: Core CLI implemented — templates now have purpose, work-scope tags,
> owner/lifecycle metadata, immutable versions, version-specific notes, diff,
> clone/update commands, project version pinning, and effective-set selection /
> exclusion reasons. Work-scope overlay assignments with deterministic priority
> and immutable plan/report history are also available. Portable plan exchange
> and observed-state drift comparison remain.

**Goal:** manage reusable skill configurations rather than individual toggles.

- Version `PresetTemplate` membership, purpose, constraints, ownership, notes.
- Support create-from-`Pristine`, clone, compare, and deprecate templates.
- Add default/recommended/overlay project assignments and work-scope tags.
- Show effective-set preview: selected, excluded, unavailable, conflict reasons.
- Persist plan and activation reports; compare intended and observed state/drift.
- Add portable plan export/import and schema migration.

**Exit:** users can create a planning/build template, annotate why it exists,
assign it to multiple projects, inspect effective skills, and return a project
to `Pristine` safely.

### Phase 3 — Real Skills Manager adapter integration

**Goal:** make existing Skills Manager the real provider adapter without making
it a registry.

> Status: Skills Manager CLI is now the accepted integration boundary. Catalog
> can read live global and mapped-project state from upstream `projects`,
> `providers --json`, and `bindings --json`, retain immutable snapshots, and
> compare them against a recorded pinned plan. The reference adapter remains a
> contract test harness only; direct Catalog filesystem delivery is not a
> product path. The bridge now translates a recorded plan only when every
> immutable Registry digest has a matching upstream instance, previews each
> operation, requires confirmation, applies with the CLI, then records a fresh
> upstream inspection. Batch optimization and UI progress streaming remain.

- Maintain the CLI runner and registry-revision → upstream instance mapping.
- Add `batch` optimization without weakening preview/confirmation safeguards.
- Stream upstream JSON operation progress to the UI while preserving the final
  report and re-inspected state.
- Map provider inventory, shared roots, direct skills, and existing links to
  preview reasons and progress UI.
- Preserve independent upstream tracking; Catalog storage remains external.

**Exit:** Catalog requests preview/apply, Skills Manager safeguards and reports,
and Catalog records the report without duplicated policy state.

### Phase 4 — Sources, versions, and trust

**Goal:** evolve external skills safely over time.

> Status: Git sources can be resolved to a commit and imported into the
> immutable local registry without executing installer scripts; update candidates
> are discovered without auto-adoption. An imported candidate requires an
> explicit revision review before it can create a new preset version. GitHub
> shorthand, archives, skills.sh packs, and richer trust policy remain.

- Add Git URLs, GitHub shorthand, direct paths, archives, and skills.sh packs.
- Lock commits/archive digests; store manifest/license where available.
- Add update candidates, prompt/content diff, review approval, explicit adoption.
- Add source trust, dependency declarations, security review, and policy gates.
- Add recoverable cleanup for unreferenced revisions.

**Exit:** no source update changes an active project implicitly; users approve
the exact revision adopted by each template/project.

### Phase 5 — Catalog UI and collaboration

**Goal:** deliver the same model without CLI expertise.

> Status: Project effective-set UI shell implemented — it visualizes the
> pinned default template, work-scope overlay, selected/disabled reasons,
> Pristine reset, preview progress, and recorded plan status. It is currently
> usable with its local Catalog bridge, which provides real project policy,
> read-only plan previews, and an explicit source decision queue. That queue
> requires a written rationale and can only create a new template version; it
> never repins projects or changes a provider delivery path. The inspector can
> copy the resolved, revision-marked system prompt for the selected scope.
> It can also pin a chosen registered template, including Pristine, as the
> selected project's default and replace/clear an exact work-scope overlay.
> Templates can now revise skill membership into a new immutable version;
> metadata editing and adapter report streaming remain.

- Build Registry, Skill Detail, Notes, Templates, Projects, History, Review Queue.
- Add import wizard: inspect -> select -> enrich -> template -> preview -> activate.
- Surface prompt copy/export, note inclusion, provenance, and plan progress.
- Add portable template/profile sharing, then team sync and visibility controls.

**Exit:** the Phase 2 workflow is completable in UI with clear explanation of
every active skill.

### Phase 6 — Evaluation and continuous improvement

**Goal:** recommend and improve skills from evidence, not installation count.

> Status: Structured feedback records, evidence/redaction conventions, numeric
> counters, per-lineage health summaries, versioned evaluation cases,
> per-revision criterion results, and an inferred review queue are available
> through the Catalog CLI and local bridge. Automated evaluator execution and
> richer revision comparison remain.

- Structured feedback with evidence type and redaction.
- Evaluation cases and per-revision outcomes.
- Success, correction, scope mismatch, freshness, drift, risk, and health metrics.
- Review queue for stale/unsafe/unreviewed/problematic skills and templates.
- Human-reviewed recommendations from repeated evidence; never auto policy edits.

**Exit:** the platform can explain why a template is recommended, needs review,
or is unsuitable for a project based on evidence.

## 7. Sequencing and acceptance invariants

1. Metadata and notes precede visual template management: a template needs
   “why” and “when,” not only membership.
2. Registry provenance and pinned revisions precede collaborative sync.
3. Real adapter integration precedes a UI claim that a skill was activated.
4. `latest_reviewed` never adopts an unreviewed revision.
5. Evaluation starts after plans/reports/feedback have stable identities.
6. Every enabled skill traces project -> template version -> skill lineage ->
   source revision -> digest -> activation report.
7. Every disabled skill has an explicit resolution reason.
8. No metadata/note mutation silently changes a third-party source artifact.
