# Provider frontmatter matrix

Use this matrix only for comparison. The selected provider reference remains authoritative.

| Field | Codex | Google Antigravity |
| --- | --- | --- |
| `name` | Required | Optional; defaults to the skill folder name |
| `description` | Required | Required |
| Trigger role | Used for implicit selection; keep it concise with clear scope and boundaries | Used to decide whether the skill is relevant; third-person phrasing and useful keywords are recommended |
| Explicit-only policy | Keep `description`; set `agents/openai.yaml` `policy.allow_implicit_invocation: false` | No equivalent field is documented in the official skill format |

Use lowercase letters, digits, and hyphens for a portable name. For Antigravity, apply that format to
an explicit `name`; omitting it is valid and resolves to the folder name.

`invocation_mode`, `artifact_type`, review state, risk, tags, and source provenance are Skills
Platform catalog metadata. They are not shared official frontmatter requirements and must not be
presented as such.

Sources:

- [OpenAI: Build skills](https://developers.openai.com/codex/skills)
- [Google Antigravity: Agent Skills](https://antigravity.google/docs/skills)
