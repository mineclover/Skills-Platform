# Skill Directory Layout & Subfolder Usage

Guideline on organizing assets within a skill package.

## 1. Subdirectory Guidelines

### `references/`
- Use for deep documentation, full API payload definitions, architecture invariants, or variant policies.
- Link directly from `SKILL.md` with relative markdown links (`[Title](./references/filename.md)`).

### `scripts/`
- Use for executable Node.js, Python, or shell scripts that automate repetitive validations or conversions.
- Scripts must be self-contained and support standard CLI flags (`--help`, `--json`).

### `examples/`
- Use for concrete end-to-end walkthroughs showing inputs, agent actions, expected tool outputs, and final artifacts.

### `assets/`
- Use for static files, templates, starter codebases, or diagram images bundled with the skill.
