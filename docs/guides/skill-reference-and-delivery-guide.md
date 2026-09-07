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
  - **Instant Live Reflection**: Saving an edit in `SKILL.md`, `references/`, or `scripts/` takes effect immediately in the project workspace.
  - **Bidirectional Editing**: Developers and autonomous agents navigating into `.agents/skills/<skill-name>` modify the canonical source directly, eliminating out-of-sync workspace drift.
  - **Agent / IDE Refresh**: After saving changes, simply re-read the file in chat or reload the IDE. The agent reads the newest instructions instantly.
  - **Ownership Protected**: Managed by a sidecar record with `"method": "direct_source_symlink"`, preventing external tools from deleting or overwriting it.

### Tier 2: Governed Version-Pinned Mode ("Dedicated Instance Repository")
- **How it works**:
  - **Local Development Standard (Most Effective)**: The project points directly to an instance snapshot in the dedicated instances repository (`skills-instances/<group>/<skill-name>@<version>`), keeping the distribution store (`skills-packages/`) clean while keeping instances human-readable and instantly diffable.
  - **Central/CI Registry Mode**: For air-gapped CI/CD and formal audit logs, an immutable revision is ingested into `.skills-platform/registry/revisions/<revision_id>/artifacts/` and pinned via cryptographic SHA-256 hash.
- **Binding Policy**: `"version_pinned"`
- **Key Characteristics**:
  - **Distribution Tree Hygiene**: `skills-packages/` remains strictly for canonical package authoring, free from clutter of immutable historical versions.
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
  "canonical_path": "/path/to/skills-instances/platform-core/svg-authoring@1.0.0"
}
```

---

## 4. Practical Usage & Workflows

### 4.1. Mounting Links via Platform CLI (`skills-catalog project link`)

The Skills Platform CLI manages both `floating_latest` and `version_pinned` modes automatically, including sidecar creation:

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

To check the active binding policy, target path, and health of all skills linked in a project:

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

### 4.4. Daily Development Inner Loop: "Just Refresh"

1. Open and edit the skill in your editor or IDE:
   `skills-packages/platform-core/svg-authoring/SKILL.md`
   *(or navigate through the project link `/path/to/my-project/.agents/skills/svg-authoring/SKILL.md`)*
2. Save the file.
3. In your agent session (Antigravity, Codex, etc.), **simply refresh or continue chatting**.
   The agent automatically reads the updated instructions from disk with zero intermediate steps.

### 4.5. On-Demand Registry Ingestion (Optional Tier 2 CI/CD Audit)

When you need an immutable SHA-256 hash registered in the central `.skills-platform/registry/revisions/` store for formal audit logs:

```bash
# Run on-demand single-skill partial update
node apps/skills-catalog/src/cli.js sync svg-authoring --project information-ui-catalog --confirm
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

---

## 7. Multi-Location Discovery & Git Ownership Boundaries

### 7.1. Git Commit Boundaries under Direct Reference (`floating_latest`)
When a project runtime mounts a skill via `floating_latest`, editing files inside the project's `.agents/skills/<skill>/` directory actually edits the files in the Skills Platform repository (`skills-packages/<group>/<skill>/`):
- **Skills Platform Repository**: Records all prompt, code, and reference diffs. Authors and maintainers commit these changes to `Skills-Platform` Git branches and pull requests.
- **Target Project Repository**: Tracks only the project linkage. The project Git should never commit physical duplicates of skill contents.

### 7.2. Project `.gitignore` and Link Sharing Policy
Target project teams should decide how to track `.agents/skills/`:
- **Shared Team Workspace (Recommended)**: Commit the symlinks, sidecars, and `.agents/skills/README.md` into the project repository so that every team member or CI runner shares the identical skill binding configuration.
  ```gitignore
  # Do not ignore managed skills and sidecars if team shares standard links:
  !.agents/skills/*.skills-platform-link-ownership.json
  !.agents/skills/README.md
  ```
- **Local-Only Workspaces**: If individual developers manage their own private skills, add `.agents/skills/` to the project's `.gitignore`.

### 7.3. Global Host Synchronization (Antigravity & Codex)
AI agents operating outside any specific repository (or in ad-hoc terminal sessions) discover skills from global host roots:
- **Google Antigravity**: `~/.gemini/config/skills/`
- **OpenAI Codex**: `~/.agents/skills/`

To prevent divergence between repository agent sessions and global agent sessions, global roots should also symlink directly to canonical packages in `Skills-Platform/skills-packages/`:
```bash
# Antigravity global link
ln -s ~/workflow/Skills-Platform/skills-packages/openwiki/openwiki-cli ~/.gemini/config/skills/openwiki-cli
ln -s ~/workflow/Skills-Platform/skills-packages/openwiki/openwiki-grounding ~/.gemini/config/skills/openwiki-grounding

# Codex global link
ln -s ~/workflow/Skills-Platform/skills-packages/openwiki/openwiki-cli ~/.agents/skills/openwiki-cli
```

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
