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
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           CENTRAL SKILLS STORE                                    │
│                    skills-packages/<group>/<skill-name>/                          │
└───────────────┬───────────────────────────────────────────────────┬───────────────┘
                │                                                   │
  [Tier 1: Direct Reference Mode]                     [Tier 2: Governed Snapshot Mode]
  (Daily Inner Loop & Prototyping)                    (Release, Staging, Audit & CI)
                │                                                   │
                │ Direct Symlink                                    │ Immutable Snapshot
                │ (0 Sync / Instant Reload)                         │ (SHA-256 Content Digest)
                ▼                                                   ▼
┌───────────────────────────────────────┐   ┌───────────────────────────────────────┐
│     PROJECT LIVE RUNTIME (.agents)    │   │      CENTRAL REGISTRY REVISIONS       │
│  .agents/skills/<skill-name>          │   │  .skills-platform/registry/revisions/ │
│  └──> points directly to source       │   └───────────────────┬───────────────────┘
└───────────────────────────────────────┘                       │
                                                                │ Symlink to Snapshot
                                                                ▼
                                            ┌───────────────────────────────────────┐
                                            │     FROZEN RELEASE RUNTIME (.agents)  │
                                            │  .agents/skills/<skill-name>          │
                                            │  └──> points to immutable snapshot    │
                                            └───────────────────────────────────────┘
```

### Tier 1: Direct Reference Mode (Live Dev Link — "Just Refresh")
- **How it works**: The project's `.agents/skills/<skill-name>` symlink points directly to the canonical source package in `skills-packages/<group>/<skill-name>`.
- **Key Characteristics**:
  - **Zero Sync Overhead**: No compilation, no snapshot ingestion, no watch daemon required.
  - **Instant Live Reflection**: Saving an edit in `SKILL.md`, `references/`, or `scripts/` takes effect immediately in the project workspace.
  - **Bidirectional Editing**: Developers and autonomous agents navigating into `.agents/skills/<skill-name>` modify the canonical source directly, eliminating out-of-sync workspace drift.
  - **Agent / IDE Refresh**: After saving changes, simply re-read the file in chat or reload the IDE. The agent reads the newest instructions instantly.
  - **Ownership Protected**: Managed by a sidecar record with `"method": "direct_source_symlink"`, preventing external tools from deleting or overwriting it.

### Tier 2: Governed Immutable Snapshot Mode ("Partial Update & Freeze")
- **How it works**: An immutable revision is ingested into `.skills-platform/registry/revisions/<revision_id>/artifacts/`, and the project's symlink is pinned to that exact SHA-256 hash.
- **Key Characteristics**:
  - **On-Demand Partial Update**: Instead of rebuilding or resyncing entire catalogs, run a lightweight single-skill sync command to capture a new snapshot.
  - **Cryptographic Reproducibility**: Guarantees 100% byte-for-byte identical behavior across multiple machines, air-gapped CI/CD environments, and audit trails.
  - **Review & Approval Gate**: Integrates with catalog source reviews, health evaluations, and preset versioning.

---

## 3. Practical Usage & Workflows

### 3.1. Establishing a Direct Reference Link (Tier 1)

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
  "skill_name": "svg-authoring",
  "lineage_id": "lineage_e95b938b1f1be8fc3d30",
  "canonical_path": "/path/to/Skills-Platform/skills-packages/platform-core/svg-authoring",
  "delivery_path": "/path/to/my-project/.agents/skills/svg-authoring",
  "delivery_name": "svg-authoring"
}
```

### 3.2. Daily Development Inner Loop: "Just Refresh"

1. Open and edit the skill in your editor or IDE:
   `skills-packages/platform-core/svg-authoring/SKILL.md`
   *(or navigate through the project link `/path/to/my-project/.agents/skills/svg-authoring/SKILL.md`)*
2. Save the file.
3. In your agent session (Antigravity, Codex, etc.), **simply refresh or continue chatting**.
   The agent automatically reads the updated instructions from disk with zero intermediate steps.

### 3.3. Partial Update & Snapshot Freeze (Tier 2)

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

## 4. Comparison Table: When to Use Which Mode

| Feature / Requirement | Tier 1: Direct Reference Link | Tier 2: Immutable Snapshot |
| :--- | :--- | :--- |
| **Primary Use Case** | Daily development, prototyping, authoring | Release governance, CI/CD, production |
| **Link Target** | `skills-packages/<group>/<skill>` | `.skills-platform/registry/revisions/...` |
| **Update Mechanism** | File Save $\rightarrow$ **Just Refresh** | `skills-catalog sync` (Partial Update) |
| **Intermediate Pipeline** | None (0 overhead) | Preflight Lint $\rightarrow$ SHA-256 Digest $\rightarrow$ Plan |
| **Divergence Risk** | Zero (links directly to canonical source) | Version-pinned (requires explicit update) |
| **Audit & Reproducibility** | Reflects live working tree | Cryptographically frozen & immutable |
| **Sidecar Marker** | `method: "direct_source_symlink"` | `method: "symlink"` |

---

## 5. Summary & Best Practices

1. **Default to Direct Reference during active iteration**: Do not generate temporary plans or run heavy sync commands while actively tuning prompts and documentation.
2. **Let the sidecar protect the link**: Always maintain the companion `.skills-platform-link-ownership.json` sidecar alongside the symlink so team members and automated tools recognize the managed link.
3. **Use Partial Updates for milestones**: When you are ready to ship or share a reviewed baseline across teams, use `skills-catalog sync <skill> --confirm` to produce a permanent SHA-256 audit trail.
