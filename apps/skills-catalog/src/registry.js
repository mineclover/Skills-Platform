const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { digestDirectory, listFiles } = require("../../../packages/skill-contracts/src");

const REGISTRY_SCHEMA_VERSION = 2;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill";
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

function parseSkillMarkdown(content, skillPath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new Error(`Missing YAML frontmatter: ${skillPath}`);
  }
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!field) continue;
    metadata[field[1]] = field[2].trim().replace(/^['"]|['"]$/g, "");
  }
  if (!metadata.name) {
    throw new Error(`Missing skill name in frontmatter: ${skillPath}`);
  }
  return { name: metadata.name, description: metadata.description ?? null };
}

async function discoverSkills(sourcePath) {
  const found = [];
  for (const relativePath of await listFiles(sourcePath)) {
    if (path.basename(relativePath).toLowerCase() !== "skill.md") continue;
    const absolutePath = path.join(sourcePath, relativePath);
    const metadata = parseSkillMarkdown(await fs.readFile(absolutePath, "utf8"), absolutePath);
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
  const skillFiles = (await listFiles(resolvedSourcePath))
    .filter((relativePath) => path.basename(relativePath).toLowerCase() === "skill.md")
    .sort((left, right) => left.localeCompare(right));
  const skills = [];
  const issues = [];
  for (const relativePath of skillFiles) {
    const absolutePath = path.join(resolvedSourcePath, relativePath);
    try {
      const metadata = parseSkillMarkdown(await fs.readFile(absolutePath, "utf8"), absolutePath);
      skills.push({
        ...metadata,
        relative_path: path.dirname(relativePath).replaceAll("\\", "/") || ".",
        root_path: path.dirname(absolutePath),
      });
    } catch (error) {
      issues.push({ path: relativePath.replaceAll("\\", "/"), message: error.message });
    }
  }
  if (skillFiles.length === 0) issues.push({ path: ".", message: "No SKILL.md artifacts were found in source" });
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
    skill.artifact_key ??= `${skill.source_id}:${skill.source_relative_path}`;
    skill.lineage_id ??= lineageId(skill.artifact_key);
    if (!registry.lineages.some((lineage) => lineage.id === skill.lineage_id)) {
      registry.lineages.push({
        id: skill.lineage_id,
        source_id: skill.source_id,
        artifact_key: skill.artifact_key,
        source_relative_path: skill.source_relative_path,
        skill_name: skill.skill_name,
        created_at: skill.imported_at,
      });
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

async function importLocalSource({ registryRoot, sourcePath, selectedSkillNames = [] }) {
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
  const locator = resolvedSourcePath;
  const id = sourceId(locator);
  const revisionDigest = inspection.source_digest;
  const revisionId = `revision_${sha256(`${id}:${revisionDigest}`).slice(0, 24)}`;
  const importedAt = new Date().toISOString();

  if (!registry.sources.some((source) => source.id === id)) {
    registry.sources.push({ id, kind: "local", locator, created_at: importedAt });
  }
  if (!registry.revisions.some((revision) => revision.id === revisionId)) {
    registry.revisions.push({
      id: revisionId,
      source_id: id,
      resolved_revision: revisionDigest,
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
    const record = existing ?? {
      id: artifactId,
      source_id: id,
      source_revision_id: revisionId,
      skill_name: skill.name,
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
        source_relative_path: skill.relative_path,
        skill_name: skill.name,
        created_at: importedAt,
      });
    }
    if (!existing) registry.skills.push(record);
    imported.push(record);
  }

  await saveRegistry(registryRoot, registry);
  return { source_id: id, source_revision_id: revisionId, skills: imported };
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

async function diffSkillRevisions({ registryRoot, lineageId: lineageIdValue, leftRevisionId, rightRevisionId }) {
  const revisions = await listSkillRevisions({ registryRoot, lineageId: lineageIdValue });
  const left = revisions.find((skill) => skill.source_revision_id === leftRevisionId);
  const right = revisions.find((skill) => skill.source_revision_id === rightRevisionId);
  if (!left) throw new Error(`Skill revision not found for lineage: ${lineageIdValue}@${leftRevisionId}`);
  if (!right) throw new Error(`Skill revision not found for lineage: ${lineageIdValue}@${rightRevisionId}`);
  const [leftContent, rightContent] = await Promise.all([
    fs.readFile(path.join(left.canonical_path, "SKILL.md"), "utf8"),
    fs.readFile(path.join(right.canonical_path, "SKILL.md"), "utf8"),
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
  importLocalSource,
  inspectLocalSource,
  getSkillLineage,
  latestSkillsByArtifact,
  listRegistrySkills,
  listSkillRevisions,
  listSkillLineages,
  parseSkillMarkdown,
};
