const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsConstants = require("node:fs").constants;
const path = require("node:path");
const YAML = require("yaml");
const {
  createSkillAuthoringAnalysis,
  createSkillAuthoringPlatformResult,
  listSkillAuthoringRulesets: listContractSkillAuthoringRulesets,
  validateSkillAuthoringAnalysis,
  validateSkillAuthoringVirtualValidationRequest,
} = require("@skills-platform/contracts");
const { ANTIGRAVITY_RULESET, evaluateAntigravity } = require("./skill-authoring-rulesets/antigravity");
const { CODEX_RULESET, evaluateCodex } = require("./skill-authoring-rulesets/codex");
const { COMMON_RULESET, commonChecks, finding, summarizeFindings } = require("./skill-authoring-rulesets/common");

const SKILL_AUTHORING_SCHEMA_VERSION = 1;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
const MAX_PACKAGE_FILES = 512;
const MAX_PACKAGE_DEPTH = 12;
const PROVIDERS = new Set(["codex", "antigravity", "portable"]);
const RESOURCE_DIRECTORIES = Object.freeze({
  codex: new Set(["scripts", "references", "assets"]),
  antigravity: new Set(["scripts", "examples", "resources"]),
  portable: new Set(["scripts", "references", "assets", "examples", "resources"]),
});
const OPENAI_INTERFACE_FIELDS = new Set([
  "display_name",
  "short_description",
  "icon_small",
  "icon_large",
  "brand_color",
  "default_prompt",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeProvider(value = "portable") {
  const provider = String(value || "portable").trim().toLowerCase();
  if (!PROVIDERS.has(provider)) throw new Error("Skill authoring provider must be codex, antigravity, or portable");
  return provider;
}

function listSkillAuthoringRulesets() {
  return listContractSkillAuthoringRulesets();
}

function rulesetFingerprint() {
  return listSkillAuthoringRulesets()
    .map((item) => `${item.ruleset_id}@${item.version}`)
    .sort()
    .join("+");
}

function safeRelativePath(value, field = "File path") {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  const candidate = value.trim().replaceAll("\\", "/");
  if (candidate.includes("\0") || candidate.startsWith("/") || /^[A-Za-z]:/.test(candidate)) {
    throw new Error(`${field} must be relative to the skill package`);
  }
  const normalized = path.posix.normalize(candidate.replace(/^\.\//, ""));
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${field} must remain inside the skill package`);
  }
  return normalized;
}

function normalizeResourcePath(value) {
  try {
    const normalized = safeRelativePath(value, "Resource path");
    return { path: normalized, escapes: false };
  } catch {
    return { path: null, escapes: true };
  }
}

function parseYamlObject(content, label) {
  try {
    const document = YAML.parseDocument(content, {
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
      schema: "core",
    });
    if (document.errors.length > 0) {
      return { value: null, error: `${label} is invalid YAML: ${document.errors[0].message}` };
    }
    const value = document.toJS({ maxAliasCount: 0 });
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { value: null, error: `${label} must be a YAML object` };
    }
    return { value, error: null };
  } catch (error) {
    return { value: null, error: `${label} is invalid YAML: ${error.message}` };
  }
}

function parseFrontmatter(content, manifestPath = "SKILL.md") {
  const normalized = String(content ?? "").replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    return {
      manifest: null,
      body: normalized,
      findings: [finding({
        code: "manifest_frontmatter_missing",
        severity: "error",
        basis: COMMON_RULESET.source,
        category: "manifest",
        path: manifestPath,
        message: "Missing YAML frontmatter: SKILL.md must start with --- and end the header with ---.",
        recommendation: "Add a YAML object containing the provider-required fields at the start of SKILL.md.",
      })],
    };
  }
  const parsed = parseYamlObject(match[1], `${manifestPath} frontmatter`);
  if (parsed.error) {
    return {
      manifest: null,
      body: normalized.slice(match[0].length),
      findings: [finding({
        code: "manifest_frontmatter_invalid",
        severity: "error",
        basis: COMMON_RULESET.source,
        category: "manifest",
        path: manifestPath,
        message: parsed.error,
        recommendation: "Fix the YAML syntax and keep frontmatter as one mapping object.",
      })],
    };
  }
  return { manifest: parsed.value, body: normalized.slice(match[0].length), findings: [] };
}

function parseSkillManifest(content, { manifestPath = "SKILL.md", folderName = null } = {}) {
  const parsed = parseFrontmatter(content, manifestPath);
  if (!parsed.manifest) {
    const error = new Error(parsed.findings[0]?.message ?? `Invalid skill manifest: ${manifestPath}`);
    error.code = "SKILL_MANIFEST_INVALID";
    error.findings = parsed.findings;
    throw error;
  }
  const declaredName = parsed.manifest.name;
  if (declaredName !== undefined && typeof declaredName !== "string") {
    throw new Error(`Skill name must be a string: ${manifestPath}`);
  }
  if (parsed.manifest.description !== undefined && typeof parsed.manifest.description !== "string") {
    throw new Error(`Skill description must be a string: ${manifestPath}`);
  }
  const fallbackName = typeof folderName === "string" && folderName.trim() ? folderName.trim() : null;
  const name = typeof declaredName === "string" && declaredName.trim() ? declaredName.trim() : fallbackName;
  if (!name) throw new Error(`Missing skill name and folder fallback: ${manifestPath}`);
  return {
    name,
    declared_name: typeof declaredName === "string" && declaredName.trim() ? declaredName.trim() : null,
    description: typeof parsed.manifest.description === "string" ? parsed.manifest.description.trim() : null,
    license: typeof parsed.manifest.license === "string" ? parsed.manifest.license.trim() : null,
    allowed_tools: parsed.manifest["allowed-tools"] ?? null,
    metadata: parsed.manifest.metadata && typeof parsed.manifest.metadata === "object" && !Array.isArray(parsed.manifest.metadata)
      ? clone(parsed.manifest.metadata)
      : null,
    frontmatter: clone(parsed.manifest),
    body: parsed.body,
  };
}

function normalizeVirtualFiles(files) {
  const sourceFiles = Array.isArray(files)
    ? files
    : (files && typeof files === "object"
      ? Object.entries(files).map(([relative_path, content]) => ({ relative_path, content }))
      : null);
  if (!sourceFiles || sourceFiles.length === 0) throw new Error("files must contain at least one virtual file");
  if (sourceFiles.length > MAX_PACKAGE_FILES) throw new Error(`Virtual skill packages may contain at most ${MAX_PACKAGE_FILES} files`);
  const entries = [];
  const seen = new Set();
  let totalBytes = 0;
  for (const [index, file] of sourceFiles.entries()) {
    if (!file || typeof file !== "object" || Array.isArray(file)) throw new Error(`Virtual file ${index} must be an object`);
    const rawPath = file.relative_path;
    const content = file.content;
    const relativePath = safeRelativePath(rawPath);
    if (seen.has(relativePath)) throw new Error(`Duplicate normalized virtual file path: ${relativePath}`);
    if (typeof content !== "string") throw new Error(`Virtual file content must be a string: ${relativePath}`);
    const depth = relativePath.split("/").length;
    if (depth > MAX_PACKAGE_DEPTH) throw new Error(`Virtual file path exceeds maximum depth ${MAX_PACKAGE_DEPTH}: ${relativePath}`);
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_MANIFEST_BYTES) throw new Error(`Virtual authoring file exceeds ${MAX_MANIFEST_BYTES} bytes: ${relativePath}`);
    totalBytes += bytes;
    if (totalBytes > MAX_PACKAGE_BYTES) throw new Error(`Virtual skill package exceeds ${MAX_PACKAGE_BYTES} total bytes`);
    seen.add(relativePath);
    entries.push({ path: relativePath, type: "file", content });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

async function readRegularFileNoFollow(filePath) {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await fs.open(filePath, flags);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw new Error("not a regular file");
    if (stats.size > MAX_MANIFEST_BYTES) throw new Error(`file exceeds ${MAX_MANIFEST_BYTES} bytes`);
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

async function collectPackageEntries(skillPath) {
  const requestedRoot = path.resolve(skillPath);
  const requestedStats = await fs.lstat(requestedRoot);
  const rootSymlink = requestedStats.isSymbolicLink();
  const resolvedRoot = rootSymlink ? await fs.realpath(requestedRoot) : requestedRoot;
  const rootStats = rootSymlink ? await fs.stat(resolvedRoot) : requestedStats;
  if (!rootStats.isDirectory()) throw new Error(`Skill package must be a directory: ${resolvedRoot}`);
  const entries = [];
  let totalBytes = 0;
  async function walk(relativeDirectory = "") {
    const absoluteDirectory = path.join(resolvedRoot, ...relativeDirectory.split("/").filter(Boolean));
    const children = await fs.readdir(absoluteDirectory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
      if (relativePath.split("/").length > MAX_PACKAGE_DEPTH) {
        throw new Error(`Skill package path exceeds maximum depth ${MAX_PACKAGE_DEPTH}: ${relativePath}`);
      }
      const absolutePath = path.join(resolvedRoot, ...relativePath.split("/"));
      const stats = await fs.lstat(absolutePath);
      if (stats.isSymbolicLink()) {
        entries.push({ path: relativePath, type: "symlink", content: null });
      } else if (stats.isDirectory()) {
        entries.push({ path: relativePath, type: "directory", content: null });
        await walk(relativePath);
      } else if (stats.isFile()) {
        totalBytes += stats.size;
        if (totalBytes > MAX_PACKAGE_BYTES) throw new Error(`Skill package exceeds ${MAX_PACKAGE_BYTES} total bytes`);
        let content = null;
        if (path.posix.basename(relativePath).toLowerCase() === "skill.md" || relativePath === "agents/openai.yaml") {
          content = await readRegularFileNoFollow(absolutePath);
        }
        entries.push({ path: relativePath, type: "file", content });
      }
      if (entries.length > MAX_PACKAGE_FILES) throw new Error(`Skill package may contain at most ${MAX_PACKAGE_FILES} files`);
    }
  }
  await walk();
  return {
    requestedRoot,
    resolvedRoot,
    rootSymlink,
    entries: entries.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function manifestCandidate(entries) {
  const exact = entries.find((entry) => entry.type === "file" && entry.path === "SKILL.md");
  if (exact) return exact;
  return entries.find((entry) => entry.type === "file" && entry.path.toLowerCase() === "skill.md") ?? null;
}

function normalizedPlatforms({ platforms, provider }) {
  if (platforms !== undefined) {
    if (!Array.isArray(platforms) || platforms.length === 0) throw new Error("platforms must be a non-empty array");
    const normalized = [...new Set(platforms.map((item) => String(item).trim().toLowerCase()))];
    if (normalized.some((item) => !["codex", "antigravity"].includes(item))) {
      throw new Error("platforms may contain only codex and antigravity");
    }
    return normalized.sort();
  }
  provider = normalizeProvider(provider);
  return provider === "portable" ? ["antigravity", "codex"] : [provider];
}

function inspectEntries({
  entries,
  provider = "portable",
  platforms,
  skillName = null,
  logicalPath = ".",
  rootSymlink = false,
}) {
  const selectedPlatforms = normalizedPlatforms({ platforms, provider });
  provider = selectedPlatforms.length === 2 ? "portable" : selectedPlatforms[0];
  const candidate = manifestCandidate(entries);
  const parseFindings = [];
  let parsed = { manifest: null, body: "", findings: [] };
  if (!candidate) {
    parseFindings.push(finding({
      code: "manifest_missing",
      severity: "error",
      basis: COMMON_RULESET.source,
      category: "manifest",
      path: "SKILL.md",
      message: "No root skill manifest was found.",
      recommendation: "Add an exact-case SKILL.md file at the skill package root.",
    }));
  } else {
    parsed = parseFrontmatter(candidate.content, candidate.path);
    parseFindings.push(...parsed.findings);
  }
  const folderName = typeof skillName === "string" && skillName.trim()
    ? skillName.trim()
    : (logicalPath && logicalPath !== "." ? path.basename(logicalPath) : null);
  const declaredName = parsed.manifest?.name;
  const resolvedName = typeof declaredName === "string" && declaredName.trim() ? declaredName.trim() : folderName;
  if (declaredName !== undefined && declaredName !== null && typeof declaredName !== "string") {
    parseFindings.push(finding({
      code: "manifest_name_type_invalid",
      severity: "error",
      basis: COMMON_RULESET.source,
      category: "manifest",
      path: candidate?.path ?? "SKILL.md",
      field: "name",
      message: "Skill name must be a string when provided.",
      recommendation: "Use a lowercase hyphen-case string.",
    }));
  }
  if (parsed.manifest?.description !== undefined && parsed.manifest?.description !== null
    && typeof parsed.manifest.description !== "string") {
    parseFindings.push(finding({
      code: "manifest_description_type_invalid",
      severity: "error",
      basis: COMMON_RULESET.source,
      category: "manifest",
      path: candidate?.path ?? "SKILL.md",
      field: "description",
      message: "Skill description must be a string when provided.",
      recommendation: "Use a concise string explaining what the skill does and when it applies.",
    }));
  }
  if (folderName && typeof declaredName === "string" && declaredName.trim() && folderName !== declaredName.trim()) {
    parseFindings.push(finding({
      code: "manifest_name_folder_mismatch",
      severity: "warning",
      confidence: "high",
      basis: COMMON_RULESET.source,
      category: "portability",
      path: candidate?.path ?? "SKILL.md",
      field: "name",
      message: `Frontmatter name '${declaredName.trim()}' differs from folder name '${folderName}'.`,
      recommendation: "Use the same lowercase hyphen-case name for the folder and frontmatter.",
    }));
  }

  const openaiEntry = entries.find((entry) => entry.path === "agents/openai.yaml");
  let openaiMetadata = { present: Boolean(openaiEntry), value: null, error: null };
  if (openaiEntry?.type === "symlink") {
    openaiMetadata.error = "agents/openai.yaml must be a package-local regular file; symbolic links are not read";
  } else if (openaiEntry?.type === "file") {
    const metadataParsed = parseYamlObject(openaiEntry.content ?? "", "agents/openai.yaml");
    openaiMetadata = { present: true, ...metadataParsed };
  }

  const context = {
    file_entries: entries.map((entry) => ({ path: entry.path, type: entry.type })),
    regular_files: new Set(entries.filter((entry) => entry.type === "file").map((entry) => entry.path)),
    manifest: parsed.manifest,
    manifest_body: parsed.body,
    manifest_content: candidate?.content ?? "",
    manifest_path: candidate?.path ?? null,
    parse_findings: parseFindings,
    folder_name: folderName,
    resolved_name: resolvedName,
    openai_metadata: openaiMetadata,
    root_symlink: rootSymlink,
    normalize_resource_path: normalizeResourcePath,
  };
  const commonResult = commonChecks(context);
  const allResults = {
    codex: createSkillAuthoringPlatformResult(evaluateCodex(context, commonResult)),
    antigravity: createSkillAuthoringPlatformResult(evaluateAntigravity(context, commonResult)),
  };
  const results = Object.fromEntries(selectedPlatforms.map((platform) => [platform, allResults[platform]]));
  const selectedResults = Object.values(results);
  const selectedFindings = selectedResults.flatMap((result) => result.findings);
  const portableSummary = summarizeFindings(selectedFindings);
  portableSummary.platforms = selectedResults.map((result) => result.platform).sort();
  const authoring = createSkillAuthoringAnalysis(results);
  const validation = validateSkillAuthoringAnalysis(authoring);
  if (!validation.valid) {
    const error = new Error("Generated skill authoring analysis failed its shared contract");
    error.issues = validation.issues;
    throw error;
  }
  return {
    schema_version: SKILL_AUTHORING_SCHEMA_VERSION,
    provider,
    skill_path: logicalPath,
    resolved_name: resolvedName ?? null,
    valid: !selectedResults.some((result) => result.summary.status === "nonconformant"),
    portable_summary: portableSummary,
    results,
    authoring,
    ruleset_fingerprint: rulesetFingerprint(),
  };
}

function inspectSkillVirtualFiles({ files, platforms, provider = "portable", skillName = null } = {}) {
  if (Array.isArray(files) && platforms !== undefined) {
    const validation = validateSkillAuthoringVirtualValidationRequest({ platforms, files });
    if (!validation.valid) {
      const error = new Error("Skill authoring virtual validation request is invalid");
      error.issues = validation.issues;
      throw error;
    }
  }
  return inspectEntries({
    entries: normalizeVirtualFiles(files),
    provider,
    platforms,
    skillName,
    logicalPath: skillName || ".",
    rootSymlink: false,
  });
}

async function inspectSkillPackage({ skillPath, provider = "portable", skillName = null } = {}) {
  if (typeof skillPath !== "string" || !skillPath.trim()) throw new Error("skillPath is required");
  const collected = await collectPackageEntries(skillPath);
  return inspectEntries({
    entries: collected.entries,
    provider,
    // Immutable registry artifacts include a digest suffix in their storage
    // directory. Callers that know the logical package name can provide it so
    // authoring checks compare frontmatter with the package identity rather
    // than the registry's implementation-specific directory name.
    skillName: typeof skillName === "string" && skillName.trim()
      ? skillName.trim()
      : path.basename(collected.requestedRoot),
    logicalPath: collected.requestedRoot,
    rootSymlink: collected.rootSymlink,
  });
}

function normalizeSkillName(rawName) {
  if (typeof rawName !== "string" || !rawName.trim()) throw new Error("Skill name is required");
  const normalized = rawName.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (!normalized || normalized.length > 64) throw new Error("Skill name must normalize to 1–64 lowercase hyphen-case characters");
  return normalized;
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function defaultOpenAiYaml(skillName, interfaceValues = {}) {
  const title = skillName.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  const displayName = interfaceValues.display_name ?? title;
  let shortDescription = interfaceValues.short_description ?? `Help with ${title} tasks and workflows`;
  if (shortDescription.length > 64) shortDescription = `${title.slice(0, 55).trim()} helper`.slice(0, 64);
  if (shortDescription.length < 25) shortDescription = `${shortDescription} workflows`.slice(0, 64);
  const fields = {
    display_name: displayName,
    short_description: shortDescription,
    ...interfaceValues,
  };
  return [
    "interface:",
    ...Object.entries(fields).map(([key, value]) => `  ${key}: ${yamlString(value)}`),
    "",
  ].join("\n");
}

async function initializeSkillPackage({
  skillName,
  outputDirectory,
  provider = "portable",
  resources = [],
  interfaceValues = {},
} = {}) {
  provider = normalizeProvider(provider);
  const normalizedName = normalizeSkillName(skillName);
  if (typeof outputDirectory !== "string" || !outputDirectory.trim()) throw new Error("outputDirectory is required");
  if (!Array.isArray(resources)) throw new Error("resources must be an array");
  if (!interfaceValues || typeof interfaceValues !== "object" || Array.isArray(interfaceValues)) {
    throw new Error("interfaceValues must be an object");
  }
  for (const [field, value] of Object.entries(interfaceValues)) {
    if (!OPENAI_INTERFACE_FIELDS.has(field)) throw new Error(`Unsupported OpenAI interface field: ${field}`);
    if (typeof value !== "string" || !value.trim()) throw new Error(`OpenAI interface field ${field} must be a non-empty string`);
  }
  if (provider === "antigravity" && Object.keys(interfaceValues).length > 0) {
    throw new Error("OpenAI interface metadata is available only for codex or portable skills");
  }
  if (interfaceValues.default_prompt && !interfaceValues.default_prompt.includes(`$${normalizedName}`)) {
    throw new Error(`OpenAI interface default_prompt must mention $${normalizedName}`);
  }
  const allowedResources = RESOURCE_DIRECTORIES[provider];
  const normalizedResources = [...new Set(resources.flatMap((value) => String(value).split(","))
    .map((value) => value.trim()).filter(Boolean))].sort();
  const unsupported = normalizedResources.filter((resource) => !allowedResources.has(resource));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported ${provider} resource directories: ${unsupported.join(", ")}`);
  }
  const baseDirectory = path.resolve(outputDirectory);
  const targetDirectory = path.resolve(baseDirectory, normalizedName);
  const relative = path.relative(baseDirectory, targetDirectory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Skill target must be a new child directory of outputDirectory");
  }
  try {
    await fs.mkdir(targetDirectory, { recursive: false, mode: 0o755 });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Skill directory already exists: ${targetDirectory}`);
    if (error.code === "ENOENT") {
      await fs.mkdir(baseDirectory, { recursive: true });
      await fs.mkdir(targetDirectory, { recursive: false, mode: 0o755 });
    } else {
      throw error;
    }
  }
  try {
    const skillMarkdown = [
      "---",
      `name: ${normalizedName}`,
      `description: ${yamlString("[TODO: Describe what this skill does and the requests that should activate it.]")}`,
      "---",
      "",
      `# ${normalizedName.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")}`,
      "",
      "[TODO: Add focused, task-specific guidance and link supporting resources only where needed.]",
      "",
    ].join("\n");
    await fs.writeFile(path.join(targetDirectory, "SKILL.md"), skillMarkdown, { encoding: "utf8", flag: "wx", mode: 0o644 });
    for (const resource of normalizedResources) await fs.mkdir(path.join(targetDirectory, resource), { recursive: false });
    if (provider === "codex" || provider === "portable") {
      const agentsDirectory = path.join(targetDirectory, "agents");
      await fs.mkdir(agentsDirectory, { recursive: false });
      await fs.writeFile(
        path.join(agentsDirectory, "openai.yaml"),
        defaultOpenAiYaml(normalizedName, interfaceValues),
        { encoding: "utf8", flag: "wx", mode: 0o644 },
      );
    }
    return {
      initialized: true,
      provider,
      skill_name: normalizedName,
      original_skill_name: skillName,
      path: targetDirectory,
      resources: normalizedResources,
      inspection: await inspectSkillPackage({ skillPath: targetDirectory, provider }),
    };
  } catch (error) {
    await fs.rm(targetDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function authoringAnalysisPayload(inspection) {
  return createSkillAuthoringAnalysis(clone(inspection.results));
}

function authoringAnalysisDigest(inspection) {
  return crypto.createHash("sha256").update(JSON.stringify(authoringAnalysisPayload(inspection))).digest("hex");
}

async function freezeSkillPackage({
  sourceSkillPath,
  version,
  outputDirectory,
  force = false,
  provider = "portable",
}) {
  if (!version || typeof version !== "string" || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version.trim())) {
    throw new Error(`Invalid semantic version: ${version}. Expected format: X.Y.Z`);
  }
  const cleanVersion = version.trim();
  const sourcePath = path.resolve(sourceSkillPath);
  const st = await fs.stat(sourcePath);
  if (!st.isDirectory()) {
    throw new Error(`Source skill path must be a directory: ${sourcePath}`);
  }
  const sourceSkillName = path.basename(sourcePath).split("@")[0];
  const targetDirName = `${sourceSkillName}@${cleanVersion}`;
  const outDir = outputDirectory ? path.resolve(outputDirectory) : path.dirname(sourcePath);
  const targetDirectory = path.join(outDir, targetDirName);

  try {
    await fs.access(targetDirectory);
    if (!force) {
      throw new Error(`Target frozen skill directory already exists: ${targetDirectory}. Pass --force to overwrite.`);
    }
    await fs.rm(targetDirectory, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.cp(sourcePath, targetDirectory, { recursive: true });

  // Update or inject version in SKILL.md frontmatter
  const skillMdPath = path.join(targetDirectory, "SKILL.md");
  try {
    let content = await fs.readFile(skillMdPath, "utf8");
    if (content.startsWith("---")) {
      const secondDashes = content.indexOf("\n---", 3);
      if (secondDashes !== -1) {
        const frontmatter = content.slice(3, secondDashes);
        const body = content.slice(secondDashes);
        let updatedFm;
        if (/^version:\s*.+$/m.test(frontmatter)) {
          updatedFm = frontmatter.replace(/^version:\s*.+$/m, `version: ${cleanVersion}`);
        } else {
          updatedFm = frontmatter.trimEnd() + `\nversion: ${cleanVersion}\n`;
        }
        content = `---${updatedFm}${body}`;
        await fs.writeFile(skillMdPath, content, "utf8");
      }
    }
  } catch {}

  const inspection = await inspectSkillPackage({ skillPath: targetDirectory, provider });

  return {
    frozen: true,
    skill_name: sourceSkillName,
    version: cleanVersion,
    source_path: sourcePath,
    target_path: targetDirectory,
    valid: inspection.valid,
    findings: inspection.findings,
  };
}

module.exports = {
  ANTIGRAVITY_RULESET,
  CODEX_RULESET,
  COMMON_RULESET,
  SKILL_AUTHORING_SCHEMA_VERSION,
  authoringAnalysisDigest,
  authoringAnalysisPayload,
  freezeSkillPackage,
  initializeSkillPackage,
  inspectSkillPackage,
  inspectSkillVirtualFiles,
  listSkillAuthoringRulesets,
  normalizeProvider,
  normalizeSkillName,
  parseFrontmatter,
  parseSkillManifest,
  rulesetFingerprint,
};
