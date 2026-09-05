# Skill Reference and Delivery Guide: Concepts, Direct Links, and Partial Updates

This guide defines the architectural philosophy, core concepts, and operational workflows for connecting, developing, and delivering skills between the central Skills Platform store and target project environments.

---

## 1. Architectural Philosophy: The True Role of a Skill Manager

A skill management system should not burden developers with heavyweight synchronization daemons, constant snapshot-building steps, or multi-command manual pipelines during everyday development.

The core value of the **Skills Manager** is:
1. **Friction-Free Reference Linking**: Seamlessly connecting central skill packages (`skills-packages/`) to target project runtimes (`.agents/skills/`) without duplicating files or causing source divergence.
2. **Deterministic Ownership & Safety**: Preventing accidental file collisions, unauthorized directory overwrites, or broken links via lightweight ownership sidecars (`*.skills-platform-link-ownership.json`).
3. **Two-Tier Flexibility**: Providing instantaneous "just refresh" live development for local inner-loop authoring, while preserving cryptographic immutability (SHA-256 snapshots) whenever official versioning or release governance is needed.

---

## 2. Two-Tier Delivery Model

Skills Platform operates on a 2-tier delivery architecture:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CENTRAL SKILLS STORE                                      │
│                      skills-packages/<group>/<skill-name>/                             │
│                                                                                        │
│  [Rolling Latest Source]                     [Version-Named Source Folders]            │
│  skills-packages/.../svg-authoring           skills-packages/.../svg-authoring@1.0.0   │
└──────────────────┬───────────────────────────────────────────┬─────────────────────────┘
                   │                                           │
  [Tier 1: floating_latest Mode]               [Tier 2: version_pinned Mode]
  (Active Prototyping & Inner Loop)            (Production Baselines & Frozen Releases)
                   │                                           │
                   │ Direct Symlink                            │ Version-Named Symlink
                   ▼                                           ▼
┌──────────────────────────────────────┐    ┌──────────────────────────────────────────┐
│   PROJECT RUNTIME: TRACKING LATEST   │    │    PROJECT RUNTIME: PINNED TO v1.0.0     │
│   .agents/skills/svg-authoring       │    │    .agents/skills/svg-authoring          │
│   └──> points to svg-authoring       │    │    └──> points to svg-authoring@1.0.0    │
└──────────────────────────────────────┘    └──────────────────────────────────────────┘
```

### Tier 1: Direct Reference Mode (Live Dev Link — "Just Refresh")
- **How it works**: The project's `.agents/skills/<skill-name>` symlink points directly to the canonical latest source package in `skills-packages/<group>/<skill-name>`.
- **Binding Policy**: `"floating_latest"`
- **Key Characteristics**:
  - **Zero Sync Overhead**: No compilation, no snapshot ingestion, no watch daemon required.
  - **Instant Live Reflection**: Saving an edit in `SKILL.md`, `references/`, or `scripts/` takes effect immediately in the project workspace.
  - **Bidirectional Editing**: Developers and autonomous agents navigating into `.agents/skills/<skill-name>` modify the canonical source directly, eliminating out-of-sync workspace drift.
  - **Agent / IDE Refresh**: After saving changes, simply re-read the file in chat or reload the IDE. The agent reads the newest instructions instantly.
  - **Ownership Protected**: Managed by a sidecar record with `"method": "direct_source_symlink"`, preventing external tools from deleting or overwriting it.

### Tier 2: Governed Version-Pinned Mode ("Version Directory or Snapshot Freeze")
- **How it works**:
  - **Local Development Standard (Most Effective)**: The project points directly to a version-named source package (`skills-packages/<group>/<skill-name>@<version>`), keeping files human-readable and instantly diffable.
  - **Central/CI Registry Mode**: For air-gapped CI/CD and formal audit logs, an immutable revision is ingested into `.skills-platform/registry/revisions/<revision_id>/artifacts/` and pinned via cryptographic SHA-256 hash.
- **Binding Policy**: `"version_pinned"`
- **Key Characteristics**:
  - **Ripple Protection**: Prevents prompt experiments in `latest` from accidentally breaking production agent behaviors.
  - **Human-Readable Clarity**: Inspecting symlinks clearly displays the target version (e.g. `@1.0.0`) without querying metadata catalogs.
  - **Review & Approval Gate**: Integrates with catalog source reviews, health evaluations, and preset versioning.

---

## 3. Skill Versioning & Agent Spec Ripple Control: Floating Latest vs. Version Pinning

Because skills directly govern an agent's behavioral instructions, tool usage rules, and system prompt constraints, **updating a referenced skill immediately alters the execution specification of all agents consuming that skill**.

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
- **The Most Effective Local Handling Method: Version-Named Source Directories**:
  Instead of burying historical snapshots in obscure cryptographic hash directories (`.skills-platform/registry/revisions/revision_xxxx/...`), the cleanest and most practical local mechanism is **maintaining version-named canonical directories (e.g. `<skill-name>@<version>`) directly in the skills store**:
  ```text
  skills-packages/platform-core/
    ├── svg-authoring/            # Rolling latest working tree (for floating_latest projects)
    ├── svg-authoring@1.0.0/      # Frozen v1.0.0 canonical source (for version_pinned projects)
    └── svg-authoring@2.0.0/      # Frozen v2.0.0 canonical source (for version_pinned projects)
  ```
  - When a project binds to `version_pinned` at `v1.0.0`:
    `.agents/skills/svg-authoring` simply symlinks to `skills-packages/platform-core/svg-authoring@1.0.0`.
  - **Why this pattern is optimal for local development**:
    1. **Instant Human-Readable Transparency**: Running `ls -la .agents/skills` immediately reveals the exact pinned version at a glance without reading registry databases.
    2. **Zero Ingestion/Unpack Overhead**: Follows the identical lightweight Unix symlink mechanism as Tier 1.
    3. **Effortless Local Diffs**: Run `diff -r svg-authoring svg-authoring@1.0.0` to immediately inspect prompt divergences.
    4. **Isolated Breaking Changes**: Authors can introduce disruptive prompt architectures in `svg-authoring/` without breaking baseline project agents pinned to `@1.0.0`.

### 3.3. Semantic Versioning (SemVer) Contract for Skills

Skill packages follow Semantic Versioning (`version: <major>.<minor>.<patch>` in `SKILL.md` frontmatter):

| Version Bump | Change Type | Example | Impact on Consuming Agents |
| :--- | :--- | :--- | :--- |
| **Major (`X.0.0`)** | Breaking Change | Redesigned workflow, altered tool parameters, incompatible output format | **High Risk**: Will break assumptions in existing agent prompts. Projects on `version_pinned` remain isolated and protected. |
| **Minor (`0.X.0`)** | Additive Feature | New reference documents, additional optional recipes, expanded guidelines | **Low Risk**: Consuming agents gain new capabilities without losing existing contracts. |
| **Patch (`0.0.X`)** | Refinement & Fix | Typo corrections, clearer prompt phrasing, lint fixes | **Zero Risk**: Improves instruction adherence and clarity without altering interfaces. |

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
  "canonical_path": "/path/to/skills-packages/platform-core/svg-authoring@1.0.0"
}
```

---

## 4. Practical Usage & Workflows

### 4.1. Establishing a Direct Reference Link (Tier 1)

To mount a skill package directly from the central store into a project:

```bash
# 1. Mount direct symlink
ln -sfn /path/to/Skills-Platform/skills-packages/platform-core/svg-authoring \
  /path/to/my-project/.agents/skills/svg-authoring

# 2. Sidecar ownership record
# The sidecar (.agents/skills/svg-authoring.skills-platform-link-ownership.json)
# records ownership so the platform tracks this link without managing it destructively.
```

Example sidecar content (`svg-authoring.skills-platform-link-ownership.json`):
```json
{
  "schema_version": 1,
  "managed_by": "skills-platform-adapter",
  "method": "direct_source_symlink",
  "binding_policy": "floating_latest",
  "skill_name": "svg-authoring",
  "lineage_id": "lineage_e95b938b1f1be8fc3d30",
  "canonical_path": "/path/to/Skills-Platform/skills-packages/platform-core/svg-authoring",
  "delivery_path": "/path/to/my-project/.agents/skills/svg-authoring",
  "delivery_name": "svg-authoring"
}
```

### 4.2. Daily Development Inner Loop: "Just Refresh"

1. Open and edit the skill in your editor or IDE:
   `skills-packages/platform-core/svg-authoring/SKILL.md`
   *(or navigate through the project link `/path/to/my-project/.agents/skills/svg-authoring/SKILL.md`)*
2. Save the file.
3. In your agent session (Antigravity, Codex, etc.), **simply refresh or continue chatting**.
   The agent automatically reads the updated instructions from disk with zero intermediate steps.

### 4.3. Partial Update & Snapshot Freeze (Tier 2)

When you reach a stable milestone and want to freeze an immutable snapshot or register the update with the central catalog:

```bash
# Run a single-skill partial update
# Validates rulesets, ingests SHA-256 revision, and optionally updates project binding
node apps/skills-catalog/src/cli.js sync svg-authoring --project my-project --confirm
```

Output highlights:
```json
{
  "status": "applied",
  "skill": {
    "skill_name": "svg-authoring",
    "content_digest": "ff5d35fa...",
    "source_revision_id": "revision_062076352c48120b83a7ac5f"
  }
}
```

- If `--confirm` is omitted, `skills-catalog sync` displays a **Preview** of what would be updated without applying disk mutations.
- If you only want to validate against provider rulesets (portable, codex, antigravity) without touching the registry:
  ```bash
  node apps/skills-catalog/src/cli.js skill validate skills-packages/platform-core/svg-authoring --provider antigravity
  ```

---

## 5. Comparison Table: When to Use Which Mode

| Feature / Requirement | Tier 1: Direct Reference Link | Tier 2: Immutable Snapshot |
| :--- | :--- | :--- |
| **Primary Use Case** | Daily development, prototyping, authoring | Release governance, CI/CD, production |
| **Binding Policy** | `floating_latest` | `version_pinned` |
| **Link Target** | `skills-packages/<group>/<skill>` | `.skills-platform/registry/revisions/...` |
| **Update Mechanism** | File Save $\rightarrow$ **Just Refresh** | `skills-catalog sync` (Partial Update) |
| **Agent Spec Effect** | Immediate live update on file save | Isolated & frozen until explicit update |
| **Divergence Risk** | Zero (links directly to canonical source) | Version-pinned (requires explicit update) |
| **Audit & Reproducibility** | Reflects live working tree | Cryptographically frozen & immutable |
| **Sidecar Marker** | `method: "direct_source_symlink"` | `method: "symlink"` |

---

## 6. Summary & Best Practices

1. **Default to Direct Reference during active iteration**: Do not generate temporary plans or run heavy sync commands while actively tuning prompts and documentation.
2. **Be conscious of Agent Spec Ripple Effects**: When multiple projects or production agents consume a skill, keep production projects on `version_pinned` to isolate them from breaking changes during authoring.
3. **Let the sidecar protect the link**: Always maintain the companion `.skills-platform-link-ownership.json` sidecar alongside the symlink so team members and automated tools recognize the managed link.
4. **Use Partial Updates for milestones**: When you are ready to ship or share a reviewed baseline across teams, use `skills-catalog sync <skill> --confirm` to produce a permanent SHA-256 audit trail.
