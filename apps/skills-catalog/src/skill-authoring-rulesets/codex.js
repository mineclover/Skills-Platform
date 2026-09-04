const { finding, summarizeFindings } = require("./common");
const { getSkillAuthoringRuleset } = require("@skills-platform/contracts");

const CODEX_RULESET = Object.freeze(getSkillAuthoringRuleset("codex"));

const INTERFACE_STRING_FIELDS = new Set([
  "display_name",
  "short_description",
  "icon_small",
  "icon_large",
  "brand_color",
  "default_prompt",
]);
const bundledValidatorBasis = (statement) => ({ kind: "bundled_validator", statement });

function codexFinding(options) {
  return finding({
    basis: { kind: "official", source_url: CODEX_RULESET.source_url },
    ...options,
  });
}

function validateOpenAiMetadata(context, findings) {
  const metadata = context.openai_metadata;
  if (!metadata.present) {
    return {
      present: false,
      policy: { allow_implicit_invocation: true },
      dependencies: { tools: [] },
    };
  }
  if (metadata.error) {
    findings.push(codexFinding({
      code: "openai_yaml_invalid",
      severity: "error",
      category: "provider_metadata",
      path: "agents/openai.yaml",
      message: metadata.error,
      recommendation: "Fix agents/openai.yaml so it is a YAML object with valid interface, policy, and dependencies fields.",
    }));
    return { present: true, interface: undefined, policy: { allow_implicit_invocation: true }, dependencies: { tools: [] } };
  }

  const value = metadata.value;
  const interfaceValue = value.interface;
  if (interfaceValue !== undefined && (!interfaceValue || typeof interfaceValue !== "object" || Array.isArray(interfaceValue))) {
    findings.push(codexFinding({
      code: "openai_interface_invalid",
      severity: "error",
      category: "provider_metadata",
      path: "agents/openai.yaml",
      field: "interface",
      message: "interface must be a YAML object.",
      recommendation: "Use an interface mapping containing only supported UI metadata fields.",
    }));
  }
  const normalizedInterface = interfaceValue && typeof interfaceValue === "object" && !Array.isArray(interfaceValue)
    ? { ...interfaceValue }
    : null;
  if (normalizedInterface) {
    for (const [field, fieldValue] of Object.entries(normalizedInterface)) {
      if (!INTERFACE_STRING_FIELDS.has(field)) {
        findings.push(codexFinding({
          code: "openai_interface_unknown_field",
          severity: "info",
          category: "provider_metadata",
          path: "agents/openai.yaml",
          field: `interface.${field}`,
          message: `Unknown interface field is preserved for forward compatibility: ${field}`,
          recommendation: "Confirm the field against the current Codex skills documentation.",
        }));
        continue;
      }
      if (typeof fieldValue !== "string" || !fieldValue.trim()) {
        findings.push(codexFinding({
          code: "openai_interface_field_invalid",
          severity: "error",
          category: "provider_metadata",
          path: "agents/openai.yaml",
          field: `interface.${field}`,
          message: `${field} must be a non-empty string.`,
          recommendation: "Provide a quoted non-empty string or remove the optional field.",
        }));
      }
    }
    if (typeof normalizedInterface.short_description === "string"
      && (normalizedInterface.short_description.length < 25 || normalizedInterface.short_description.length > 64)) {
      findings.push(codexFinding({
        code: "openai_short_description_length",
        severity: "warning",
        basis: bundledValidatorBasis("The bundled skill-creator UI metadata reference recommends 25–64 characters for short_description."),
        category: "provider_metadata",
        path: "agents/openai.yaml",
        field: "interface.short_description",
        message: "short_description should contain 25–64 characters for consistent UI presentation.",
        recommendation: "Rewrite the UI description to fit the 25–64 character range.",
      }));
    }
    if (typeof normalizedInterface.brand_color === "string" && !/^#[0-9A-Fa-f]{6}$/.test(normalizedInterface.brand_color)) {
      findings.push(codexFinding({
        code: "openai_brand_color_invalid",
        severity: "error",
        basis: bundledValidatorBasis("The bundled skill-creator UI metadata reference requires #RRGGBB brand colors."),
        category: "provider_metadata",
        path: "agents/openai.yaml",
        field: "interface.brand_color",
        message: "brand_color must use #RRGGBB format.",
        recommendation: "Use a six-digit hexadecimal color such as #3B82F6.",
      }));
    }
    for (const field of ["icon_small", "icon_large"]) {
      const iconPath = normalizedInterface[field];
      if (typeof iconPath !== "string" || !iconPath.trim()) continue;
      const normalized = context.normalize_resource_path(iconPath);
      if (!normalized || normalized.escapes) {
        findings.push(codexFinding({
          code: "openai_icon_path_unsafe",
          severity: "error",
          category: "security",
          path: "agents/openai.yaml",
          field: `interface.${field}`,
          message: `${field} must reference a package-local asset.`,
          recommendation: "Place the icon in assets/ and use a relative path such as ./assets/icon.svg.",
        }));
      } else if (!context.regular_files.has(normalized.path)) {
        findings.push(codexFinding({
          code: "openai_icon_missing",
          severity: "error",
          category: "provider_metadata",
          path: "agents/openai.yaml",
          field: `interface.${field}`,
          message: `Icon file does not exist in the package: ${iconPath}`,
          recommendation: "Add the referenced icon or remove the optional icon field.",
        }));
      }
    }
    if (typeof normalizedInterface.default_prompt === "string"
      && context.resolved_name
      && !normalizedInterface.default_prompt.includes(`$${context.resolved_name}`)) {
      findings.push(codexFinding({
        code: "openai_default_prompt_missing_skill_reference",
        severity: "warning",
        basis: bundledValidatorBasis("The bundled skill-creator UI metadata reference requires default_prompt to mention the skill as $skill-name."),
        category: "provider_metadata",
        path: "agents/openai.yaml",
        field: "interface.default_prompt",
        message: `default_prompt does not mention $${context.resolved_name}.`,
        recommendation: "Use a short example prompt that explicitly invokes the skill by name.",
      }));
    }
  }

  let allowImplicit = true;
  if (value.policy !== undefined) {
    if (!value.policy || typeof value.policy !== "object" || Array.isArray(value.policy)) {
      findings.push(codexFinding({
        code: "openai_policy_invalid",
        severity: "error",
        category: "invocation",
        path: "agents/openai.yaml",
        field: "policy",
        message: "policy must be a YAML object.",
        recommendation: "Use policy.allow_implicit_invocation with a boolean value.",
      }));
    } else if (value.policy.allow_implicit_invocation !== undefined) {
      if (typeof value.policy.allow_implicit_invocation !== "boolean") {
        findings.push(codexFinding({
          code: "openai_implicit_policy_invalid",
          severity: "error",
          category: "invocation",
          path: "agents/openai.yaml",
          field: "policy.allow_implicit_invocation",
          message: "allow_implicit_invocation must be a boolean.",
          recommendation: "Set the value to true or false without quotes.",
        }));
      } else {
        allowImplicit = value.policy.allow_implicit_invocation;
      }
    }
  }

  const normalizedTools = [];
  if (value.dependencies !== undefined) {
    if (!value.dependencies || typeof value.dependencies !== "object" || Array.isArray(value.dependencies)) {
      findings.push(codexFinding({
        code: "openai_dependencies_invalid",
        severity: "error",
        category: "dependencies",
        path: "agents/openai.yaml",
        field: "dependencies",
        message: "dependencies must be a YAML object.",
        recommendation: "Declare dependencies.tools as an array of MCP dependency objects.",
      }));
    } else if (value.dependencies.tools !== undefined && !Array.isArray(value.dependencies.tools)) {
      findings.push(codexFinding({
        code: "openai_dependency_tools_invalid",
        severity: "error",
        category: "dependencies",
        path: "agents/openai.yaml",
        field: "dependencies.tools",
        message: "dependencies.tools must be an array.",
        recommendation: "Use a YAML list of MCP dependency objects.",
      }));
    } else {
      for (const [index, tool] of (value.dependencies.tools ?? []).entries()) {
        if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
          findings.push(codexFinding({
            code: "openai_dependency_tool_invalid",
            severity: "error",
            category: "dependencies",
            path: "agents/openai.yaml",
            field: `dependencies.tools[${index}]`,
            message: "Each dependency tool must be an object.",
            recommendation: "Declare type, value, and any optional MCP connection metadata.",
          }));
          continue;
        }
        if (tool.type !== "mcp" || typeof tool.value !== "string" || !tool.value.trim()) {
          findings.push(codexFinding({
            code: "openai_dependency_tool_unsupported",
            severity: "error",
            basis: bundledValidatorBasis("The bundled skill-creator provider metadata reference currently supports MCP tool dependencies."),
            category: "dependencies",
            path: "agents/openai.yaml",
            field: `dependencies.tools[${index}]`,
            message: "Only MCP dependencies with a non-empty value are supported.",
            recommendation: "Set type to mcp and provide the MCP server identifier in value.",
          }));
          continue;
        }
        for (const field of ["description", "transport", "url"]) {
          if (tool[field] !== undefined && (typeof tool[field] !== "string" || !tool[field].trim())) {
            findings.push(codexFinding({
              code: "openai_dependency_field_invalid",
              severity: "error",
              category: "dependencies",
              path: "agents/openai.yaml",
              field: `dependencies.tools[${index}].${field}`,
              message: `${field} must be a non-empty string when provided.`,
              recommendation: "Provide a non-empty string or remove the optional field.",
            }));
          }
        }
        normalizedTools.push({ ...tool });
      }
    }
  }

  const result = {
    present: true,
    policy: { allow_implicit_invocation: allowImplicit },
    dependencies: { tools: normalizedTools },
  };
  if (normalizedInterface) result.interface = normalizedInterface;
  return result;
}

function evaluateCodex(context, commonResult) {
  const findings = [...commonResult.findings];
  if (context.root_symlink) {
    findings.push(codexFinding({
      code: "codex_root_symlink_supported",
      severity: "info",
      category: "portability",
      path: "SKILL.md",
      message: "Codex supports a skill folder delivered through a symbolic link.",
      recommendation: "Keep the resolved target reviewed and stable for the lifetime of the delivery binding.",
    }));
  }
  if (context.manifest_path !== "SKILL.md") {
    findings.push(codexFinding({
      code: "codex_exact_manifest_required",
      severity: "error",
      category: "manifest",
      path: context.manifest_path ?? "SKILL.md",
      message: "Codex requires an exact-case SKILL.md file at the skill root.",
      recommendation: "Rename the root manifest to SKILL.md.",
    }));
  }
  const declaredName = context.manifest?.name;
  if (typeof declaredName !== "string" || !declaredName.trim()) {
    findings.push(codexFinding({
      code: "codex_name_required",
      severity: "error",
      category: "manifest",
      field: "name",
      message: "Codex requires a non-empty name in SKILL.md frontmatter.",
      recommendation: "Add a lowercase hyphen-case name field.",
    }));
  } else {
    const name = declaredName.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
      findings.push(codexFinding({
        code: "codex_name_invalid",
        severity: "error",
        basis: bundledValidatorBasis("The bundled skill-creator validator requires 1–64 lowercase hyphen-case characters without repeated edge hyphens."),
        category: "manifest",
        field: "name",
        message: "Codex skill names must use lowercase letters, digits, single hyphens, and at most 64 characters.",
        recommendation: "Use a concise lowercase hyphen-case name without leading, trailing, or repeated hyphens.",
      }));
    }
  }
  if (typeof context.manifest?.description !== "string" || !context.manifest.description.trim()) {
    findings.push(codexFinding({
      code: "codex_description_required",
      severity: "error",
      category: "manifest",
      field: "description",
      message: "Codex requires a non-empty trigger description.",
      recommendation: "Describe what the skill does and the requests that should activate it.",
    }));
  }

  const metadata = validateOpenAiMetadata(context, findings);
  const optionalDirectories = CODEX_RULESET.optional_directories
    .filter((directory) => context.file_entries.some((entry) => entry.path === directory || entry.path.startsWith(`${directory}/`)));
  const providerExtensions = CODEX_RULESET.provider_extensions
    .filter((extension) => context.file_entries.some((entry) => entry.path === extension));
  return {
    platform: "codex",
    ruleset: { id: CODEX_RULESET.ruleset_id, version: CODEX_RULESET.version, source: CODEX_RULESET.source_url },
    summary: summarizeFindings(findings),
    findings,
    observations: { ...commonResult.observations },
    provider_metadata: {
      manifest_path: context.manifest_path,
      manifest_exact_case: context.manifest_path === null ? null : context.manifest_path === "SKILL.md",
      resolved_name: context.resolved_name ?? null,
      invocation_mode: metadata.policy.allow_implicit_invocation ? "implicit_and_explicit" : "explicit_only",
      frontmatter_fields: context.manifest ? Object.keys(context.manifest).sort() : [],
      optional_directories_present: optionalDirectories,
      provider_extensions_present: providerExtensions,
      openai: metadata,
    },
  };
}

module.exports = { CODEX_RULESET, evaluateCodex };
