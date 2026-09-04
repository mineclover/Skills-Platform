const { finding, summarizeFindings } = require("./common");
const { getSkillAuthoringRuleset } = require("@skills-platform/contracts");

const ANTIGRAVITY_RULESET = Object.freeze(getSkillAuthoringRuleset("antigravity"));

function antigravityFinding(options) {
  return finding({
    basis: { kind: "official", source_url: ANTIGRAVITY_RULESET.source_url },
    ...options,
  });
}

function evaluateAntigravity(context, commonResult) {
  const findings = [...commonResult.findings];
  if (context.root_symlink) {
    findings.push(antigravityFinding({
      code: "antigravity_root_symlink_undocumented",
      severity: "warning",
      confidence: "likely",
      basis: {
        kind: "heuristic",
        statement: "The current Antigravity skill documentation does not specify root symlink behavior.",
      },
      category: "portability",
      path: "SKILL.md",
      message: "The Antigravity skill folder is a symbolic link, whose discovery behavior is not part of the documented contract.",
      recommendation: "Verify discovery in the target Antigravity version or materialize a regular folder.",
    }));
  }
  if (context.manifest_path !== "SKILL.md") {
    findings.push(antigravityFinding({
      code: "antigravity_exact_manifest_required",
      severity: "error",
      category: "manifest",
      path: context.manifest_path ?? "SKILL.md",
      message: "Antigravity requires an exact-case SKILL.md file at the skill root.",
      recommendation: "Rename the root manifest to SKILL.md.",
    }));
  }
  if (typeof context.manifest?.description !== "string" || !context.manifest.description.trim()) {
    findings.push(antigravityFinding({
      code: "antigravity_description_required",
      severity: "error",
      category: "manifest",
      field: "description",
      message: "Antigravity requires a non-empty trigger description.",
      recommendation: "Describe what the skill does and when Antigravity should apply it.",
    }));
  }
  if (context.manifest?.name !== undefined && context.manifest?.name !== null) {
    const name = context.manifest.name;
    if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name.trim())) {
      findings.push(antigravityFinding({
        code: "antigravity_name_invalid",
        severity: "error",
        category: "manifest",
        field: "name",
        message: "When provided, the Antigravity skill name must use lowercase hyphen-case.",
        recommendation: "Use lowercase letters and digits separated by single hyphens, or omit name to use the folder name.",
      }));
    }
  }
  if (context.openai_metadata.present) {
    findings.push(antigravityFinding({
      code: "antigravity_openai_yaml_ignored",
      severity: "info",
      category: "portability",
      path: "agents/openai.yaml",
      message: "agents/openai.yaml is a Codex provider extension and is ignored by Antigravity.",
      recommendation: "Keep essential workflow behavior in SKILL.md and Antigravity-supported resources.",
    }));
  }
  const optionalDirectories = ANTIGRAVITY_RULESET.optional_directories
    .filter((directory) => context.file_entries.some((entry) => entry.path === directory || entry.path.startsWith(`${directory}/`)));

  return {
    platform: "antigravity",
    ruleset: {
      id: ANTIGRAVITY_RULESET.ruleset_id,
      version: ANTIGRAVITY_RULESET.version,
      source: ANTIGRAVITY_RULESET.source_url,
    },
    summary: summarizeFindings(findings),
    findings,
    observations: { ...commonResult.observations },
    provider_metadata: {
      manifest_path: context.manifest_path,
      manifest_exact_case: context.manifest_path === null ? null : context.manifest_path === "SKILL.md",
      resolved_name: context.resolved_name ?? null,
      invocation_mode: "implicit_and_explicit",
      frontmatter_fields: context.manifest ? Object.keys(context.manifest).sort() : [],
      optional_directories_present: optionalDirectories,
      provider_extensions_present: [],
      antigravity: {
        name_defaulted: !(typeof context.manifest?.name === "string" && context.manifest.name.trim()),
        examples: context.file_entries.filter((entry) => entry.type === "file" && entry.path.startsWith("examples/")).map((entry) => entry.path).sort(),
        resources: context.file_entries.filter((entry) => entry.type === "file" && entry.path.startsWith("resources/")).map((entry) => entry.path).sort(),
      },
    },
  };
}

module.exports = { ANTIGRAVITY_RULESET, evaluateAntigravity };
