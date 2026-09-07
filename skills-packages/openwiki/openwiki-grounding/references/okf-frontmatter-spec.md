# OKF v0.2 Frontmatter Specification

Every generated or maintained OpenWiki Markdown page must begin with valid OKF (Open Knowledge Format) v0.2 frontmatter:

```yaml
---
type: Domain Specification
title: Authentication & OAuth Flow
description: "OAuth2 PKCE flow and token lifecycle specification."
tags: [auth, oauth, security]
openwiki:
  roles: [domain, architecture]
  source_paths:
    - src/auth/oauth.ts
    - docs/specs/oauth-spec.md
  symbols:
    - OAuthClient
    - resolveOAuthTokens
  test_paths:
    - test/auth/oauth.test.ts
  invariants:
    - Refresh token rotation must invalidate previous tokens
generated:
  by: "openwiki/0.5.0"
  at: "2026-09-06T10:00:00.000Z"
---
```

---

## 1. Field Definitions

| Field | Requirement | Description |
| :--- | :--- | :--- |
| `type` | Required | Short descriptive concept type (e.g. `Domain Specification`, `Architecture Overview`, `Workflow Guide`). |
| `title` | Required | Human-readable title in the documentation run language. |
| `description` | Required | 1–2 sentence retrieval-oriented summary in the run language. |
| `tags` | Optional | Array of stable English classification tags. |
| `openwiki.roles` | Optional | Categorical roles: `domain`, `architecture`, `operations`, `testing`, `integration`. |
| `openwiki.source_paths` | Required | Relative paths to ground truth source files, Zod schemas, or human design specs. |
| `openwiki.symbols` | Optional | Names of material classes, types, interfaces, or functions explained in the document. |
| `openwiki.test_paths` | Optional | Relative paths to focused test files verifying invariants. |
| `openwiki.invariants` | Optional | Core contractual rules and assumptions that the codebase guarantees. |
| `generated` | System Owned | Provenance metadata stamped by OpenWiki. **Do not hand-edit**. |

---

## 2. Invariant & Source Traceability Rules (v0.5.0 Sparse Reconciliation)

1. **Existence Verification**: Every entry in `source_paths` and `test_paths` must actually exist in the repository tree.
2. **Symbol Grounding**: Symbols listed in `symbols` must resolve to actual AST symbols in the specified source paths.
3. **Automatic Retention**: Issue-free Claims omitted from `openwiki_submit_page` submission are retained automatically.
4. **Explicit Decisions on Issues**: Rechecked unchanged Claims go to `confirmedClaimIds`, revised/new Claims go to `claims`, and removed Claims go to `retractedClaimIds`.
5. **Durable Progress**: Cross-host and CI/local run progress is recorded in `openwiki/.page-manifest.json`.
