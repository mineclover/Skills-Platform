const path = require("node:path");

const COMMON_RULESET = Object.freeze({
  id: "skills-platform-common-authoring",
  version: "1",
  source: "Skills Platform common authoring conventions",
});

const PLACEHOLDER_PATTERN = /(?:\[TODO(?::[^\]]*)?\]|\b(?:replace this placeholder|step-by-step procedural runbook)\b)/i;
const EXECUTABLE_PATTERN = /\.(?:sh|bash|zsh|fish|js|mjs|cjs|ts|py|ps1|bat|cmd)$/i;

function finding({
  code,
  severity,
  confidence = "certain",
  basis,
  category,
  path: findingPath = "SKILL.md",
  line,
  field,
  message,
  recommendation,
}) {
  const confidenceMap = { high: "certain", medium: "likely", low: "heuristic" };
  const categoryMap = {
    manifest: "structure",
    focus: "scope",
    invocation: "provider_metadata",
    dependencies: "provider_metadata",
  };
  const normalizedBasis = basis && typeof basis === "object"
    ? basis
    : (/^https:\/\//i.test(String(basis ?? ""))
      ? { kind: "official", source_url: String(basis) }
      : { kind: "platform_policy", statement: String(basis || COMMON_RULESET.source) });
  const location = { relative_path: findingPath };
  if (Number.isInteger(line) && line > 0) location.start_line = line;
  if (field) location.yaml_path = field;
  return {
    rule_id: code,
    severity,
    confidence: confidenceMap[confidence] ?? confidence,
    basis: normalizedBasis,
    category: categoryMap[category] ?? category,
    location,
    message,
    recommendation,
  };
}

function normalizeRelativeTarget(target) {
  if (typeof target !== "string") return null;
  const withoutFragment = target.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(withoutFragment);
    } catch {
      return withoutFragment;
    }
  })().replaceAll("\\", "/");
  if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(decoded) || /^[A-Za-z]:/.test(decoded)) return null;
  const normalized = path.posix.normalize(decoded.replace(/^\.\//, ""));
  if (normalized === ".") return null;
  return normalized;
}

function markdownLinks(content) {
  const links = [];
  const pattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const visibleLines = [];
  let fenceCharacter = null;
  let fenceLength = 0;
  for (const line of String(content ?? "").split(/\r?\n/)) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (!fenceCharacter) {
        fenceCharacter = fence[1][0];
        fenceLength = fence[1].length;
      } else if (fence[1][0] === fenceCharacter && fence[1].length >= fenceLength) {
        fenceCharacter = null;
        fenceLength = 0;
      }
      visibleLines.push("");
      continue;
    }
    visibleLines.push(fenceCharacter ? "" : line);
  }
  for (const match of visibleLines.join("\n").matchAll(pattern)) links.push(match[1]);
  return [...new Set(links)].sort();
}

function commonChecks(context) {
  const findings = [...context.parse_findings];
  const content = context.manifest_content ?? "";
  const links = markdownLinks(content);
  const files = new Set(context.file_entries.filter((entry) => entry.type === "file").map((entry) => entry.path));
  const linkedResources = [];
  const externalReferences = [];

  for (const target of links) {
    if (/^(?:https?:)?\/\//i.test(target)) {
      externalReferences.push(target);
      continue;
    }
    const relativeTarget = normalizeRelativeTarget(target);
    if (!relativeTarget) continue;
    if (relativeTarget === ".." || relativeTarget.startsWith("../")) {
      findings.push(finding({
        code: "resource_link_escapes_package",
        severity: "error",
        basis: COMMON_RULESET.source,
        category: "security",
        message: `Relative link escapes the skill package: ${target}`,
        recommendation: "Keep every linked skill resource inside the skill directory.",
      }));
      continue;
    }
    linkedResources.push(relativeTarget);
    if (!files.has(relativeTarget)) {
      findings.push(finding({
        code: "resource_link_missing",
        severity: "error",
        basis: COMMON_RULESET.source,
        category: "progressive_disclosure",
        message: `Linked resource was not found in the package: ${target}`,
        recommendation: "Add the referenced file or remove the stale link.",
      }));
    }
  }

  if (PLACEHOLDER_PATTERN.test(content)) {
    findings.push(finding({
      code: "unfinished_placeholder",
      severity: "warning",
      basis: {
        kind: "bundled_validator",
        statement: "The bundled skill-creator validator rejects unfinished TODO scaffold placeholders.",
      },
      category: "focus",
      message: "SKILL.md contains unfinished scaffold or TODO text.",
      recommendation: "Replace scaffold text with task-specific guidance before review.",
    }));
  }

  const lineCount = content ? content.replace(/\r\n?/g, "\n").split("\n").length : 0;
  if (lineCount > 500) {
    findings.push(finding({
      code: "skill_entrypoint_too_large",
      severity: "warning",
      confidence: "medium",
      basis: COMMON_RULESET.source,
      category: "progressive_disclosure",
      message: `SKILL.md has ${lineCount} lines and may load too much conditional detail at activation time.`,
      recommendation: "Move mode-specific schemas, examples, and procedures into directly linked supporting files.",
    }));
  }

  const description = context.manifest?.description;
  if (typeof description === "string" && /\b(?:all tasks?|anything|everything|do everything)\b/i.test(description)) {
    findings.push(finding({
      code: "description_scope_too_broad",
      severity: "warning",
      confidence: "medium",
      basis: COMMON_RULESET.source,
      category: "focus",
      field: "description",
      message: "The trigger description appears broad enough to attract unrelated work.",
      recommendation: "Name the concrete task and include a meaningful trigger boundary or exclusion.",
    }));
  }

  for (const entry of context.file_entries.filter((item) => item.type === "symlink")) {
    findings.push(finding({
      code: "symlink_not_followed",
      severity: "warning",
      basis: COMMON_RULESET.source,
      category: "security",
      path: entry.path,
      message: "The analyzer found a symbolic link and deliberately did not read its target.",
      recommendation: "Replace it with a package-local regular file if deterministic portable analysis is required.",
    }));
  }

  const supportFiles = context.file_entries
    .filter((entry) => entry.type === "file" && entry.path !== context.manifest_path)
    .map((entry) => entry.path)
    .sort();
  const directlyLinked = new Set(linkedResources);
  const unreferenced = supportFiles.filter((file) => (
    /^(?:references|resources|examples)\//.test(file) && !directlyLinked.has(file)
  ));
  if (unreferenced.length > 0) {
    findings.push(finding({
      code: "support_resources_not_linked",
      severity: "info",
      confidence: "medium",
      basis: COMMON_RULESET.source,
      category: "progressive_disclosure",
      path: unreferenced[0],
      message: `${unreferenced.length} supporting resource file(s) are not linked directly from SKILL.md.`,
      recommendation: "Link each conditional reference where it becomes relevant, or remove unused resources.",
    }));
  }

  return {
    findings,
    observations: {
      manifest_path: context.manifest_path,
      line_count: lineCount,
      file_count: context.file_entries.length,
      regular_file_count: context.file_entries.filter((entry) => entry.type === "file").length,
      symlink_count: context.file_entries.filter((entry) => entry.type === "symlink").length,
      root_symlink: context.root_symlink === true,
      markdown_links: links,
      linked_resources: [...new Set(linkedResources)].sort(),
      external_references: externalReferences,
      unreferenced_resources: unreferenced,
      executable_like_files: context.file_entries
        .filter((entry) => entry.type === "file" && EXECUTABLE_PATTERN.test(entry.path))
        .map((entry) => entry.path)
        .sort(),
    },
  };
}

function summarizeFindings(findings) {
  const summary = {
    compatible: !findings.some((item) => item.severity === "error"),
    status: "conformant",
    finding_count: findings.length,
    error_count: 0,
    warning_count: 0,
    info_count: 0,
  };
  for (const item of findings) {
    if (item.severity === "error") summary.error_count += 1;
    else if (item.severity === "warning") summary.warning_count += 1;
    else summary.info_count += 1;
  }
  summary.status = summary.error_count > 0
    ? "nonconformant"
    : summary.warning_count > 0 ? "review_recommended" : "conformant";
  return summary;
}

module.exports = {
  COMMON_RULESET,
  commonChecks,
  finding,
  markdownLinks,
  normalizeRelativeTarget,
  summarizeFindings,
};
