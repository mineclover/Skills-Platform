# Skill Reference and Delivery Guide: Concepts, Direct Links, and Partial Updates

This guide defines the architectural philosophy, core concepts, and operational workflows for connecting, developing, and delivering skills between the central Skills Platform store and target project environments.

For first-time installation and the distinction between Vercel `skills` CLI
installation and Catalog-managed delivery, start with the
[official installation guidebook](./skills-installation-guide.md).
This document covers the advanced direct-reference workflow. `project link`
changes files immediately; the standard reviewed delivery path is Catalog
registration, selection, `project apply` preview, then `project apply --confirm`.

---

## 1. Architectural Philosophy: The True Role of a Skill Manager

A skill management system should not burden developers with heavyweight synchronization daemons, constant snapshot-building steps, or multi-command manual pipelines during everyday development.

The core value of the **Skills Manager** is:
1. **Friction-Free Reference Linking**: Seamlessly connecting central skill packages (`skills-packages/`) to target project runtimes (`.agents/skills/`) without duplicating files or causing source divergence.
2. **Explicit Ownership**: Recording the delivery owner through lightweight sidecars (`*.skills-platform-link-ownership.json`). Adapter preview/apply checks ownership; a sidecar does not prevent external tools from modifying the path, and the direct-link path has weaker checks described below.
3. **Two-Tier Flexibility**: Providing instantaneous "just refresh" live development for local inner-loop authoring, while preserving cryptographic immutability (SHA-256 snapshots) whenever official versioning or release governance is needed.

---

## 2. Two-Tier Delivery Model

Skills Platform operates on a 2-tier delivery architecture:

```text
┌──────────────────────────────────────────────┐    ┌──────────────────────────────────────────────┐
│       CANONICAL PACKAGES (배포본 원본)        │    │        INSTANCES REPOSITORY (인스턴스)       │
│    skills-packages/<group>/<skill-name>/     │    │   skills-instances/<group>/<skill>@<version> │
│                                              │    │                                              │
│  [Rolling Latest Active Dev Track]           │    │  [Immutable Frozen Version Snapshots]        │
│  skills-packages/.../svg-authoring           │    │  skills-instances/.../svg-authoring@1.0.0   │
└──────────────────────┬───────────────────────┘    └──────────────────────┬───────────────────────┘
                       │                                                   │
      [Tier 1: floating_latest Mode]                       [Tier 2: version_pinned Mode]
      (Active Prototyping & Inner Loop)                    (Production Baselines & Frozen Releases)
                       │                                                   │
                       │ Direct Symlink                                    │ Version-Named Symlink
                       ▼                                                   ▼
    ┌──────────────────────────────────────┐            ┌──────────────────────────────────────────┐
    │   PROJECT RUNTIME: TRACKING LATEST   │            │    PROJECT RUNTIME: PINNED TO v1.0.0     │
    │   .agents/skills/svg-authoring       │            │    .agents/skills/svg-authoring          │
    │   └──> points to skills-packages/... │            │    └──> points to skills-instances/...  │
    └──────────────────────────────────────┘            └──────────────────────────────────────────┘
```

### Tier 1: Direct Reference Mode (Live Dev Link — "Just Refresh")
- **How it works**: The project's `.agents/skills/<skill-name>` symlink points directly to the canonical latest source package in `skills-packages/<group>/<skill-name>`.
- **Binding Policy**: `"floating_latest"`
- **Key Characteristics**:
  - **Zero Sync Overhead**: No compilation, no snapshot ingestion, no watch daemon required.
  - **Live File Reflection**: Saving an edit in `SKILL.md`, `references/`, or `scripts/` makes the new bytes visible through the project link. Agent rediscovery and instruction loading remain provider-specific.
  - **Bidirectional Editing**: Developers and autonomous agents navigating into `.agents/skills/<skill-name>` modify the canonical source directly, eliminating out-of-sync workspace drift.
  - **Agent / IDE Refresh**: After saving changes, explicitly reload or re-read the skill through the host's supported workflow and verify its behavior in a new task when needed.
  - **Ownership Recorded**: A sidecar with `"method": "direct_source_symlink"` identifies the link. External installers do not enforce this record; use one owner per skill delivery path.

### Tier 2: Governed Version-Pinned Mode ("Dedicated Instance Repository")
- **How it works**:
  - **Local Development Standard (Most Effective)**: The project points directly to an instance snapshot in the dedicated instances repository (`skills-instances/<group>/<skill-name>@<version>`), keeping the distribution store (`skills-packages/`) clean while keeping instances human-readable and instantly diffable.
  - **Registry Plan Mode**: The standard Catalog workflow imports an immutable revision into `.skills-platform/registry/revisions/<revision_id>/artifacts/`, records its digest, and delivers it through preview/apply. This works for local team projects as well as CI and audit workflows.
- **Binding Policy**: `"version_pinned"`
- **Key Characteristics**:
  - **Distribution Tree Hygiene**: `skills-packages/` remains strictly for canonical package authoring, free from clutter of immutable historical versions.
  - **Ripple Protection**: Prevents prompt experiments in `latest` from accidentally breaking production agent behaviors.
  - **Human-Readable Clarity**: Inspecting symlinks clearly displays the target version (e.g. `@1.0.0`) without querying metadata catalogs.
  - **Separate Review Evidence**: Catalog review and preset selection govern the registry-plan workflow. A direct `project link --version` does not itself check source approval or evaluation results.

---

## 3. Skill Versioning & Agent Spec Ripple Control: Floating Latest vs. Version Pinning

Skills influence an agent's workflow instructions. **Changing a shared source makes the new files visible to every linked project**; behavior changes when each host next loads those instructions. File visibility and instruction reload are separate events.

Without strict version governance, a change made to improve an authoring skill in Project A could inadvertently alter the prompt behavior or output formatting of an agent in Project B, causing regressions or unexpected runtime drift.

To resolve this, Skills Platform establishes a formal distinction between two binding policies:

### 3.1. Policy A: Floating `latest` (Rolling Development Track)
- **Target Environments**: Active development workspaces, prototypes, experimental loops.
- **Mechanism**: The project links via `method: "direct_source_symlink"` pointing to canonical `skills-packages/...`.
- **Behavior**:
  - Automatically receives all prompt tweaks, script enhancements, and reference updates upon file save.
  - The developer or agent simply "refreshes" to load the latest instructions.
  - Ideal for inner-loop iterations where the developer is intentionally co-evolving the skill and the project code.

### 3.2. Policy B: Pinned to Specific Version (`version_pinned`)
- **Target Environments**: Production baselines, benchmark suites, release branches, audited workspaces.
- **The Most Effective Local Handling Method: Dedicated Instance Repository (`skills-instances/`)**:
  Instead of burying historical snapshots in obscure cryptographic hash directories (`.skills-platform/registry/revisions/revision_xxxx/...`) or cluttering the distribution packages tree (`skills-packages/`), the cleanest and most practical local mechanism is **maintaining version-named instance directories (e.g. `<skill-name>@<version>`) in a dedicated instances repository (`skills-instances/`)**:
  ```text
  skills-packages/platform-core/
    └── svg-authoring/            # Canonical distribution package (for floating_latest projects)

  skills-instances/platform-core/
    ├── svg-authoring@1.0.0/      # Frozen v1.0.0 instance (for version_pinned projects)
    └── svg-authoring@2.0.0/      # Frozen v2.0.0 instance (for version_pinned projects)
  ```
  - When a project binds to `version_pinned` at `v1.0.0`:
    `.agents/skills/svg-authoring` simply symlinks to `skills-instances/platform-core/svg-authoring@1.0.0`.
  - **Why this pattern is optimal for local development**:
    1. **Distribution Integrity**: `skills-packages/` contains only active canonical packages, preventing pollution from old snapshots.
    2. **Instant Human-Readable Transparency**: Running `ls -la .agents/skills` immediately reveals the exact pinned version at a glance without reading registry databases.
    3. **Zero Ingestion/Unpack Overhead**: Follows the identical lightweight Unix symlink mechanism as Tier 1.
    4. **Effortless Local Diffs**: Run `diff -r skills-packages/platform-core/svg-authoring skills-instances/platform-core/svg-authoring@1.0.0` to immediately inspect prompt divergences.
    5. **Isolated Breaking Changes**: Authors can introduce disruptive prompt architectures in `svg-authoring/` without breaking baseline project agents pinned to `@1.0.0`.

### 3.3. Semantic Versioning (SemVer) Contract for Skills

The platform's `freeze`/instance workflow uses semantic versions to identify
local snapshots. A top-level `version` field in `SKILL.md` is not a portable
provider requirement; validate the manifest against its claimed provider.
Version labels communicate intended change scope, not a guarantee of agent behavior:

| Version Bump | Change Type | Example | Impact on Consuming Agents |
| :--- | :--- | :--- | :--- |
| **Major (`X.0.0`)** | Breaking Change | Redesigned workflow, altered tool parameters, incompatible output format | Review consuming workflows before adoption. |
| **Minor (`0.X.0`)** | Additive Feature | New reference documents, additional optional recipes, expanded guidelines | Validate affected representative tasks. |
| **Patch (`0.0.X`)** | Refinement & Fix | Typo corrections, clearer prompt phrasing, lint fixes | Prompt changes can still alter behavior; check the intended correction. |

### 3.4. Sidecar Representation

The ownership sidecar (`*.skills-platform-link-ownership.json`) explicitly records whether the link is floating on `latest` or pinned to an explicit version:

```json
// Floating Latest Mode (Active Development)
{
  "schema_version": 1,
  "managed_by": "skills-platform-adapter",
  "method": "direct_source_symlink",
  "binding_policy": "floating_latest",
  "skill_name": "svg-authoring",
  "canonical_path": "/path/to/skills-packages/platform-core/svg-authoring"
}

// Version Pinned Mode (Production / Baseline / v1.0.0)
{
  "schema_version": 1,
  "managed_by": "skills-platform-adapter",
  "method": "direct_source_symlink",
  "binding_policy": "version_pinned",
  "skill_name": "svg-authoring",
  "pinned_version": "1.0.0",
  "canonical_path": "/path/to/skills-instances/platform-core/svg-authoring@1.0.0"
}
```

---

## 4. Practical Usage & Workflows

### 4.1. Mounting Links via Platform CLI (`skills-catalog project link`)

The Skills Platform CLI manages both `floating_latest` and `version_pinned` modes, including sidecar creation. Run from the Skills Platform repository root against an already registered project. This is an immediate mutation with no preview or `--confirm` gate. Inspect the existing path and sidecar first: the current implementation can replace an existing symlink regardless of ownership and treats sidecar presence as sufficient to replace a directory. Do not use it to resolve a conflict raised by adapter preview.

```bash
# 1. Mount directly to latest working source (floating_latest mode)
node apps/skills-catalog/src/cli.js project link information-ui-catalog svg-authoring --latest

# 2. Pin to a specific versioned instance (version_pinned mode)
node apps/skills-catalog/src/cli.js project link information-ui-catalog svg-authoring --version 1.0.0
```

### 4.2. Freezing a Versioned Source Package (`skills-catalog skill freeze`)

To freeze the current working source into a dedicated human-readable version directory (`skill@<version>`) under `skills-instances/`:

```bash
# Freezes svg-authoring into skills-instances/platform-core/svg-authoring@1.0.0 and updates SKILL.md frontmatter
node apps/skills-catalog/src/cli.js skill freeze svg-authoring --version 1.0.0
```

Output highlights:
```json
{
  "frozen": true,
  "skill_name": "svg-authoring",
  "version": "1.0.0",
  "source_path": ".../skills-packages/platform-core/svg-authoring",
  "target_path": ".../skills-instances/platform-core/svg-authoring@1.0.0",
  "valid": true
}
```

### 4.3. Inspecting Live Project Skills (`skills-catalog project status`)

To inspect the active binding policy, target path, and basic link state in a project:

```bash
node apps/skills-catalog/src/cli.js project status information-ui-catalog
```

Output highlights:
```json
{
  "project_id": "information-ui-catalog",
  "delivery_root": "/Users/.../.agents/skills",
  "skills": [
    {
      "skill_name": "svg-authoring",
      "is_symlink": true,
      "link_target": ".../skills-packages/platform-core/svg-authoring",
      "target_exists": true,
      "managed": true,
      "binding_policy": "floating_latest",
      "pinned_version": null
    }
  ]
}
```

`managed: true` in this output means that a sidecar exists; it does not prove
that its content matches the current link or that the package digest is valid.

### 4.4. Daily Development Inner Loop: Re-read the Updated Skill

1. Open and edit the skill in your editor or IDE:
   `skills-packages/platform-core/svg-authoring/SKILL.md`
   *(or navigate through the project link `/path/to/my-project/.agents/skills/svg-authoring/SKILL.md`)*
2. Save the file.
3. Re-read the skill or use the host's supported refresh/new-session workflow.
   Verify the intended behavior with a representative task. Continuing an
   existing conversation alone does not guarantee instruction reload.

### 4.5. On-Demand Registry Ingestion

To import one source into the immutable Registry without selecting or delivering it to a project:

```bash
node apps/skills-catalog/src/cli.js import-local \
  skills-packages/platform-core/svg-authoring \
  --registry .skills-platform/registry
```

Import is separate from review and delivery. The `sync` convenience command
can continue through project registration, selection, plan creation and,
with `--confirm`, delivery. It is not an import-only command. Use the
[installation guidebook's Catalog workflow](./skills-installation-guide.md#5-catalog로-공식-관리하기)
when those effects should be reviewed separately.

---

## 5. Comparison Table: When to Use Which Mode

| Feature / Requirement | Tier 1: Direct Reference Link | Tier 2: Immutable Snapshot |
| :--- | :--- | :--- |
| **Primary Use Case** | Daily development, prototyping, authoring | Release governance, CI/CD, production |
| **Binding Policy** | `floating_latest` | `version_pinned` |
| **Link Target** | `skills-packages/<group>/<skill>` | Direct instance: `skills-instances/...`; registry plan: `.skills-platform/registry/revisions/...` |
| **Update Mechanism** | Save source, then verify host reload | Select the intended instance or import/review/select a registry revision and preview/apply |
| **Agent Spec Effect** | New files are visible immediately; host instruction loading is separate | Pinned source remains selected until explicit change; host reload still applies |
| **Divergence Risk** | Zero (links directly to canonical source) | Version-pinned (requires explicit update) |
| **Audit & Reproducibility** | Reflects live working tree | Cryptographically frozen & immutable |
| **Sidecar Marker** | `method: "direct_source_symlink"` | Direct instance: `direct_source_symlink`; registry adapter link: `symlink` |

---

## 6. Summary & Best Practices

1. **Use Direct Reference for an intentional shared-source development loop**: Establish the link after checking its existing owner. Ordinary team installation follows Catalog preview/apply; editing an established direct link needs no repeated ingestion.
2. **Be conscious of Agent Spec Ripple Effects**: When multiple projects or production agents consume a skill, keep production projects on `version_pinned` to isolate them from breaking changes during authoring.
3. **Preserve ownership evidence**: Keep the companion `.skills-platform-link-ownership.json` sidecar. It identifies the intended owner but cannot protect a path from another installer or a manual filesystem change.
4. **Record reviewable milestones**: Import a new immutable revision, review it, select it in project policy, then preview/apply. Ingestion alone is not approval or delivery.

---

## 7. Multi-Location Discovery & Git Ownership Boundaries

### 7.1. Git Commit Boundaries under Direct Reference (`floating_latest`)
When a project runtime mounts a skill via `floating_latest`, editing files inside the project's `.agents/skills/<skill>/` directory actually edits the files in the Skills Platform repository (`skills-packages/<group>/<skill>/`):
- **Skills Platform Repository**: Records all prompt, code, and reference diffs. Authors and maintainers commit these changes to `Skills-Platform` Git branches and pull requests.
- **Target Project Repository**: Tracks only the project linkage. The project Git should never commit physical duplicates of skill contents.

### 7.2. Project `.gitignore` and Link Sharing Policy
For Skills Platform-managed projects, share portable recipe/source declarations
and reconstruct bindings at each checkout. Direct links and sidecars contain
machine paths; committing them does not reproduce the same source on another
PC. This repository ignores materialized `.agents/skills/` and local Catalog
state as documented in the [package management guide](./project-skill-package-management.md).

For projects using Vercel CLI direct installation, review `skills-lock.json`
and the installed content under that tool's workflow. Do not mix that policy
with Platform-managed bindings in the same delivery path.

### 7.3. Global Host Synchronization (Antigravity & Codex)
AI agents operating outside any specific repository (or in ad-hoc terminal sessions) discover skills from global host roots:
- **Google Antigravity**: `~/.gemini/config/skills/`
- **OpenAI Codex**: `~/.agents/skills/`

These are the host documentation paths and Catalog defaults, checked on
2026-09-08. Vercel `skills@1.5.24` declares different agent global paths in
its README/config, while its installer resolves both agents through the
universal canonical root `~/.agents/skills/`. Antigravity's host global path
therefore still differs from the installer's calculated target.
The [installation guidebook](./skills-installation-guide.md#설치-도구의-경로와-에이전트의-검색-경로)
explains canonical copies, environment overrides, and host verification.

Choose global scope only when the skill is intended for every project. Use
the selected owner to manage that scope and inspect existing names before
creating a binding. Do not add a second global copy merely to work around
a discovery failure; confirm the host search path first.

### 7.4. Dual-Role Repositories: Agent Skills vs. Bundled Product Skills
Certain projects (e.g. OpenWiki, developer tooling, CLI frameworks) play a dual role:
1. **Agent Development Runtime (`.agents/skills/`)**: Skills that autonomous coding agents consume while working on the codebase (linked to `skills-packages/`).
2. **Product Bundled Skills (`skills/` or `dist/skills/`)**: Skills distributed with the tool binary or npm package to end-users (e.g. OpenWiki copying bundled skills to `~/.openwiki/skills/`).

**Lifecycle Rule (Reverse-Sync / Release Sync)**:
- During active development, all improvements occur in the canonical package (`skills-packages/<group>/<skill>/`).
- Prior to creating an npm/binary release of the product, run an atomic reverse-sync to copy the validated canonical package into the product's bundled distribution directory:
  ```bash
  # Example: Reverse-syncing canonical openwiki-cli into product distribution
  cp -r ~/workflow/Skills-Platform/skills-packages/openwiki/openwiki-cli/* ~/workflow/openwiki/skills/openwiki-cli/
  ```

---

## 8. Multi-Skill Batch Operations & Preset Sync

When a project requires multiple skills simultaneously (e.g. the 5 OpenWiki skills), you can link them sequentially or manage them through a project preset:

```bash
# Batch link multiple skills to a project
for skill in openwiki-cli openwiki-grounding mermaid-diagrams write-connector openwiki; do
  node apps/skills-catalog/src/cli.js project link openwiki $skill --latest
done
```

To verify the overall status of all project links:
```bash
node apps/skills-catalog/src/cli.js project status openwiki
```

---

## 9. Operator Quick Checklist: From Edit to Delivery

Follow this checklist whenever modifying or delivering skills across the platform:

| Step | Operation | Command / Action |
| :---: | :--- | :--- |
| **1. Edit** | Modify `SKILL.md`, `references/`, or `scripts/` | Edit canonical package under `skills-packages/<group>/<skill>/` |
| **2. Validate** | Verify static syntax against both host platforms | `node apps/skills-catalog/src/cli.js skill validate <path> --provider portable` |
| **3. Test** | Run unit tests or dry-run scripts | Execute accompanying test scripts or harness evaluations |
| **4. Freeze (Optional)** | Create an immutable SemVer snapshot for production | `node apps/skills-catalog/src/cli.js skill freeze <skill> --version <semver>` |
| **5. Link / Update** | Mount or refresh project runtime links | `node apps/skills-catalog/src/cli.js project link <project> <skill> [--latest \| --version]` |
| **6. Health Check** | Confirm symlink and sidecar integrity | `node apps/skills-catalog/src/cli.js project status <project>` |
