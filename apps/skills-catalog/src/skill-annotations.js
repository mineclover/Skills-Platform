const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { digestDirectory, listFiles, validateSkillAuthoringAnalysis } = require("@skills-platform/contracts");
const { getSkillLineage, listSkillRevisions } = require("./registry");
const {
  authoringAnalysisPayload,
  inspectSkillPackage,
  parseFrontmatter: parseAuthoringFrontmatter,
  rulesetFingerprint,
} = require("./skill-authoring");

const ANNOTATION_SCHEMA_VERSION = 1;
const EXECUTION_EFFECT = "none";
const STATIC_ANALYZER_ID = "skills-platform-static";
const STATIC_ANALYZER_VERSION = "3";

const ANNOTATION_KINDS = new Set([
  "plain_language",
  "rationale",
  "example",
  "warning",
  "glossary",
]);
const ANNOTATION_ORIGINS = new Set(["user", "generated"]);
const FORBIDDEN_CONTROL_FIELDS = new Set([
  "inject_into_prompt",
  "injectIntoPrompt",
  "enabled",
  "priority",
  "desired_state",
  "desiredState",
  "execution_effect",
  "executionEffect",
]);
const EDITABLE_ANNOTATION_FIELDS = new Set(["kind", "title", "body", "locale", "anchor"]);
const PRIMARY_MANIFEST_CANDIDATES = [
  "SKILL.md",
  "RULE.md",
  "HOOK.md",
  "PLUGIN.md",
  "plugin.json",
  "MCP.md",
  "mcp.json",
  "skill.md",
  "rule.md",
  "hook.md",
  "plugin.md",
  "mcp.md",
];

// Serializes writes within one Catalog process. Optimistic record versions still
// protect clients from editing a stale annotation snapshot.
const writeTails = new Map();

function timestamp(now = new Date()) {
  const value = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(value.getTime())) throw new Error("now must be a valid date");
  return value.toISOString();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value.trim();
}

function optionalText(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  return normalized || null;
}

function validateLineageId(lineageId) {
  lineageId = requiredText(lineageId, "Lineage id");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(lineageId)) {
    throw new Error("Lineage id contains unsupported path characters");
  }
  return lineageId;
}

function annotationDirectory(catalogRoot) {
  return path.join(path.resolve(requiredText(catalogRoot, "Catalog root")), "annotations", "v1");
}

function annotationFile(catalogRoot, lineageId) {
  return path.join(annotationDirectory(catalogRoot), `${validateLineageId(lineageId)}.json`);
}

function blankSidecar(lineageId) {
  return {
    schema_version: ANNOTATION_SCHEMA_VERSION,
    lineage_id: validateLineageId(lineageId),
    store_version: 0,
    annotations: [],
    analyses: [],
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertNoForbiddenControls(value, location = "annotation", seen = new Set()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenControls(item, `${location}[${index}]`, seen));
    return;
  }
  for (const [field, child] of Object.entries(value)) {
    if (FORBIDDEN_CONTROL_FIELDS.has(field)) {
      if (field === "execution_effect" && child === "none" && /^stored\.analyses\[\d+\]\.authoring$/.test(location)) {
        continue;
      }
      throw new Error(`${location}.${field} is an execution control field and is not allowed`);
    }
    assertNoForbiddenControls(child, `${location}.${field}`, seen);
  }
}

function normalizeSidecar(parsed, lineageId) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Skill annotation sidecar must be a JSON object");
  }
  if (parsed.schema_version !== ANNOTATION_SCHEMA_VERSION) {
    throw new Error(`Unsupported skill annotation schema: ${parsed.schema_version}`);
  }
  if (parsed.lineage_id !== lineageId) throw new Error("Skill annotation sidecar lineage does not match its file name");
  if (!Array.isArray(parsed.annotations) || !Array.isArray(parsed.analyses)) {
    throw new Error("Skill annotation sidecar collections must be arrays");
  }
  if (!Number.isInteger(parsed.store_version) || parsed.store_version < 0) {
    throw new Error("Skill annotation sidecar store_version must be a non-negative integer");
  }
  parsed.annotations.forEach((annotation, index) => {
    if (!annotation || typeof annotation !== "object" || Array.isArray(annotation)) {
      throw new Error(`Stored annotation ${index} must be an object`);
    }
    assertNoForbiddenControls(annotation, `stored.annotations[${index}]`);
    if (annotation.lineage_id !== lineageId) throw new Error(`Stored annotation ${index} has the wrong lineage`);
    if (!Number.isInteger(annotation.version) || annotation.version < 1 || !Array.isArray(annotation.history)) {
      throw new Error(`Stored annotation ${index} has invalid version history`);
    }
  });
  parsed.analyses.forEach((analysis, index) => {
    if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
      throw new Error(`Stored analysis ${index} must be an object`);
    }
    assertNoForbiddenControls(analysis, `stored.analyses[${index}]`);
    if (analysis.lineage_id !== lineageId) throw new Error(`Stored analysis ${index} has the wrong lineage`);
    if (analysis.authoring) {
      const validation = validateSkillAuthoringAnalysis(analysis.authoring);
      if (!validation.valid) throw new Error(`Stored analysis ${index} has invalid authoring data`);
    }
  });
  return {
    ...parsed,
    annotations: parsed.annotations.map((item) => clone(item)),
    analyses: parsed.analyses.map((item) => clone(item)),
  };
}

async function loadSkillAnnotationSidecar({ catalogRoot, lineageId }) {
  lineageId = validateLineageId(lineageId);
  try {
    const parsed = JSON.parse(await fs.readFile(annotationFile(catalogRoot, lineageId), "utf8"));
    return normalizeSidecar(parsed, lineageId);
  } catch (error) {
    if (error.code === "ENOENT") return blankSidecar(lineageId);
    throw error;
  }
}

async function atomicSaveSidecar(catalogRoot, sidecar) {
  const file = annotationFile(catalogRoot, sidecar.lineage_id);
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let handle = null;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(sidecar, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, file);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function withSidecarWrite(catalogRoot, lineageId, mutation) {
  const file = annotationFile(catalogRoot, lineageId);
  const prior = writeTails.get(file) ?? Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const tail = prior.then(() => gate);
  writeTails.set(file, tail);
  await prior;
  try {
    const sidecar = await loadSkillAnnotationSidecar({ catalogRoot, lineageId });
    const result = await mutation(sidecar);
    if (!result || result.changed !== false) {
      sidecar.store_version += 1;
      sidecar.updated_at = timestamp(result?.now);
      await atomicSaveSidecar(catalogRoot, sidecar);
    }
    return result?.value;
  } finally {
    release();
    if (writeTails.get(file) === tail) writeTails.delete(file);
  }
}

function presentAnnotation(annotation) {
  return { ...clone(annotation), execution_effect: EXECUTION_EFFECT };
}

function presentAnalysis(analysis, status = {}) {
  return { ...clone(analysis), ...status, execution_effect: EXECUTION_EFFECT };
}

function normalizeLocale(locale) {
  if (locale === undefined || locale === null || locale === "") return "und";
  locale = requiredText(locale, "Annotation locale");
  if (locale !== "und" && !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(locale)) {
    throw new Error("Annotation locale must be a BCP 47-style language tag");
  }
  return locale;
}

function normalizeKind(kind = "plain_language") {
  if (!ANNOTATION_KINDS.has(kind)) throw new Error("Annotation kind is not valid");
  return kind;
}

function normalizeOrigin(origin = "user") {
  if (!ANNOTATION_ORIGINS.has(origin)) throw new Error("Annotation origin is not valid");
  return origin;
}

function safeRelativePath(value, field = "Anchor relative manifest path") {
  value = requiredText(value, field).replaceAll("\\", "/");
  if (value.includes("\0") || /^[A-Za-z]:/.test(value) || value.startsWith("/")) {
    throw new Error(`${field} must be a source-relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${field} must remain inside the canonical artifact`);
  }
  return normalized;
}

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readCanonicalFile(skill, relativePath) {
  const canonicalRoot = await fs.realpath(skill.canonical_path);
  const candidate = path.join(canonicalRoot, ...relativePath.split("/"));
  const realCandidate = await fs.realpath(candidate);
  if (!isWithin(realCandidate, canonicalRoot)) throw new Error("Anchor target escapes the canonical artifact");
  const content = await fs.readFile(realCandidate, "utf8");
  return content.replace(/\r\n?/g, "\n");
}

async function normalizeAnchor(anchor, skill) {
  if (anchor === undefined || anchor === null) return null;
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) throw new Error("Annotation anchor must be an object");
  assertNoForbiddenControls(anchor, "annotation.anchor");
  if (!skill) throw new Error("A revision-pinned annotation is required for a content anchor");
  const relativeManifestPath = safeRelativePath(
    anchor.relative_manifest_path ?? anchor.relativeManifestPath,
  );
  const startLine = Number(anchor.start_line ?? anchor.startLine);
  const endLine = Number(anchor.end_line ?? anchor.endLine ?? startLine);
  if (!Number.isInteger(startLine) || startLine < 1) throw new Error("Anchor start line must be a positive integer");
  if (!Number.isInteger(endLine) || endLine < startLine) throw new Error("Anchor end line must not precede its start line");
  const content = await readCanonicalFile(skill, relativeManifestPath);
  const lines = content.split("\n");
  if (endLine > lines.length) throw new Error("Annotation anchor exceeds the canonical file length");
  const selectedHash = sha256(lines.slice(startLine - 1, endLine).join("\n"));
  const suppliedHash = anchor.selected_text_sha256 ?? anchor.selectedTextSha256;
  if (suppliedHash !== undefined && suppliedHash !== selectedHash) {
    throw new Error("Annotation anchor text digest does not match the canonical revision");
  }
  return {
    relative_manifest_path: relativeManifestPath,
    start_line: startLine,
    end_line: endLine,
    selected_text_sha256: selectedHash,
  };
}

async function revisionSkill(registryRoot, lineageId, sourceRevisionId) {
  registryRoot = requiredText(registryRoot, "Registry root");
  await getSkillLineage(registryRoot, lineageId);
  if (!sourceRevisionId) return null;
  const revisions = await listSkillRevisions({ registryRoot, lineageId });
  const skill = revisions.find((item) => item.source_revision_id === sourceRevisionId);
  if (!skill) throw new Error(`Skill revision not found for lineage: ${lineageId}@${sourceRevisionId}`);
  return skill;
}

async function createSkillAnnotation(options) {
  assertNoForbiddenControls(options, "annotation");
  const {
    catalogRoot,
    registryRoot,
    lineageId: rawLineageId,
    sourceRevisionId = null,
    kind = "plain_language",
    title = null,
    body,
    locale = "und",
    anchor = null,
    author = "local",
    origin = "user",
    now,
  } = options;
  const lineageId = validateLineageId(rawLineageId);
  const skill = await revisionSkill(registryRoot, lineageId, sourceRevisionId);
  if (anchor && !sourceRevisionId) throw new Error("sourceRevisionId is required for an anchored annotation");
  const createdAt = timestamp(now);
  const record = {
    id: `annotation_${crypto.randomUUID()}`,
    lineage_id: lineageId,
    source_revision_id: sourceRevisionId,
    kind: normalizeKind(kind),
    title: optionalText(title, "Annotation title"),
    body: requiredText(body, "Annotation body"),
    locale: normalizeLocale(locale),
    anchor: await normalizeAnchor(anchor, skill),
    author: optionalText(author, "Annotation author") ?? "local",
    origin: normalizeOrigin(origin),
    version: 1,
    history: [],
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
    deleted_by: null,
  };
  return withSidecarWrite(catalogRoot, lineageId, async (sidecar) => {
    sidecar.annotations.push(record);
    return { value: presentAnnotation(record), now };
  });
}

function versionConflict(annotation, expectedVersion) {
  const error = new Error(
    `Skill annotation version conflict: expected ${expectedVersion}, current ${annotation.version}`,
  );
  error.code = "ANNOTATION_VERSION_CONFLICT";
  error.statusCode = 409;
  return error;
}

function requireExpectedVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) throw new Error("expectedVersion must be a positive integer");
  return version;
}

function findAnnotation(sidecar, annotationId) {
  annotationId = requiredText(annotationId, "Annotation id");
  const annotation = sidecar.annotations.find((item) => item.id === annotationId);
  if (!annotation) {
    const error = new Error(`Skill annotation not found: ${annotationId}`);
    error.code = "ANNOTATION_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  return annotation;
}

function historySnapshot(annotation, change, changedAt, changedBy) {
  return {
    version: annotation.version,
    kind: annotation.kind,
    title: annotation.title,
    body: annotation.body,
    locale: annotation.locale,
    anchor: clone(annotation.anchor),
    deleted_at: annotation.deleted_at,
    deleted_by: annotation.deleted_by,
    change,
    changed_at: changedAt,
    changed_by: changedBy,
  };
}

async function updateSkillAnnotation(options) {
  assertNoForbiddenControls(options, "annotation");
  const {
    catalogRoot,
    registryRoot,
    lineageId: rawLineageId,
    annotationId,
    expectedVersion: rawExpectedVersion,
    patch,
    author = "local",
    now,
  } = options;
  const lineageId = validateLineageId(rawLineageId);
  const expectedVersion = requireExpectedVersion(rawExpectedVersion);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Annotation patch must be an object");
  assertNoForbiddenControls(patch, "annotation.patch");
  const fields = Object.keys(patch);
  if (fields.length === 0) throw new Error("At least one annotation field is required");
  for (const field of fields) {
    if (!EDITABLE_ANNOTATION_FIELDS.has(field)) throw new Error(`Annotation field is not editable: ${field}`);
  }
  return withSidecarWrite(catalogRoot, lineageId, async (sidecar) => {
    const annotation = findAnnotation(sidecar, annotationId);
    if (annotation.version !== expectedVersion) throw versionConflict(annotation, expectedVersion);
    if (annotation.deleted_at) throw new Error("Deleted skill annotations must be restored before editing");
    let skill = null;
    if (Object.prototype.hasOwnProperty.call(patch, "anchor") && patch.anchor) {
      if (!annotation.source_revision_id) throw new Error("Anchored annotations must be revision-pinned");
      skill = await revisionSkill(registryRoot, lineageId, annotation.source_revision_id);
    }
    const changedAt = timestamp(now);
    annotation.history.push(historySnapshot(annotation, "update", changedAt, optionalText(author, "Annotation author") ?? "local"));
    if (Object.prototype.hasOwnProperty.call(patch, "kind")) annotation.kind = normalizeKind(patch.kind);
    if (Object.prototype.hasOwnProperty.call(patch, "title")) annotation.title = optionalText(patch.title, "Annotation title");
    if (Object.prototype.hasOwnProperty.call(patch, "body")) annotation.body = requiredText(patch.body, "Annotation body");
    if (Object.prototype.hasOwnProperty.call(patch, "locale")) annotation.locale = normalizeLocale(patch.locale);
    if (Object.prototype.hasOwnProperty.call(patch, "anchor")) annotation.anchor = await normalizeAnchor(patch.anchor, skill);
    annotation.version += 1;
    annotation.updated_at = changedAt;
    return { value: presentAnnotation(annotation), now };
  });
}

async function deleteSkillAnnotation(options) {
  assertNoForbiddenControls(options, "annotation");
  const {
    catalogRoot,
    lineageId: rawLineageId,
    annotationId,
    expectedVersion: rawExpectedVersion,
    author = "local",
    now,
  } = options;
  const lineageId = validateLineageId(rawLineageId);
  const expectedVersion = requireExpectedVersion(rawExpectedVersion);
  return withSidecarWrite(catalogRoot, lineageId, async (sidecar) => {
    const annotation = findAnnotation(sidecar, annotationId);
    if (annotation.version !== expectedVersion) throw versionConflict(annotation, expectedVersion);
    if (annotation.deleted_at) return { changed: false, value: presentAnnotation(annotation) };
    const changedAt = timestamp(now);
    const changedBy = optionalText(author, "Annotation author") ?? "local";
    annotation.history.push(historySnapshot(annotation, "delete", changedAt, changedBy));
    annotation.deleted_at = changedAt;
    annotation.deleted_by = changedBy;
    annotation.updated_at = changedAt;
    annotation.version += 1;
    return { value: presentAnnotation(annotation), now };
  });
}

async function restoreSkillAnnotation(options) {
  assertNoForbiddenControls(options, "annotation");
  const {
    catalogRoot,
    lineageId: rawLineageId,
    annotationId,
    expectedVersion: rawExpectedVersion,
    author = "local",
    now,
  } = options;
  const lineageId = validateLineageId(rawLineageId);
  const expectedVersion = requireExpectedVersion(rawExpectedVersion);
  return withSidecarWrite(catalogRoot, lineageId, async (sidecar) => {
    const annotation = findAnnotation(sidecar, annotationId);
    if (annotation.version !== expectedVersion) throw versionConflict(annotation, expectedVersion);
    if (!annotation.deleted_at) return { changed: false, value: presentAnnotation(annotation) };
    const changedAt = timestamp(now);
    const changedBy = optionalText(author, "Annotation author") ?? "local";
    annotation.history.push(historySnapshot(annotation, "restore", changedAt, changedBy));
    annotation.deleted_at = null;
    annotation.deleted_by = null;
    annotation.updated_at = changedAt;
    annotation.version += 1;
    return { value: presentAnnotation(annotation), now };
  });
}

async function getSkillAnnotation({ catalogRoot, lineageId: rawLineageId, annotationId, includeDeleted = false }) {
  const lineageId = validateLineageId(rawLineageId);
  const sidecar = await loadSkillAnnotationSidecar({ catalogRoot, lineageId });
  const annotation = findAnnotation(sidecar, annotationId);
  if (annotation.deleted_at && !includeDeleted) {
    const error = new Error(`Skill annotation not found: ${annotationId}`);
    error.code = "ANNOTATION_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  return presentAnnotation(annotation);
}

async function listSkillAnnotations({
  catalogRoot,
  lineageId: rawLineageId,
  sourceRevisionId,
  kind,
  includeDeleted = false,
} = {}) {
  const lineageId = validateLineageId(rawLineageId);
  if (kind !== undefined) normalizeKind(kind);
  const sidecar = await loadSkillAnnotationSidecar({ catalogRoot, lineageId });
  return sidecar.annotations
    .filter((annotation) => (
      (includeDeleted || !annotation.deleted_at)
      && (sourceRevisionId === undefined || annotation.source_revision_id === sourceRevisionId)
      && (kind === undefined || annotation.kind === kind)
    ))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || left.id.localeCompare(right.id))
    .map(presentAnnotation);
}

async function readPrimaryManifest(skill) {
  for (const relativePath of PRIMARY_MANIFEST_CANDIDATES) {
    try {
      return { relative_path: relativePath, content: await readCanonicalFile(skill, relativePath) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error(`No canonical manifest found for skill revision: ${skill.source_revision_id}`);
}

function parseFrontmatter(content) {
  const parsed = parseAuthoringFrontmatter(content, "SKILL.md");
  const manifest = parsed.manifest;
  return {
    present: Boolean(manifest),
    name: typeof manifest?.name === "string" ? manifest.name : null,
    description: typeof manifest?.description === "string" ? manifest.description : null,
    fields: manifest ? Object.keys(manifest).sort() : [],
  };
}

function markdownLinks(content) {
  const links = [];
  const pattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of content.matchAll(pattern)) links.push(match[1]);
  return [...new Set(links)].sort();
}

function staticAnalysisPayload({ skill, manifest, artifactFiles, analyzerVersion, authoringInspection }) {
  const content = manifest.content;
  const lines = content.split("\n");
  const frontmatter = parseFrontmatter(content);
  const sections = [];
  lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) sections.push({ level: heading[1].length, title: heading[2], line: index + 1 });
  });
  const links = markdownLinks(content);
  const externalReferences = links.filter((target) => /^(?:https?:)?\/\//i.test(target));
  const relativeReferences = links
    .filter((target) => !/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target))
    .map((target) => target.split("#")[0])
    .filter(Boolean)
    .map((target) => target.replaceAll("\\", "/"));
  const executableFiles = artifactFiles
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => /\.(?:sh|bash|zsh|fish|js|mjs|cjs|ts|py|ps1|bat|cmd)$/i.test(file))
    .sort();
  const instructionLineCount = lines.filter((line) => /^\s*(?:\d+[.)]|[-*+])\s+\S/.test(line)).length;
  const fenceCount = lines.filter((line) => /^\s*```/.test(line)).length;
  const warnings = [];
  if (!frontmatter.present) warnings.push("missing_frontmatter");
  if (!frontmatter.description) warnings.push("missing_trigger_description");
  if (sections.length === 0) warnings.push("missing_section_headings");
  if (executableFiles.length > 0) warnings.push("contains_executable_support_files");
  return {
    analyzer: {
      id: STATIC_ANALYZER_ID,
      version: analyzerVersion,
      ruleset_fingerprint: authoringInspection?.ruleset_fingerprint ?? rulesetFingerprint(),
    },
    manifest_path: manifest.relative_path,
    identity: {
      name: frontmatter.name ?? skill.skill_name,
      description: frontmatter.description ?? skill.description ?? null,
      frontmatter_fields: frontmatter.fields,
    },
    readability: {
      line_count: lines.length,
      non_empty_line_count: lines.filter((line) => line.trim() !== "").length,
      section_count: sections.length,
      instruction_line_count: instructionLineCount,
      fenced_code_block_count: Math.floor(fenceCount / 2),
    },
    sections,
    references: {
      markdown_link_count: links.length,
      relative: [...new Set(relativeReferences)].sort(),
      external: externalReferences,
    },
    support_files: {
      total: artifactFiles.length,
      executable_like: executableFiles,
    },
    warnings,
    authoring: authoringInspection
      ? authoringAnalysisPayload(authoringInspection)
      : { results: {}, execution_effect: EXECUTION_EFFECT },
  };
}

async function analyzeSkillRevision({
  catalogRoot,
  registryRoot,
  lineageId: rawLineageId,
  sourceRevisionId,
  analyzerVersion = STATIC_ANALYZER_VERSION,
  now,
}) {
  const lineageId = validateLineageId(rawLineageId);
  analyzerVersion = requiredText(analyzerVersion, "Analyzer version");
  const skill = await revisionSkill(registryRoot, lineageId, requiredText(sourceRevisionId, "Source revision id"));
  const observedDigest = await digestDirectory(skill.canonical_path);
  if (observedDigest !== skill.content_digest) {
    throw new Error(`Canonical skill digest mismatch for analysis: ${skill.id}`);
  }
  const [manifest, artifactFiles, authoringInspection] = await Promise.all([
    readPrimaryManifest(skill),
    listFiles(skill.canonical_path),
    inspectSkillPackage({
      skillPath: skill.canonical_path,
      provider: "portable",
      skillName: skill.skill_name,
    }),
  ]);
  const fingerprint = authoringInspection.ruleset_fingerprint;
  const payload = staticAnalysisPayload({ skill, manifest, artifactFiles, analyzerVersion, authoringInspection });
  const analysisDigest = sha256(JSON.stringify(payload));
  const id = `analysis_${sha256(`${lineageId}\0${sourceRevisionId}\0${skill.content_digest}\0${analyzerVersion}\0${fingerprint}`).slice(0, 24)}`;
  const record = {
    id,
    lineage_id: lineageId,
    source_revision_id: sourceRevisionId,
    input_content_digest: skill.content_digest,
    analysis_digest: analysisDigest,
    ...payload,
    generated_at: timestamp(now),
  };
  return withSidecarWrite(catalogRoot, lineageId, async (sidecar) => {
    const existing = sidecar.analyses.find((item) => item.id === id);
    if (existing) {
      if (existing.analysis_digest !== analysisDigest) {
        throw new Error("Static analyzer output changed without an analyzer version change");
      }
      return { changed: false, value: presentAnalysis(existing, { stale: false }) };
    }
    sidecar.analyses.push(record);
    return { value: presentAnalysis(record, { stale: false }), now };
  });
}

async function analysisStatuses(registryRoot, lineageId, analyses) {
  if (!registryRoot) return new Map(analyses.map((analysis) => [analysis.id, { stale: false }]));
  const revisions = await listSkillRevisions({ registryRoot, lineageId });
  const byRevision = new Map(revisions.map((skill) => [skill.source_revision_id, skill]));
  const latest = revisions.at(-1) ?? null;
  return new Map(analyses.map((analysis) => {
    const skill = byRevision.get(analysis.source_revision_id);
    return [analysis.id, {
      stale: !skill || skill.content_digest !== analysis.input_content_digest,
      is_latest_revision: latest?.source_revision_id === analysis.source_revision_id,
      outdated: Boolean(latest && latest.source_revision_id !== analysis.source_revision_id),
    }];
  }));
}

async function listSkillAnalyses({ catalogRoot, registryRoot, lineageId: rawLineageId }) {
  const lineageId = validateLineageId(rawLineageId);
  if (registryRoot) await getSkillLineage(registryRoot, lineageId);
  const sidecar = await loadSkillAnnotationSidecar({ catalogRoot, lineageId });
  const statuses = await analysisStatuses(registryRoot, lineageId, sidecar.analyses);
  return sidecar.analyses
    .slice()
    .sort((left, right) => right.generated_at.localeCompare(left.generated_at) || left.id.localeCompare(right.id))
    .map((analysis) => presentAnalysis(analysis, statuses.get(analysis.id)));
}

async function getSkillAnalysis({ catalogRoot, registryRoot, lineageId: rawLineageId, analysisId }) {
  const lineageId = validateLineageId(rawLineageId);
  const analyses = await listSkillAnalyses({ catalogRoot, registryRoot, lineageId });
  const analysis = analyses.find((item) => item.id === analysisId);
  if (!analysis) {
    const error = new Error(`Skill analysis not found: ${analysisId}`);
    error.code = "ANALYSIS_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  return analysis;
}

module.exports = {
  ANNOTATION_KINDS,
  ANNOTATION_SCHEMA_VERSION,
  EXECUTION_EFFECT,
  FORBIDDEN_CONTROL_FIELDS,
  STATIC_ANALYZER_ID,
  STATIC_ANALYZER_VERSION,
  addSkillAnnotation: createSkillAnnotation,
  analyzeSkillRevision,
  annotationFile,
  createSkillAnnotation,
  deleteSkillAnnotation,
  editSkillAnnotation: updateSkillAnnotation,
  getSkillAnalysis,
  getSkillAnnotation,
  listSkillAnalyses,
  listSkillAnnotations,
  loadSkillAnnotationSidecar,
  restoreSkillAnnotation,
  staticAnalysisPayload,
  updateSkillAnnotation,
};
