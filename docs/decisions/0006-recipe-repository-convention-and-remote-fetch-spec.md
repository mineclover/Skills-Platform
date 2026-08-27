# ADR 0006: Recipe Repository Structure Convention and Remote Fetch Specification

## Status
Accepted (2026-08-28)

## Context
Portable Skill Recipes (schema v1) allow complete skill suites, source locators, preset templates, and delivery targets to be packaged into a single `recipe.json` manifest. However, to support safe, verifiable, and discoverable **Remote Recipe Fetching** across organizations and registries (e.g. GitHub repos, private hubs, CDN packages), a standardized repository layout and resolution protocol must be established before implementing remote ingestion endpoints.

## Decisions

### 1. Canonical Recipe Repository Directory Structure
All remote repositories hosting skill recipes MUST conform to the following directory layout:

```text
<repo-root>/
├── recipes.json                      # [Required] Index catalog manifest of all recipes in the repository
├── README.md                         # Repository documentation and catalog overview
└── bundles/                          # Individual recipe bundle directories
    ├── <recipe-id>/                  # Kebab-case recipe directory
    │   ├── recipe.json               # [Required] Complete SkillRecipe manifest (schema v1)
    │   ├── README.md                 # [Recommended] Human-readable documentation & usage guide
    │   └── signature.sig             # [Optional] Cryptographic detached signature for provenance verification
```

### 2. Recipe Catalog Manifest Specification (`recipes.json`)
The root `recipes.json` acts as a discovery index for automated tooling and UI clients:

```json
{
  "schema_version": 1,
  "repository_id": "skills-platform-official",
  "repository_name": "Skills Platform Official Recipe Hub",
  "updated_at": "2026-08-28T05:50:00Z",
  "base_url": "https://raw.githubusercontent.com/skills-platform/recipes/main",
  "recipes": [
    {
      "recipe_id": "mlc-recursive-context",
      "name": "MLC Recursive Context and Exploration Engine",
      "version": "1.0.0",
      "category": "exploration",
      "description": "4 Base Registries and 9 H/V Exploration and Recursive Context skills",
      "skills_count": 13,
      "manifest_path": "bundles/mlc-recursive-context/recipe.json",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "tags": ["mlc", "context", "horizontal-vertical", "explore"]
    }
  ]
}
```

### 3. Remote Recipe Fetch Locator Protocol
Remote fetch operations MUST support the following locator URI formats:
1. **Raw HTTPS URL**: Direct link to a `recipe.json` or `recipes.json` index (e.g., `https://raw.githubusercontent.com/.../bundles/core/recipe.json`).
2. **GitHub Locator**: `github:<owner>/<repo>[@<ref>][/<bundle-path>]` (e.g. `github:mineclover/Skills-Platform@main/recipes/bundles/mlc-recursive-context`).
3. **Curated Registry Shorthand**: `hub:<recipe-id>[@<version>]` resolving against trusted upstream registry URLs.

### 4. Integrity and Trust Verification Rules
When fetching remote recipes:
1. **Schema Validation**: The fetched document must pass strict `@skills-platform/contracts` schema validation.
2. **Digest Check**: If fetched via index or with an expected SHA-256 digest, the content SHA-256 must match before ingestion.
3. **Air-gapped Sandbox**: Remote fetch operates strictly read-only into the catalog staging area without executing installer scripts or modifying active delivery junction links until explicit human confirmation.

## Consequences
- **Deterministic Sharing**: Teams can publish, version, and share custom skill recipes via standard Git repositories or static web servers.
- **Automated Discovery**: Catalog UI and CLI tools can fetch repository index catalogs and provide 1-click preview and inspection.
- **Zero Supply-Chain Ambiguity**: Full provenance, commit SHA resolution, and content hashing prevent tampering or configuration drift.
