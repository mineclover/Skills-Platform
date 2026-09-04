# Codex hook operations

Skills Platform compiles its project hook manifest into Codex's native project
configuration at `.codex/hooks.json`. It does not modify the user's global
`~/.codex/hooks.json` or `~/.codex/config.toml`.

The generated dispatcher contains machine-local Node, runner, and project
paths. For that reason `.codex/hooks.json` and its ownership sidecar are ignored
by Git and must be regenerated after moving the checkout between Windows and
macOS. The portable source of truth is `.skills-platform/hooks/manifest.json`.

The implementation follows the official [Codex hooks
reference](https://developers.openai.com/codex/hooks) and [Codex configuration
reference](https://developers.openai.com/codex/config-reference). The local
runtime used for validation is detected at sync time because the event set is
version-dependent.

## Runtime model

Codex starts all matching command hooks for a native event concurrently. Skills
Platform needs deterministic priority and short-circuit behavior, so it emits
one managed dispatcher for each Codex event. That dispatcher:

1. reads the single Codex JSON object from stdin;
2. normalizes native `tool_name`, `tool_input`, and `tool_response` fields;
3. selects enabled hooks that target Codex and match the platform event;
4. executes them by ascending `priority`, then by stable hook ID;
5. stops at the first denial and returns the native Codex decision shape.

The important event mappings are:

| Codex event | Skills Platform event |
| --- | --- |
| `SessionStart` | `session_start` |
| `UserPromptSubmit` | `user_prompt_submit`, then `pre_invocation` |
| `PreToolUse` | `pre_tool_use`; test commands also emit `on_test_run` |
| `PermissionRequest` | `permission_request` |
| `PostToolUse` | `post_tool_use` |
| `PreCompact` / `PostCompact` | `pre_compact` / `post_compact` |
| `SubagentStart` / `SubagentStop` | `subagent_start` / `subagent_stop` |
| `Stop` | `stop`, then `post_invocation` |
| `SessionEnd` / `Interrupt` | `session_stop` / `interrupt`, when supported by the detected Codex version |

For `PreToolUse`, a platform block is returned as a native
`permissionDecision: "deny"`. `PermissionRequest` uses Codex's nested deny
decision, and post-action blocking events use `decision: "block"`. A hook with
`failure_policy: "closed"` also blocks when its handler fails; `"open"` records
the failure and permits the operation.

## Sync and inspect

Run these commands from the repository root:

```sh
node apps/skills-catalog/src/cli.js hook diagnostics --project .
node apps/skills-catalog/src/cli.js hook sync --project .
node apps/skills-catalog/src/cli.js hook diagnostics --project .
```

Sync performs an ownership-preserving merge. It updates only dispatchers that
Skills Platform previously owned and retains unrelated user-defined hooks. The
ownership record lives under `.skills-platform/hooks/` and is runtime state,
not a second source of hook definitions.

Enable or disable a hook in the platform manifest and immediately reconcile the
native provider file with:

```sh
node apps/skills-catalog/src/cli.js hook disable secret-leak-guard --project .
node apps/skills-catalog/src/cli.js hook enable secret-leak-guard --project .
```

Both commands sync by default. Diagnostics distinguishes desired state,
configuration presence, drift, unsupported events, missing handler files, and
runtime readiness. A generated file is only proof that configuration is
synced; it is not proof that Codex has trusted the hooks.

## Review and trust

Project hooks are security-sensitive. After sync, start Codex in the project
and run `/hooks`. Review the exact command, then approve the project hook when
Codex prompts. Trust is tied to the hook definition hash, so a material command
change can require review again. Project-level configuration can also require
the project itself to be trusted.

Do not use `--dangerously-bypass-hook-trust` as a persistent setup mechanism.
It is a one-run bypass and does not create durable trust.

## Validation

The normal test suite validates schema, version capability filtering,
ownership-preserving merge, enable/disable reconciliation, input
normalization, matcher behavior, priority, short-circuiting, native denial
output, failure policy, and malformed input. It does not make a model call.

An opt-in live smoke test may be run only in an isolated Codex home:

```sh
RUN_CODEX_LIVE=1 node --test tests/live/codex-hooks.live.test.js
```

The live test must use a temporary `CODEX_HOME`; it must never rewrite the
developer's actual global Codex configuration. `CODEX_LIVE_MODEL` can select a
model, and `CODEX_LIVE_AUTH_FILE` can point to auth that is copied into the
temporary home for the run.
