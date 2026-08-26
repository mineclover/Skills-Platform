const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { digestDirectory, listFiles, ARTIFACT_TYPES = new Set(["skill", "rule", "hook", "plugin", "mcp_server"]), INVOCATION_MODES = new Set(["model_invoked", "user_invoked", "hybrid", "unspecified"]) } = require("@skills-platform/contracts");

const REGISTRY_SCHEMA_VERSION = 2;
const execFileAsync = promisify(execFile);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artifact";
}

function sourceId(locator) {
  return `source_local_${sha256(locator).slice(0, 16)}`;
}

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

function inferArtifactType(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base === "rule.md" || base.endsWith(".rule.md")) return "rule";
  if (base === "hook.md" || base.endsWith(".hook.md") || base.endsWith(".hook.sh") || base.endsWith(".hook.js")) return "hook";
  if (base === "plugin.md" || base === "plugin.json") return "plugin";
  if (base === "mcp.md" || base === "mcp.json") return "mcp_server";
  return "skill";
}

function normalizeInvocationMode(value) {
  if (!value || typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "user" || normalized === "user_invoked" || normalized === "human") return "user_invoked";
  if (normalized === "model" || normalized === "model_invoked" || normalized === "agent" || normalized === "reflex" || normalized === "reflexive") return "model_invoked";
  if (normalized === "hybrid" || normalized === "both") return "hybrid";
  if (normalized === "unspecified") return "unspecified";
  return undefined;
}

function inferInvocationMode({ declaredMode, description, content }) {
  const normalized = normalizeInvocationMode(declaredMode);
  if (normalized) return normalized;
  const text = `${description ?? ""} ${content ?? ""}`;
  if (/\b(?:user[- ]invoked|invoked by user|human[- ]invoked)\b/i.test(text)) {
    return "user_invoked";
  }
  if (/\b(?:model[- ]invoked|invoked by model|agent[- ]invoked|reflexes?|reflexive)\b/i.test(text)) {
    return "model_invoked";
  }
  return "unspecified";
}

function isArtifactFile(relativePath) {
  const base = path.basename(relativePath).toLowerCase();
  return (
    base === "skill.md" ||
    base === "rule.md" ||
    base.endsWith(".rule.md") ||
    base === "hook.md" ||
    base.endsWith(".hook.md") ||
    base.endsWith(".hook.sh") ||
    base.endsWith(".hook.js") ||
    base === "plugin.md" ||
    base === "plugin.json" ||
    base === "mcp.md" ||
    base === "mcp.json"
  );
}

function parseArtifactManifest(content, artifactPath) {
  const base = path.basename(artifactPath).toLowerCase();
  if (base.endsWith(".json")) {
    const parsed = JSON.parse(content);
    if (!parsed.name) throw new Error(`Missing name in manifest: ${artifactPath}`);
    const declaredType = parsed.artifact_type ?? parsed.type;
    const artifact_type = declaredType && ARTIFACT_TYPES.has(declaredType)
      ? declaredType
      : (base === "plugin.json" ? "plugin" : base === "mcp.json" ? "mcp_server" : "skill");
    const declaredMode = parsed.invocation_mode ?? parsed.invoker ?? parsed.invoked_by;
    const invocation_mode = inferInvocationMode({ declaredMode, description: parsed.description, content });
    return {
      name: parsed.name,
      description: parsed.description ?? null,
      artifact_type,
      invocation_mode,
    };
  }
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new Error(`Missing YAML frontmatter: ${artifactPath}`);
  }
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!field) continue;
    metadata[field[1]] = field[2].trim().replace(/^['"]|['"]$/g, "");
  }
  if (!metadata.name) {
    throw new Error(`Missing skill name in frontmatter: ${artifactPath}`);
  }
  const declaredType = metadata.artifact_type ?? metadata.type;
  const artifact_type = declaredType && ARTIFACT_TYPES.has(declaredType)
    ? declaredType
    : inferArtifactType(artifactPath);
  const declaredMode = metadata.invocation_mode ?? metadata.invoker ?? metadata.invoked_by;
  const invocation_mode = inferInvocationMode({ declaredMode, description: metadata.description, content });
  return {
    name: metadata.name,
    description: metadata.description ?? null,
    artifact_type,
    invocation_mode,
  };
}

function parseSkillMarkdown(content, skillPath) {
  return parseArtifactManifest(content, skillPath);
}

async function discoverSkills(sourcePath) {
  const found = [];
  for (const relativePath of await listFiles(sourcePath)) {
    if (!isArtifactFile(relativePath)) continue;
    const absolutePath = path.join(sourcePath, relativePath);
    const metadata = parseArtifactManifest(await fs.readFile(absolutePath, "utf8"), absolutePath);
    found.push({
      ...metadata,
      relative_path: path.dirname(relativePath).replaceAll("\\", "/") || ".",
      root_path: path.dirname(absolutePath),
    });
  }
  return found.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
}

async function inspectLocalSource({ sourcePath }) {
  const resolvedSourcePath = path.resolve(sourcePath);
  const sourceStats = await fs.stat(resolvedSourcePath);
  if (!sourceStats.isDirectory()) throw new Error(`Source must be a directory: ${resolvedSourcePath}`);
  const artifactFiles = (await listFiles(resolvedSourcePath))
    .filter(isArtifactFile)
    .sort((left, right) => left.localeCompare(right));
  const skills = [];
  const issues = [];
  for (const relativePath of artifactFiles) {
    const absolutePath = path.join(resolvedSourcePath, relativePath);
    try {
      const metadata = parseArtifactManifest(await fs.readFile(absolutePath, "utf8"), absolutePath);
      skills.push({
        ...metadata,
        relative_path: path.dirname(relativePath).replaceAll("\\", "/") || ".",
        root_path: path.dirname(absolutePath),
      });
    } catch (error) {
      issues.push({ path: relativePath.replaceAll("\\", "/"), message: error.message });
    }
  }
  if (artifactFiles.length === 0) issues.push({ path: ".", message: "No supported artifacts (SKILL.md, RULE.md, HOOK.md, PLUGIN.md, MCP.md) were found in source" });
  return {
    kind: "local",
    locator: resolvedSourcePath,
    source_digest: await digestDirectory(resolvedSourcePath),
    skill_count: skills.length,
    skills,
    issues,
    importable: issues.length === 0 && skills.length > 0,
  };
}

function registryFile(registryRoot) {
  return path.join(registryRoot, "registry.json");
}

function blankRegistry() {
  return {
    schema_version: REGISTRY_SCHEMA_VERSION,
    sources: [],
    revisions: [],
    lineages: [],
    skills: [],
  };
}

function lineageId(artifactKey) {
  return `lineage_${sha256(artifactKey).slice(0, 20)}`;
}

function normalizeRegistry(registry) {
  if (registry.schema_version !== 1 && registry.schema_version !== REGISTRY_SCHEMA_VERSION) {
    throw new Error(`Unsupported registry schema: ${registry.schema_version}`);
  }
  registry.lineages ??= [];
  for (const skill of registry.skills ?? []) {
    skill.artifact_type ??= "skill";
    skill.artifact_key ??= `${skill.source_id}:${skill.source_relative_path}`;
    skill.lineage_id ??= lineageId(skill.artifact_key);
    if (!registry.lineages.some((lineage) => lineage.id === skill.lineage_id)) {
      registry.lineages.push({
        id: skill.lineage_id,
        source_id: skill.source_id,
        artifact_key: skill.artifact_key,
        artifact_type: skill.artifact_type,
        source_relative_path: skill.source_relative_path,
        skill_name: skill.skill_name,
        created_at: skill.imported_at,
      });
    } else {
      const lineage = registry.lineages.find((item) => item.id === skill.lineage_id);
      if (lineage) lineage.artifact_type ??= skill.artifact_type;
    }
  }
  registry.schema_version = REGISTRY_SCHEMA_VERSION;
  return registry;
}

async function loadRegistry(registryRoot) {
  const file = registryFile(registryRoot);
  if (!await pathExists(file)) return blankRegistry();
  return normalizeRegistry(JSON.parse(await fs.readFile(file, "utf8")));
}

async function saveRegistry(registryRoot, registry) {
  await fs.mkdir(registryRoot, { recursive: true });
  const temporaryFile = `${registryFile(registryRoot)}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  await fs.rename(temporaryFile, registryFile(registryRoot));
}

function defaultRegistryRoot(workspacePath = process.cwd()) {
  return path.join(workspacePath, ".skills-platform", "registry");
}

async function importLocalSource({ registryRoot, sourcePath, selectedSkillNames = [], source = null }) {
  const inspection = await inspectLocalSource({ sourcePath });
  if (!inspection.importable) {
    throw new Error(`Source inspection failed: ${inspection.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }
  const resolvedSourcePath = inspection.locator;
  const discovered = inspection.skills;
  const selected = selectedSkillNames.length === 0
    ? discovered
    : discovered.filter((skill) => selectedSkillNames.includes(skill.name));
  const missingNames = selectedSkillNames.filter((name) => !selected.some((skill) => skill.name === name));
  if (missingNames.length > 0) throw new Error(`Selected skills were not found: ${missingNames.join(", ")}`);
  if (selected.length === 0) throw new Error("No SKILL.md artifacts were found in source");

  const registry = await loadRegistry(registryRoot);
  const locator = source?.locator ?? resolvedSourcePath;
  const kind = source?.kind ?? "local";
  const id = sourceId(locator);
  const revisionDigest = inspection.source_digest;
  const revisionId = `revision_${sha256(`${id}:${revisionDigest}`).slice(0, 24)}`;
  const importedAt = new Date().toISOString();

  if (!registry.sources.some((source) => source.id === id)) {
    registry.sources.push({
      id,
      kind,
      locator,
      requested_ref: source?.requested_ref ?? null,
      created_at: importedAt,
    });
  }
  if (!registry.revisions.some((revision) => revision.id === revisionId)) {
    registry.revisions.push({
      id: revisionId,
      source_id: id,
      resolved_revision: source?.resolved_revision ?? revisionDigest,
      content_digest: revisionDigest,
      fetched_at: importedAt,
      review_state: "imported",
    });
  }

  const artifactsRoot = path.join(registryRoot, "revisions", revisionId, "artifacts");
  const imported = [];
  for (const skill of selected) {
    const artifactDigest = await digestDirectory(skill.root_path);
    // The ID includes the source revision so every delivery plan can pin the
    // exact immutable instructions it was reviewed against.
    const artifactId = `skill_${sha256(`${id}:${revisionId}:${skill.relative_path}`).slice(0, 20)}`;
    const artifactPath = path.join(artifactsRoot, `${slug(skill.name)}-${artifactDigest.slice(0, 10)}`);
    if (!await pathExists(artifactPath)) {
      await fs.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.cp(skill.root_path, artifactPath, { recursive: true, force: false, errorOnExist: true });
    }
    const existing = registry.skills.find((record) => record.id === artifactId && record.source_revision_id === revisionId);
    const record = existing ? Object.assign(existing, {
      invocation_mode: skill.invocation_mode ?? existing.invocation_mode ?? "unspecified",
      artifact_type: skill.artifact_type ?? existing.artifact_type ?? "skill",
    }) : {
      id: artifactId,
      source_id: id,
      source_revision_id: revisionId,
      skill_name: skill.name,
      artifact_type: skill.artifact_type ?? "skill",
      invocation_mode: skill.invocation_mode ?? "unspecified",
      source_relative_path: skill.relative_path,
      artifact_key: `${id}:${skill.relative_path}`,
      lineage_id: lineageId(`${id}:${skill.relative_path}`),
      description: skill.description,
      content_digest: artifactDigest,
      canonical_path: artifactPath,
      imported_at: importedAt,
      review_state: "imported",
    };
    if (!registry.lineages.some((lineage) => lineage.id === record.lineage_id)) {
      registry.lineages.push({
        id: record.lineage_id,
        source_id: id,
        artifact_key: record.artifact_key,
        artifact_type: record.artifact_type ?? "skill",
        invocation_mode: record.invocation_mode ?? "unspecified",
        source_relative_path: skill.relative_path,
        skill_name: skill.name,
        created_at: importedAt,
      });
    } else {
      const lineage = registry.lineages.find((item) => item.id === record.lineage_id);
      if (lineage) {
        lineage.artifact_type = record.artifact_type ?? lineage.artifact_type;
        lineage.invocation_mode = record.invocation_mode ?? lineage.invocation_mode;
      }
    }
    if (!existing) registry.skills.push(record);
    imported.push(record);
  }

  await saveRegistry(registryRoot, registry);
  return { source_id: id, source_revision_id: revisionId, skills: imported };
}

function requireGitLocator(value) {
  if (typeof value !== "string" || value.trim() === "") throw new Error("Git repository locator is required");
  return value.trim();
}

async function inspectGitSource({ repository, ref = "HEAD" }) {
  repository = requireGitLocator(repository);
  if (typeof ref !== "string" || ref.trim() === "") throw new Error("Git ref is required");
  let stdout;
  try {
    ({ stdout } = await execFileAsync("git", ["ls-remote", repository, ref.trim()], { windowsHide: true, maxBuffer: 1024 * 1024 }));
  } catch (error) {
    throw new Error(`Could not inspect Git source: ${error.stderr?.trim() || error.message}`);
  }
  const line = stdout.split(/\r?\n/).find(Boolean);
  const revision = line?.split(/\s+/)[0];
  if (!revision || !/^[0-9a-f]{40,64}$/i.test(revision)) throw new Error(`Git ref was not found: ${ref}`);
  return { kind: "git", locator: repository, requested_ref: ref.trim(), resolved_revision: revision.toLowerCase() };
}

async function importGitSource({ registryRoot, repository, ref = "HEAD", selectedSkillNames = [] }) {
  const inspection = await inspectGitSource({ repository, ref });
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skills-platform-git-"));
  try {
    await execFileAsync("git", ["clone", "--no-checkout", "--depth", "1", "--no-tags", inspection.locator, temporaryRoot], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    await execFileAsync("git", ["-C", temporaryRoot, "checkout", "--detach", inspection.resolved_revision], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return await importLocalSource({
      registryRoot,
      sourcePath: temporaryRoot,
      selectedSkillNames,
      source: inspection,
    });
  } catch (error) {
    throw new Error(`Could not import Git source: ${error.stderr?.trim() || error.message}`);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function listSourceUpdateCandidates(registryRoot) {
  const registry = await loadRegistry(registryRoot);
  const candidates = [];
  for (const source of registry.sources.filter((item) => item.kind === "git" && item.requested_ref)) {
    const current = registry.revisions
      .filter((revision) => revision.source_id === source.id)
      .sort((left, right) => right.fetched_at.localeCompare(left.fetched_at))[0] ?? null;
    const inspected = await inspectGitSource({ repository: source.locator, ref: source.requested_ref });
    candidates.push({
      source_id: source.id,
      locator: source.locator,
      requested_ref: source.requested_ref,
      current_revision_id: current?.id ?? null,
      current_resolved_revision: current?.resolved_revision ?? null,
      candidate_resolved_revision: inspected.resolved_revision,
      update_available: current?.resolved_revision !== inspected.resolved_revision,
    });
  }
  return candidates.sort((left, right) => left.locator.localeCompare(right.locator));
}

async function listRegistrySkills(registryRoot) {
  const registry = await loadRegistry(registryRoot);
  return registry.skills.slice().sort((left, right) => left.skill_name.localeCompare(right.skill_name));
}

function latestSkillsByArtifact(skills) {
  const latest = new Map();
  for (const skill of skills) {
    const key = skill.artifact_key ?? `${skill.source_id}:${skill.source_relative_path}`;
    const current = latest.get(key);
    if (!current || current.imported_at.localeCompare(skill.imported_at) <= 0) latest.set(key, skill);
  }
  return [...latest.values()].sort((left, right) => left.skill_name.localeCompare(right.skill_name));
}

async function getRegistrySkills(registryRoot, skillIds) {
  const registry = await loadRegistry(registryRoot);
  const records = skillIds.map((id) => registry.skills.find((skill) => skill.id === id)).filter(Boolean);
  const missing = skillIds.filter((id) => !records.some((record) => record.id === id));
  if (missing.length > 0) throw new Error(`Registry skills not found: ${missing.join(", ")}`);
  return records;
}

async function listSkillLineages(registryRoot) {
  const registry = await loadRegistry(registryRoot);
  return registry.lineages.slice().sort((left, right) => left.skill_name.localeCompare(right.skill_name));
}

async function getSkillLineage(registryRoot, lineageIdValue) {
  const registry = await loadRegistry(registryRoot);
  const lineage = registry.lineages.find((item) => item.id === lineageIdValue);
  if (!lineage) throw new Error(`Skill lineage not found: ${lineageIdValue}`);
  return lineage;
}

async function getSourceRevision(registryRoot, revisionId) {
  const registry = await loadRegistry(registryRoot);
  const revision = registry.revisions.find((item) => item.id === revisionId);
  if (!revision) throw new Error(`Source revision not found: ${revisionId}`);
  return revision;
}

async function listSkillRevisions({ registryRoot, lineageId: lineageIdValue }) {
  await getSkillLineage(registryRoot, lineageIdValue);
  const registry = await loadRegistry(registryRoot);
  const fetchedAtByRevisionId = new Map(registry.revisions.map((revision) => [revision.id, revision.fetched_at]));
  return registry.skills
    .filter((skill) => skill.lineage_id === lineageIdValue)
    .slice()
    .sort((left, right) => (fetchedAtByRevisionId.get(left.source_revision_id) ?? left.imported_at)
      .localeCompare(fetchedAtByRevisionId.get(right.source_revision_id) ?? right.imported_at));
}

function changedLines(leftContent, rightContent) {
  const left = leftContent.split(/\r?\n/);
  const right = rightContent.split(/\r?\n/);
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      matrix[leftIndex][rightIndex] = left[leftIndex] === right[rightIndex]
        ? matrix[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(matrix[leftIndex + 1][rightIndex], matrix[leftIndex][rightIndex + 1]);
    }
  }
  const removed = [];
  const added = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    if (leftIndex < left.length && rightIndex < right.length && left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
    } else if (rightIndex < right.length && (leftIndex === left.length || matrix[leftIndex][rightIndex + 1] >= matrix[leftIndex + 1][rightIndex])) {
      added.push({ line: rightIndex + 1, content: right[rightIndex] });
      rightIndex += 1;
    } else {
      removed.push({ line: leftIndex + 1, content: left[leftIndex] });
      leftIndex += 1;
    }
  }
  return { added, removed };
}

async function readPrimaryManifest(canonicalPath) {
  const candidates = [
    "SKILL.md", "RULE.md", "HOOK.md", "PLUGIN.md", "plugin.json", "MCP.md", "mcp.json",
    "skill.md", "rule.md", "hook.md", "plugin.md", "mcp.md",
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(path.join(canonicalPath, candidate), "utf8");
    } catch {}
  }
  return "";
}

async function diffSkillRevisions({ registryRoot, lineageId: lineageIdValue, leftRevisionId, rightRevisionId }) {
  const revisions = await listSkillRevisions({ registryRoot, lineageId: lineageIdValue });
  const left = revisions.find((skill) => skill.source_revision_id === leftRevisionId);
  const right = revisions.find((skill) => skill.source_revision_id === rightRevisionId);
  if (!left) throw new Error(`Skill revision not found for lineage: ${lineageIdValue}@${leftRevisionId}`);
  if (!right) throw new Error(`Skill revision not found for lineage: ${lineageIdValue}@${rightRevisionId}`);
  const [leftContent, rightContent] = await Promise.all([
    readPrimaryManifest(left.canonical_path),
    readPrimaryManifest(right.canonical_path),
  ]);
  const diff = changedLines(leftContent, rightContent);
  return {
    lineage_id: lineageIdValue,
    left: { registry_skill_id: left.id, source_revision_id: left.source_revision_id, content_digest: left.content_digest },
    right: { registry_skill_id: right.id, source_revision_id: right.source_revision_id, content_digest: right.content_digest },
    changed: left.content_digest !== right.content_digest,
    skill_markdown: diff,
  };
}

module.exports = {
  defaultRegistryRoot,
  discoverSkills,
  diffSkillRevisions,
  getRegistrySkills,
  getSourceRevision,
  importGitSource,
  importLocalSource,
  inspectGitSource,
  inspectLocalSource,
  getSkillLineage,
  latestSkillsByArtifact,
  listRegistrySkills,
  listSourceUpdateCandidates,
  listSkillRevisions,
  listSkillLineages,
  loadRegistry,
  parseSkillMarkdown,
};
