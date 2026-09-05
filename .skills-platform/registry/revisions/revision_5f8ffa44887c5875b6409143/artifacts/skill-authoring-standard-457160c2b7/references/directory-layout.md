# Provider directory matrix

Both providers use a skill folder containing `SKILL.md`, but their documented discovery roots and
optional directories differ.

| Concern | Codex | Google Antigravity |
| --- | --- | --- |
| Project discovery | `$CWD/.agents/skills`, parent `.agents/skills` directories through `$REPO_ROOT/.agents/skills` | `<workspace-root>/.agents/skills`; legacy `<workspace-root>/.agent/skills` remains supported |
| Global discovery | `$HOME/.agents/skills`; admin `/etc/codex/skills` | `~/.gemini/config/skills` |
| Optional directories | `scripts/`, `references/`, `assets/`, `agents/` | `scripts/`, `examples/`, `resources/` |
| Provider extension | `agents/openai.yaml` for interface, invocation policy, and tool dependencies | No `agents/openai.yaml` extension is documented |

Optional means optional. Do not create placeholder directories, and do not flag their absence as a
defect. Link a supporting document from `SKILL.md` at the point where it becomes relevant.

For portable packages, avoid absolute paths, external symlinks, case-colliding filenames, and
platform-specific scripts without an alternate route.
