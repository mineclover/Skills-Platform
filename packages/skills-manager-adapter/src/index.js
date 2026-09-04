const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  digestDirectory,
  listFiles,
  validateActivationPlan,
} = require("@skills-platform/contracts");
const {
  codexSkillManifestPath,
  inspectCodexSkillConfig,
  isCodexTarget,
  reconcileCodexSkillConfig,
  resolveCodexConfigPath,
} = require("./codex-skill-config");

const COPY_OWNERSHIP_FILE = ".skills-platform-ownership.json";
const COPY_OWNERSHIP_MARKER = "skills-platform-adapter";
const LINK_OWNERSHIP_SUFFIX = ".skills-platform-link-ownership.json";
const pathLocks = new Map();

function stripWindowsNamespace(candidate) {
  if (process.platform !== "win32") return candidate;
  if (/^\\\\\?\\UNC\\/i.test(candidate)) return `\\\\${candidate.slice(8)}`;
  return candidate.replace(/^\\\\\?\\/, "");
}

function comparablePath(candidate) {
  const resolved = path.resolve(stripWindowsNamespace(candidate));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function pathsEqual(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function isWithin(candidate, root) {
  const relative = path.relative(comparablePath(root), comparablePath(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function registryRootFor(canonicalPath) {
  const resolved = path.resolve(canonicalPath);
  const marker = `${path.sep}revisions${path.sep}`;
  const comparable = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const comparableMarker = process.platform === "win32" ? marker.toLowerCase() : marker;
  const index = comparable.lastIndexOf(comparableMarker);
  return index < 0 ? null : resolved.slice(0, index);
}

function registryRecordPaths(registryRoot, record) {
  const candidates = [];
  for (const value of [record.canonical_relative_path, record.canonical_path]) {
    if (typeof value !== "string" || value.trim() === "") continue;
    if (path.isAbsolute(value)) {
      candidates.push(path.resolve(value));
      continue;
    }
    const portableSegments = value.trim().replaceAll("\\", "/").split("/").filter(Boolean);
    if (path.win32.isAbsolute(value)) {
      const revisionIndex = portableSegments.findIndex((segment, index) => segment.toLowerCase() === "revisions"
        && portableSegments[index + 1] === record.source_revision_id);
      if (revisionIndex >= 0) {
        candidates.push(path.resolve(registryRoot, ...portableSegments.slice(revisionIndex)));
      }
      continue;
    }
    candidates.push(path.resolve(registryRoot, ...portableSegments));
  }
  const legacyBasename = typeof record.canonical_path === "string"
    ? path.win32.basename(record.canonical_path.replaceAll("/", "\\"))
    : null;
  if (legacyBasename && record.source_revision_id) {
    candidates.push(path.resolve(registryRoot, "revisions", record.source_revision_id, "artifacts", legacyBasename));
    candidates.push(path.resolve(registryRoot, "revisions", record.source_revision_id, legacyBasename));
  }
  return [...new Set(candidates)];
}

async function loadRegistryIdentityIndex(operation) {
  const registryRoot = registryRootFor(operation.canonical_path);
  if (!registryRoot) return { available: false, registryRoot: null, records: [] };
  try {
    const registry = JSON.parse(await fs.readFile(path.join(registryRoot, "registry.json"), "utf8"));
    const records = Array.isArray(registry.skills) ? registry.skills : [];
    return { available: true, registryRoot, records };
  } catch (error) {
    if (error.code === "ENOENT") return { available: false, registryRoot, records: [] };
    throw new Error(`registry identity index could not be read: ${error.message}`);
  }
}

async function operationIdentity(operation) {
  // registry_skill_id is revision-specific. registry.json is therefore the
  // authority that binds the plan tuple (id/name/revision/digest/path) and also
  // supplies lineage_id for a reviewed previous-revision transition.
  const index = await loadRegistryIdentityIndex(operation);
  const record = index.records.find((item) => item.id === operation.registry_skill_id) ?? null;
  if (index.available && !record) {
    return { valid: false, reason: `registry skill identity is not present in registry.json: ${operation.registry_skill_id}`, index };
  }
  if (record) {
    const recordPaths = registryRecordPaths(index.registryRoot, record);
    let recordPathMatches = false;
    for (const recordPath of recordPaths) {
      if (await pathsReferToSameEntry(recordPath, operation.canonical_path)) {
        recordPathMatches = true;
        break;
      }
    }
    const identityMatches = record.skill_name === operation.skill_name
      && record.source_revision_id === operation.source_revision_id
      && record.content_digest === operation.content_digest
      && recordPathMatches;
    if (!identityMatches) {
      return { valid: false, reason: "activation operation identity does not match the registry record", index, record };
    }
  }
  return {
    valid: true,
    index,
    record,
    identity: {
      registry_skill_id: operation.registry_skill_id,
      skill_name: operation.skill_name ?? null,
      source_revision_id: operation.source_revision_id,
      content_digest: operation.content_digest,
      lineage_id: record?.lineage_id ?? null,
    },
  };
}

async function registryIdentityForPath(identityIndex, candidatePath) {
  for (const record of identityIndex.records) {
    for (const recordPath of registryRecordPaths(identityIndex.registryRoot, record)) {
      if (await pathsReferToSameEntry(recordPath, candidatePath)) return record;
    }
  }
  return null;
}

function sameLineage(left, right) {
  // Different revision IDs are accepted only when the registry (or an adapter
  // ownership record created from it) proves the same lineage and skill name.
  return typeof left?.lineage_id === "string"
    && left.lineage_id !== ""
    && left.lineage_id === right?.lineage_id
    && left.skill_name === right?.skill_name;
}

function exactIdentity(left, right) {
  return left?.registry_skill_id === right?.registry_skill_id
    && left?.skill_name === right?.skill_name
    && left?.source_revision_id === right?.source_revision_id
    && left?.content_digest === right?.content_digest;
}

function ownershipIdentity(ownership, identityIndex) {
  const record = identityIndex.records.find((item) => item.id === ownership.registry_skill_id);
  return {
    registry_skill_id: ownership.registry_skill_id,
    skill_name: ownership.skill_name ?? record?.skill_name ?? null,
    source_revision_id: ownership.source_revision_id,
    content_digest: ownership.content_digest,
    lineage_id: ownership.lineage_id ?? record?.lineage_id ?? null,
  };
}

function linkOwnershipPath(deliveryPath) {
  return `${deliveryPath}${LINK_OWNERSHIP_SUFFIX}`;
}

function directoryLinkType() {
  return process.platform === "win32" ? "junction" : "dir";
}

function resolveLinkTarget(deliveryPath, rawTarget) {
  const normalized = stripWindowsNamespace(rawTarget);
  return path.resolve(path.isAbsolute(normalized) ? normalized : path.join(path.dirname(deliveryPath), normalized));
}

async function lstatOrNull(candidate) {
  try {
    return await fs.lstat(candidate);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function realpathOrNull(candidate) {
  try {
    return await fs.realpath(candidate);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function pathsReferToSameEntry(left, right) {
  if (pathsEqual(left, right)) return true;
  const [leftRealPath, rightRealPath] = await Promise.all([
    realpathOrNull(left),
    realpathOrNull(right),
  ]);
  if (!leftRealPath || !rightRealPath) return false;
  if (pathsEqual(leftRealPath, rightRealPath)) return true;
  const [leftStats, rightStats] = await Promise.all([fs.stat(leftRealPath), fs.stat(rightRealPath)]);
  return leftStats.dev === rightStats.dev && leftStats.ino === rightStats.ino;
}

async function nearestExistingAncestor(candidate) {
  let current = path.resolve(candidate);
  while (true) {
    if (await lstatOrNull(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function validateResolvedProjectContainment(deliveryPath, projectPath) {
  const projectRealPath = await realpathOrNull(projectPath);
  // A newly registered project may not exist yet. Lexical containment has
  // already been checked, and there cannot be an in-project symlink ancestor
  // until the project root itself exists.
  if (!projectRealPath) return null;
  const ancestor = await nearestExistingAncestor(path.dirname(deliveryPath));
  if (!ancestor) return "delivery path has no existing filesystem ancestor";
  const ancestorRealPath = await fs.realpath(ancestor);
  if (!isWithin(ancestorRealPath, projectRealPath)) {
    return "delivery path resolves outside target.project_path through an existing symbolic-link ancestor";
  }
  return null;
}

async function validateDeliveryRootBoundary(deliveryRoot, canonicalPaths) {
  const rootStats = await lstatOrNull(deliveryRoot);
  if (rootStats?.isSymbolicLink()) {
    return "delivery root must not itself be a symbolic link or junction";
  }

  // An owned copy is an artifact leaf, never a container for another
  // delivery root. Walk lexical ancestors so a later plan cannot reinterpret
  // `<owned-copy>/nested` as an independent root.
  let current = path.resolve(deliveryRoot);
  while (true) {
    if (await lstatOrNull(path.join(current, COPY_OWNERSHIP_FILE))) {
      return "delivery root must not be nested inside an owned artifact copy";
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const existingAncestor = await nearestExistingAncestor(deliveryRoot);
  const resolvedAncestor = existingAncestor ? await fs.realpath(existingAncestor) : null;
  if (resolvedAncestor) {
    for (const canonicalPath of canonicalPaths) {
      const registryRoot = registryRootFor(canonicalPath);
      if (!registryRoot) continue;
      const revisionsRoot = path.join(registryRoot, "revisions");
      const revisionsRealPath = await realpathOrNull(revisionsRoot);
      if (isWithin(resolvedAncestor, revisionsRoot)
        || (revisionsRealPath && isWithin(resolvedAncestor, revisionsRealPath))) {
        return "delivery root resolves inside an immutable registry revision";
      }
    }
  }
  return null;
}

async function validatePlanDeliveryPaths(plan) {
  const issues = [];
  const declaredRoot = plan.delivery_root ?? plan.target?.delivery_root;
  const projectRoot = plan.target?.scope === "project" ? plan.target.project_path : null;
  const deliveryPaths = [];
  if (plan.target?.scope === "global" && plan.operations.length > 0
    && !declaredRoot && plan.distribution?.shared_root_confirmation !== true) {
    issues.push({
      field: "distribution.shared_root_confirmation",
      message: "must be true when a global plan relies on its inferred delivery root",
    });
  }
  for (const [index, operation] of plan.operations.entries()) {
    const field = `operations[${index}].delivery_path`;
    if (!path.isAbsolute(operation.delivery_path)) {
      issues.push({ field, message: "must be an absolute path" });
      continue;
    }
    if (!path.isAbsolute(operation.canonical_path)) {
      issues.push({ field: `operations[${index}].canonical_path`, message: "must be an absolute path" });
    }
    const deliveryPath = path.resolve(operation.delivery_path);
    deliveryPaths.push({ index, path: deliveryPath, canonical_path: path.resolve(operation.canonical_path) });
    if (pathsEqual(path.dirname(deliveryPath), path.parse(deliveryPath).root)) {
      issues.push({ field, message: "filesystem root cannot be used as a delivery root" });
      continue;
    }
    if (projectRoot && (!isWithin(deliveryPath, projectRoot) || pathsEqual(deliveryPath, projectRoot))) {
      issues.push({ field, message: "must be contained by target.project_path" });
      continue;
    }
    if (declaredRoot && (!isWithin(deliveryPath, declaredRoot) || pathsEqual(deliveryPath, declaredRoot))) {
      issues.push({ field, message: "must be contained by the declared delivery root" });
      continue;
    }
    if (projectRoot) {
      const containmentError = await validateResolvedProjectContainment(deliveryPath, projectRoot);
      if (containmentError) issues.push({ field, message: containmentError });
    }
  }

  const deliveryParents = new Set(deliveryPaths.map((item) => comparablePath(path.dirname(item.path))));
  if (deliveryParents.size > 1) {
    issues.push({ field: "operations", message: "all delivery paths in one activation plan must be direct children of one delivery root" });
  } else if (deliveryPaths.length > 0) {
    const deliveryRoot = path.dirname(deliveryPaths[0].path);
    const boundaryError = await validateDeliveryRootBoundary(
      deliveryRoot,
      deliveryPaths.map((item) => item.canonical_path),
    );
    if (boundaryError) issues.push({ field: "operations", message: boundaryError });
  }
  for (let leftIndex = 0; leftIndex < deliveryPaths.length; leftIndex += 1) {
    const left = deliveryPaths[leftIndex];
    const registryRoot = registryRootFor(left.canonical_path);
    if (isWithin(left.path, left.canonical_path) || isWithin(left.canonical_path, left.path)
      || (registryRoot && isWithin(left.path, registryRoot))) {
      issues.push({
        field: `operations[${left.index}].delivery_path`,
        message: "must not overlap a canonical artifact or its registry root",
      });
    }
    for (let rightIndex = leftIndex + 1; rightIndex < deliveryPaths.length; rightIndex += 1) {
      const right = deliveryPaths[rightIndex];
      if (isWithin(left.path, right.path) || isWithin(right.path, left.path)) {
        issues.push({
          field: "operations",
          message: "delivery paths must not be ancestors or descendants of one another",
        });
      }
    }
  }
  return issues;
}

async function digestManagedCopy(root) {
  const hash = crypto.createHash("sha256");
  for (const relativePath of await listFiles(root)) {
    if (relativePath.replaceAll("\\", "/") === COPY_OWNERSHIP_FILE) continue;
    hash.update(relativePath.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await fs.readFile(path.join(root, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function digestManagedCopyState(root) {
  const hash = crypto.createHash("sha256");
  async function visit(directory, relativeDirectory = "") {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = path.join(relativeDirectory, entry.name);
      const portablePath = relativePath.replaceAll("\\", "/");
      if (portablePath === COPY_OWNERSHIP_FILE) continue;
      const absolutePath = path.join(directory, entry.name);
      const stats = await fs.lstat(absolutePath);
      if (entry.isDirectory()) {
        hash.update(`directory\0${portablePath}\0${stats.mode}\0`);
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        hash.update(`file\0${portablePath}\0${stats.mode}\0`);
        hash.update(await fs.readFile(absolutePath));
        hash.update("\0");
      } else if (entry.isSymbolicLink()) {
        hash.update(`symlink\0${portablePath}\0${await fs.readlink(absolutePath)}\0`);
      } else {
        hash.update(`special\0${portablePath}\0${stats.mode}\0${stats.size}\0`);
      }
    }
  }
  await visit(root);
  return hash.digest("hex");
}

function ownershipRecord(operation, identity, { method, deliveredStateDigest = null }) {
  return {
    schema_version: 1,
    managed_by: COPY_OWNERSHIP_MARKER,
    method,
    registry_skill_id: operation.registry_skill_id,
    source_revision_id: operation.source_revision_id,
    content_digest: operation.content_digest,
    delivered_state_digest: deliveredStateDigest,
    skill_name: operation.skill_name ?? null,
    lineage_id: identity.lineage_id ?? null,
    canonical_path: path.resolve(operation.canonical_path),
    delivery_path: path.resolve(operation.delivery_path),
    delivery_name: path.basename(operation.delivery_path),
  };
}

async function readCopyOwnership(copyPath) {
  const sidecarPath = path.join(copyPath, COPY_OWNERSHIP_FILE);
  const stats = await lstatOrNull(sidecarPath);
  if (!stats) return { valid: false, reason: "delivery directory has no Skills Platform ownership sidecar" };
  if (!stats.isFile()) return { valid: false, reason: "copy ownership sidecar is not a regular file" };
  try {
    const ownership = JSON.parse(await fs.readFile(sidecarPath, "utf8"));
    if (ownership?.schema_version !== 1 || ownership?.managed_by !== COPY_OWNERSHIP_MARKER || ownership?.method !== "copy") {
      return { valid: false, reason: "copy ownership sidecar is not managed by this adapter" };
    }
    return { valid: true, ownership };
  } catch (error) {
    return { valid: false, reason: `copy ownership sidecar is invalid: ${error.message}` };
  }
}

async function readLinkOwnership(linkPath) {
  const sidecarPath = linkOwnershipPath(linkPath);
  const stats = await lstatOrNull(sidecarPath);
  if (!stats) return { present: false, valid: false };
  if (!stats.isFile()) return { present: true, valid: false, reason: "link ownership sidecar is not a regular file" };
  try {
    const ownership = JSON.parse(await fs.readFile(sidecarPath, "utf8"));
    if (ownership?.schema_version !== 1 || ownership?.managed_by !== COPY_OWNERSHIP_MARKER || ownership?.method !== "symlink") {
      return { present: true, valid: false, reason: "link ownership sidecar is not managed by this adapter" };
    }
    return { present: true, valid: true, ownership };
  } catch (error) {
    return { present: true, valid: false, reason: `link ownership sidecar is invalid: ${error.message}` };
  }
}

async function inspectExistingBinding(operation, candidatePath = operation.delivery_path, expectedDeliveryPath = operation.delivery_path) {
  const deliveryPath = path.resolve(candidatePath);
  const expectedPath = path.resolve(expectedDeliveryPath);
  const stats = await lstatOrNull(deliveryPath);
  if (!stats) {
    if (await lstatOrNull(linkOwnershipPath(deliveryPath))) {
      return { kind: "other", managed: false, stats: null, reason: "delivery path has a stale link ownership sidecar" };
    }
    return { kind: "missing", managed: false, stats: null };
  }

  const canonicalPath = path.resolve(operation.canonical_path);
  const planned = await operationIdentity(operation);
  if (!planned.valid) {
    return { kind: "identity_error", managed: false, stats, reason: planned.reason };
  }
  const plannedIdentity = planned.identity;
  if (stats.isSymbolicLink()) {
    const rawTarget = await fs.readlink(deliveryPath);
    const targetPath = resolveLinkTarget(deliveryPath, rawTarget);
    const sameTarget = await pathsReferToSameEntry(targetPath, canonicalPath);
    const linkSidecar = await readLinkOwnership(deliveryPath);
    if (linkSidecar.present && !linkSidecar.valid) {
      return { kind: "symlink", managed: false, stats, raw_target: rawTarget, target_path: targetPath, reason: linkSidecar.reason };
    }
    let exact = false;
    let managed = false;
    let linkedIdentity = null;
    if (linkSidecar.valid) {
      linkedIdentity = ownershipIdentity(linkSidecar.ownership, planned.index);
      const deliveryMatches = (typeof linkSidecar.ownership.delivery_path === "string"
        && pathsEqual(linkSidecar.ownership.delivery_path, expectedPath))
        || linkSidecar.ownership.delivery_name === path.basename(expectedPath);
      exact = deliveryMatches && sameTarget && exactIdentity(linkedIdentity, plannedIdentity);
      managed = deliveryMatches && (exactIdentity(linkedIdentity, plannedIdentity) || sameLineage(linkedIdentity, plannedIdentity));
    } else if (planned.index.available) {
      const linkedRecord = await registryIdentityForPath(planned.index, targetPath);
      linkedIdentity = linkedRecord ? {
        registry_skill_id: linkedRecord.id,
        skill_name: linkedRecord.skill_name,
        source_revision_id: linkedRecord.source_revision_id,
        content_digest: linkedRecord.content_digest,
        lineage_id: linkedRecord.lineage_id ?? null,
      } : null;
      exact = sameTarget && exactIdentity(linkedIdentity, plannedIdentity);
      managed = exact || sameLineage(linkedIdentity, plannedIdentity);
    } else {
      // Without either an ownership record or registry.json there is no proof
      // that registry_skill_id/skill_name own this legacy link. Fail closed,
      // even when the raw target happens to equal canonical_path.
      exact = false;
      managed = false;
    }
    return {
      kind: "symlink",
      managed,
      exact,
      stats,
      raw_target: rawTarget,
      target_path: targetPath,
      ownership: linkSidecar.valid ? linkSidecar.ownership : null,
      has_link_sidecar: linkSidecar.valid,
      linked_identity: linkedIdentity,
      reason: managed ? undefined : "delivery link identity does not match this operation or its lineage",
    };
  }

  if (stats.isDirectory()) {
    const sidecar = await readCopyOwnership(deliveryPath);
    if (!sidecar.valid) return { kind: "directory", managed: false, stats, reason: sidecar.reason };
    const ownership = sidecar.ownership;
    const ownerDeliveryMatches = (typeof ownership.delivery_path === "string" && pathsEqual(ownership.delivery_path, expectedPath))
      || ownership.delivery_name === path.basename(expectedPath);
    const ownerIdentity = ownershipIdentity(ownership, planned.index);
    const stableIdentityMatches = exactIdentity(ownerIdentity, plannedIdentity);
    const ownerTargetManaged = stableIdentityMatches || sameLineage(ownerIdentity, plannedIdentity);
    if (!ownerDeliveryMatches || !ownerTargetManaged) {
      return { kind: "copy", managed: false, stats, ownership, reason: "copy ownership does not match this delivery path or registry" };
    }
    let payloadDigest;
    try {
      payloadDigest = await digestManagedCopy(deliveryPath);
    } catch (error) {
      return { kind: "copy", managed: false, stats, ownership, reason: `managed copy could not be verified: ${error.message}` };
    }
    if (payloadDigest !== ownership.content_digest) {
      return { kind: "copy", managed: false, stats, ownership, payload_digest: payloadDigest, reason: "managed copy content changed after delivery" };
    }
    const stateDigest = await digestManagedCopyState(deliveryPath);
    if (typeof ownership.delivered_state_digest !== "string" || stateDigest !== ownership.delivered_state_digest) {
      return {
        kind: "copy",
        managed: false,
        stats,
        ownership,
        payload_digest: payloadDigest,
        state_digest: stateDigest,
        reason: "managed copy filesystem state changed after delivery",
      };
    }
    return {
      kind: "copy",
      managed: true,
      exact: stableIdentityMatches,
      stats,
      ownership,
      linked_identity: ownerIdentity,
      payload_digest: payloadDigest,
      state_digest: stateDigest,
    };
  }

  return { kind: "other", managed: false, stats, reason: "delivery path is neither a symbolic link nor an owned directory copy" };
}

async function classifyOperation(operation, method = "symlink") {
  const canonicalPath = path.resolve(operation.canonical_path);
  if (typeof operation.skill_name !== "string" || operation.skill_name.trim() === "") {
    return { operation, delivery_method: method, status: "invalid", reason: "operation.skill_name is required for binding identity" };
  }
  const plannedIdentity = await operationIdentity(operation);
  if (!plannedIdentity.valid) {
    return { operation, delivery_method: method, status: "invalid", reason: plannedIdentity.reason };
  }
  if (operation.desired_state === "enabled") {
    const canonicalStats = await lstatOrNull(canonicalPath);
    if (!canonicalStats?.isDirectory()) {
      return { operation, delivery_method: method, status: "invalid", reason: "canonical artifact directory is missing" };
    }
    if (await digestDirectory(canonicalPath) !== operation.content_digest) {
      return { operation, delivery_method: method, status: "invalid", reason: "canonical artifact digest does not match plan" };
    }
    if (method === "copy" && await lstatOrNull(path.join(canonicalPath, COPY_OWNERSHIP_FILE))) {
      return { operation, delivery_method: method, status: "invalid", reason: `${COPY_OWNERSHIP_FILE} is reserved for copy ownership metadata` };
    }
  }

  const binding = await inspectExistingBinding(operation);
  if (binding.kind === "missing") {
    return { operation, delivery_method: method, status: operation.desired_state === "enabled" ? "create" : "noop" };
  }
  if (!binding.managed) {
    return { operation, delivery_method: method, status: "conflict", reason: binding.reason ?? "delivery path is unmanaged" };
  }
  if (operation.desired_state === "disabled") {
    return { operation, delivery_method: method, status: "remove" };
  }
  if ((method === "symlink" && binding.kind === "symlink" && binding.exact)
    || (method === "copy" && binding.kind === "copy" && binding.exact)) {
    return { operation, delivery_method: method, status: "noop" };
  }
  return {
    operation,
    delivery_method: method,
    status: "replace",
    reason: binding.kind === method
      ? "managed binding targets a different pinned revision"
      : `managed ${binding.kind} binding must be replaced with ${method}`,
  };
}

async function inspectOperation(operation, { method = "symlink" } = {}) {
  return classifyOperation(operation, method);
}

function isCodexSkillOperation(target, operation) {
  return isCodexTarget(target) && (operation.artifact_type ?? "skill") === "skill";
}

async function codexConfigPreview(target, operation, options = {}) {
  if (!isCodexSkillOperation(target, operation)) return null;
  const configPath = resolveCodexConfigPath(target, options);
  const skillPath = codexSkillManifestPath(operation);
  const inspection = await inspectCodexSkillConfig({ configPath, skillPath });
  const desiredEnabled = operation.desired_state === "enabled";
  let action = "noop";
  if (!inspection.managed) action = "skipped";
  else if (inspection.entry_count === 0 && desiredEnabled) action = "noop";
  else if (!inspection.deterministic || inspection.enabled !== desiredEnabled) {
    action = desiredEnabled ? "enable" : "disable";
  }
  return {
    ...inspection,
    desired_enabled: desiredEnabled,
    action,
    restart_required: action === "enable" || action === "disable",
  };
}

async function previewActivationPlan(plan, options = {}) {
  const validation = validateActivationPlan(plan);
  if (!validation.valid) return { valid: false, validation_issues: validation.issues, operations: [], summary: {} };
  const pathIssues = await validatePlanDeliveryPaths(plan);
  if (pathIssues.length > 0) return { valid: false, validation_issues: pathIssues, operations: [], summary: {} };
  const method = plan.distribution.method;
  const operations = [];
  for (const operation of plan.operations) {
    const configPreview = await codexConfigPreview(plan.target, operation, options);
    operations.push({
      ...await classifyOperation(operation, method),
      ...(configPreview ? {
        codex_config: configPreview,
        restart_required: configPreview.restart_required,
      } : {}),
      delivery_guard: {
        target: { ...plan.target },
        delivery_root: plan.delivery_root ?? plan.target?.delivery_root ?? path.dirname(operation.delivery_path),
      },
    });
  }
  const summary = operations.reduce((result, item) => {
    result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, {});
  return {
    valid: !operations.some((item) => item.status === "invalid" || item.status === "conflict"),
    validation_issues: [],
    operations,
    summary,
  };
}

function temporarySibling(deliveryPath, label) {
  return path.join(
    path.dirname(deliveryPath),
    `.${path.basename(deliveryPath)}.${label}-${process.pid}-${crypto.randomUUID()}`,
  );
}

async function removeTemporary(candidate) {
  const stats = await lstatOrNull(candidate);
  if (stats) {
    if (stats.isSymbolicLink()) await fs.unlink(candidate);
    else await fs.rm(candidate, { recursive: true, force: true });
  }
  if (await lstatOrNull(linkOwnershipPath(candidate))) await fs.unlink(linkOwnershipPath(candidate));
}

async function createStagedBinding(operation, method) {
  const deliveryPath = path.resolve(operation.delivery_path);
  const stagePath = temporarySibling(deliveryPath, "stage");
  await fs.mkdir(path.dirname(deliveryPath), { recursive: true });
  try {
    const planned = await operationIdentity(operation);
    if (!planned.valid) throw new Error(planned.reason);
    if (method === "symlink") {
      await fs.symlink(path.resolve(operation.canonical_path), stagePath, directoryLinkType());
      if (await digestDirectory(path.resolve(operation.canonical_path)) !== operation.content_digest) {
        throw new Error("canonical artifact digest changed while staging the symbolic link");
      }
      await fs.writeFile(
        linkOwnershipPath(stagePath),
        `${JSON.stringify(ownershipRecord(operation, planned.identity, { method: "symlink" }), null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
    } else if (method === "copy") {
      await fs.cp(path.resolve(operation.canonical_path), stagePath, {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
      if (await digestManagedCopy(stagePath) !== operation.content_digest) {
        throw new Error("staged copy digest does not match the activation plan");
      }
      const deliveredStateDigest = await digestManagedCopyState(stagePath);
      await fs.writeFile(
        path.join(stagePath, COPY_OWNERSHIP_FILE),
        `${JSON.stringify(ownershipRecord(operation, planned.identity, { method: "copy", deliveredStateDigest }), null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
    } else {
      throw new Error(`Unsupported delivery method: ${method}`);
    }
    return stagePath;
  } catch (error) {
    await removeTemporary(stagePath).catch(() => {});
    throw error;
  }
}

function sameStats(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.mode === after.mode;
}

function sameBindingSnapshot(before, after) {
  if (!before?.stats || !after?.stats || before.kind !== after.kind || !sameStats(before.stats, after.stats)) return false;
  if (before.kind === "symlink") {
    return before.raw_target === after.raw_target
      && before.has_link_sidecar === after.has_link_sidecar
      && JSON.stringify(before.ownership ?? null) === JSON.stringify(after.ownership ?? null);
  }
  if (before.kind === "copy") {
    return before.payload_digest === after.payload_digest
      && before.state_digest === after.state_digest
      && JSON.stringify(before.ownership) === JSON.stringify(after.ownership);
  }
  return false;
}

async function restoreBackup(backupPath, deliveryPath, hasLinkSidecar = false) {
  if (await lstatOrNull(deliveryPath)) {
    throw new Error(`cannot restore managed binding because delivery path was recreated; recovery backup: ${backupPath}`);
  }
  if (hasLinkSidecar && await lstatOrNull(linkOwnershipPath(deliveryPath))) {
    throw new Error(`cannot restore managed binding because its ownership path was recreated; recovery backup: ${backupPath}`);
  }
  await fs.rename(backupPath, deliveryPath);
  if (hasLinkSidecar) {
    try {
      await fs.rename(linkOwnershipPath(backupPath), linkOwnershipPath(deliveryPath));
    } catch (error) {
      await fs.rename(deliveryPath, backupPath).catch(() => {});
      throw error;
    }
  }
}

async function moveManagedBindingAside(operation) {
  const deliveryPath = path.resolve(operation.delivery_path);
  const before = await inspectExistingBinding(operation);
  if (!before.managed) throw new Error(before.reason ?? "delivery path is no longer a managed binding");
  const backupPath = temporarySibling(deliveryPath, "backup");
  await fs.rename(deliveryPath, backupPath);
  if (before.has_link_sidecar) {
    try {
      await fs.rename(linkOwnershipPath(deliveryPath), linkOwnershipPath(backupPath));
    } catch (error) {
      await fs.rename(backupPath, deliveryPath).catch(() => {});
      throw error;
    }
  }
  try {
    const after = await inspectExistingBinding(operation, backupPath, deliveryPath);
    if (!sameBindingSnapshot(before, after)) {
      throw new Error("delivery binding changed while it was being materialized");
    }
    return { backupPath, binding: before, hasLinkSidecar: before.has_link_sidecar === true };
  } catch (error) {
    await restoreBackup(backupPath, deliveryPath, before.has_link_sidecar === true).catch((restoreError) => {
      error.message = `${error.message}; ${restoreError.message}`;
    });
    throw error;
  }
}

async function removeVerifiedBindingAt(operation, candidatePath, expectedDeliveryPath, expectedSnapshot) {
  const current = await inspectExistingBinding(operation, candidatePath, expectedDeliveryPath);
  if (!current.managed || !sameBindingSnapshot(expectedSnapshot, current)) {
    throw new Error(`refusing to remove a binding that changed after verification: ${candidatePath}`);
  }
  if (current.kind === "symlink") {
    await fs.unlink(candidatePath);
    if (current.has_link_sidecar) await fs.unlink(linkOwnershipPath(candidatePath));
  }
  else if (current.kind === "copy") await fs.rm(candidatePath, { recursive: true });
  else throw new Error(`refusing to remove unsupported managed binding type: ${current.kind}`);
}

async function removeDesiredBinding(operation, method) {
  const deliveryPath = path.resolve(operation.delivery_path);
  const current = await inspectExistingBinding(operation);
  const exact = (method === "symlink" && current.kind === "symlink" && current.exact)
    || (method === "copy" && current.kind === "copy" && current.exact);
  if (!current.managed || !exact) throw new Error("refusing to roll back a delivery path that no longer contains the applied binding");
  await removeVerifiedBindingAt(operation, deliveryPath, deliveryPath, current);
}

async function materializeWithJournal(previewOperation, method) {
  const { operation, status } = previewOperation;
  const deliveryPath = path.resolve(operation.delivery_path);
  if (status === "conflict" || status === "invalid") {
    throw new Error(`cannot materialize ${status === "invalid" ? "an" : "a"} ${status} preview operation`);
  }
  if (!["create", "replace", "remove", "noop"].includes(status)) {
    throw new Error(`cannot materialize unknown preview status: ${status}`);
  }
  const current = await classifyOperation(operation, method);
  if (current.status !== status) {
    throw new Error(`delivery path changed after preview (expected ${status}, observed ${current.status})`);
  }
  if (status === "noop") {
    return { result: { ...previewOperation, delivery_method: method, applied: false }, journal: null };
  }

  let stagePath = null;
  let moved = null;
  try {
    if (status === "create" || status === "replace") stagePath = await createStagedBinding(operation, method);
    if (status === "remove" || status === "replace") moved = await moveManagedBindingAside(operation);
    if (stagePath) {
      const stagedPath = stagePath;
      await fs.rename(stagedPath, deliveryPath);
      if (method === "symlink") {
        try {
          await fs.rename(linkOwnershipPath(stagedPath), linkOwnershipPath(deliveryPath));
        } catch (error) {
          await fs.unlink(deliveryPath).catch(() => {});
          await removeTemporary(stagedPath).catch(() => {});
          throw error;
        }
      }
      stagePath = null;
    }

    const result = { ...previewOperation, delivery_method: method, applied: true };
    const journal = {
      result,
      async rollback() {
        if (status === "create" || status === "replace") await removeDesiredBinding(operation, method);
        if (moved) await restoreBackup(moved.backupPath, deliveryPath, moved.hasLinkSidecar);
      },
      async commit() {
        if (moved) await removeVerifiedBindingAt(operation, moved.backupPath, deliveryPath, moved.binding);
      },
    };
    return { result, journal };
  } catch (error) {
    let recoveryFailed = false;
    if (stagePath) await removeTemporary(stagePath).catch(() => { recoveryFailed = true; });
    if (moved && await lstatOrNull(moved.backupPath)) {
      if (await lstatOrNull(deliveryPath)) {
        const applied = await inspectExistingBinding(operation);
        const exact = (method === "symlink" && applied.kind === "symlink" && applied.exact)
          || (method === "copy" && applied.kind === "copy" && applied.exact);
        if (exact) {
          await removeVerifiedBindingAt(operation, deliveryPath, deliveryPath, applied).catch(() => { recoveryFailed = true; });
        }
      }
      await restoreBackup(moved.backupPath, deliveryPath, moved.hasLinkSidecar).catch((restoreError) => {
        recoveryFailed = true;
        error.message = `${error.message}; ${restoreError.message}`;
      });
    }
    error.state_unchanged = !recoveryFailed;
    throw error;
  }
}

async function pathLockKey(candidate) {
  const resolvedCandidate = path.resolve(candidate);
  const existingAncestor = await nearestExistingAncestor(resolvedCandidate);
  if (!existingAncestor) return comparablePath(resolvedCandidate);
  const realAncestor = await fs.realpath(existingAncestor);
  return comparablePath(path.join(realAncestor, path.relative(existingAncestor, resolvedCandidate)));
}

async function acquirePathLockKey(key) {
  const previous = pathLocks.get(key) ?? Promise.resolve();
  let releaseCurrent;
  const current = new Promise((resolve) => { releaseCurrent = resolve; });
  const tail = previous.then(() => current);
  pathLocks.set(key, tail);
  await previous;
  return () => {
    releaseCurrent();
    if (pathLocks.get(key) === tail) pathLocks.delete(key);
  };
}

async function acquirePathLock(candidate) {
  return acquirePathLockKey(await pathLockKey(candidate));
}

async function acquireCandidateLocks(candidates) {
  const resolvedRoots = await Promise.all(candidates.map((candidate) => pathLockKey(candidate)));
  const roots = [...new Set(resolvedRoots)].sort();
  const releases = [];
  try {
    for (const root of roots) releases.push(await acquirePathLockKey(root));
  } catch (error) {
    for (const release of releases.reverse()) release();
    throw error;
  }
  return () => { for (const release of releases.reverse()) release(); };
}

async function acquirePlanLocks(plan, options = {}) {
  const candidates = plan.operations.map((operation) => path.dirname(operation.delivery_path));
  const configPath = resolveCodexConfigPath(plan.target, options);
  if (configPath) candidates.push(configPath);
  return acquireCandidateLocks(candidates);
}

function compositeJournal(result, filesystemJournal, configJournal) {
  if (!filesystemJournal && !configJournal) return null;
  return {
    result,
    async rollback() {
      const errors = [];
      if (configJournal) {
        try {
          await configJournal.rollback();
        } catch (error) {
          errors.push(error.message);
        }
      }
      if (filesystemJournal) {
        try {
          await filesystemJournal.rollback();
        } catch (error) {
          errors.push(error.message);
        }
      }
      if (errors.length > 0) throw new Error(errors.join("; "));
    },
    async commit() {
      if (filesystemJournal) await filesystemJournal.commit();
      if (configJournal) await configJournal.commit();
    },
  };
}

async function materializeOperation(previewOperation, method, target, options = {}) {
  const filesystem = await materializeWithJournal(previewOperation, method);
  let config = { result: null, journal: null };
  try {
    if (isCodexSkillOperation(target, previewOperation.operation)) {
      config = await reconcileCodexSkillConfig({
        configPath: resolveCodexConfigPath(target, options),
        skillPath: codexSkillManifestPath(previewOperation.operation),
        enabled: previewOperation.operation.desired_state === "enabled",
      });
    }
  } catch (error) {
    if (filesystem.journal) {
      try {
        await filesystem.journal.rollback();
      } catch (rollbackError) {
        error.message = `${error.message}; ${rollbackError.message}`;
        error.state_unchanged = false;
      }
    }
    throw error;
  }
  const result = {
    ...filesystem.result,
    ...(config.result ? {
      codex_config: config.result,
      restart_required: config.result.restart_required === true,
    } : {}),
    applied: filesystem.result.applied === true || config.result?.changed === true,
  };
  return {
    result,
    journal: compositeJournal(result, filesystem.journal, config.journal),
  };
}

async function materialize(previewOperation, options = {}) {
  const method = options.method ?? previewOperation.delivery_method ?? "symlink";
  const target = previewOperation.delivery_guard?.target;
  const candidates = [path.dirname(previewOperation.operation.delivery_path)];
  const configPath = target ? resolveCodexConfigPath(target, options) : null;
  if (configPath) candidates.push(configPath);
  const release = await acquireCandidateLocks(candidates);
  try {
    if (!target) {
      throw new Error("materialize requires a guarded operation returned by previewActivationPlan");
    }
    const pathIssues = await validatePlanDeliveryPaths({
      target: previewOperation.delivery_guard.target,
      delivery_root: previewOperation.delivery_guard.delivery_root,
      operations: [previewOperation.operation],
    });
    if (pathIssues.length > 0) throw new Error(`delivery path is not safe to materialize: ${pathIssues[0].message}`);
    const { result, journal } = await materializeOperation(previewOperation, method, target, options);
    if (journal) await journal.commit();
    return result;
  } finally {
    release();
  }
}

function completedSummary(operations, failureCount = 0) {
  return operations.reduce((summary, item) => {
    if (item.not_attempted) summary.not_attempted += 1;
    else if (item.rolled_back) summary.rolled_back += 1;
    else if (item.applied) summary.applied += 1;
    else if (!item.failed) summary.skipped += 1;
    return summary;
  }, { applied: 0, skipped: 0, failed: failureCount, rolled_back: 0, not_attempted: 0 });
}

async function rollbackJournals(journals) {
  const errors = [];
  for (const journal of journals.slice().reverse()) {
    try {
      await journal.rollback();
      journal.result.rolled_back = true;
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
}

async function applyActivationPlan(plan, options = {}) {
  const { confirm = false, onProgress = () => {} } = options;
  const events = applyActivationPlanEvents(plan, options);
  let completedReport = null;
  for await (const event of events) {
    if (event.type === "operation") {
      try {
        onProgress({ processed_count: event.processed_count, total_count: event.total_count, operation: event.operation });
      } catch {
        // Progress listeners are observational and must not corrupt a filesystem transaction.
      }
    }
    if (event.type === "complete") completedReport = event.report;
  }
  return completedReport;
}

async function* applyActivationPlanEvents(plan, options = {}) {
  const { confirm = false } = options;
  if (!confirm) throw new Error("Explicit confirmation is required to materialize an activation plan");
  const releaseLocks = await acquirePlanLocks(plan, options);
  const completed = [];
  const journals = [];
  let settled = false;
  try {
    const preview = await previewActivationPlan(plan, options);
    yield { type: "preview", plan_id: plan.plan_id, preview };
    if (!preview.valid) {
      const error = new Error("Activation plan cannot be applied because preview has invalid operations or conflicts");
      error.preview = preview;
      throw error;
    }

    for (const [index, operation] of preview.operations.entries()) {
      try {
        const pathIssues = await validatePlanDeliveryPaths({ ...plan, operations: [operation.operation] });
        if (pathIssues.length > 0) {
          throw new Error(`delivery path failed materialization-time containment validation: ${pathIssues[0].message}`);
        }
        const { result, journal } = await materializeOperation(
          operation,
          plan.distribution.method,
          plan.target,
          options,
        );
        completed.push(result);
        if (journal) journals.push(journal);
        yield {
          type: "operation",
          plan_id: plan.plan_id,
          processed_count: index + 1,
          total_count: preview.operations.length,
          operation: result,
        };
      } catch (error) {
        const failedOperation = { ...operation, applied: false, failed: true, error: error.message };
        completed.push(failedOperation);
        yield {
          type: "operation",
          plan_id: plan.plan_id,
          processed_count: index + 1,
          total_count: preview.operations.length,
          operation: failedOperation,
        };
        const rollbackErrors = await rollbackJournals(journals);
        completed.push(...preview.operations.slice(index + 1).map((pendingOperation) => ({
          ...pendingOperation,
          applied: false,
          not_attempted: true,
        })));
        const report = {
          plan_id: plan.plan_id,
          completed_at: new Date().toISOString(),
          status: "failed",
          rolled_back: journals.length > 0 && rollbackErrors.length === 0,
          state_unchanged: error.state_unchanged !== false
            && (journals.length === 0 || rollbackErrors.length === 0),
          rollback_errors: rollbackErrors,
          error: error.message,
          operations: completed,
          summary: completedSummary(completed, 1),
        };
        settled = true;
        yield { type: "complete", plan_id: plan.plan_id, report };
        return report;
      }
    }

    const cleanupErrors = [];
    for (const journal of journals) {
      try {
        await journal.commit();
      } catch (error) {
        cleanupErrors.push(error.message);
      }
    }
    const report = {
      plan_id: plan.plan_id,
      completed_at: new Date().toISOString(),
      status: cleanupErrors.length === 0 ? "completed" : "failed",
      rolled_back: false,
      cleanup_errors: cleanupErrors,
      operations: completed,
      summary: {
        ...completedSummary(completed, 0),
        cleanup_failed: cleanupErrors.length,
      },
    };
    settled = true;
    yield { type: "complete", plan_id: plan.plan_id, report };
    return report;
  } finally {
    if (!settled && journals.length > 0) await rollbackJournals(journals);
    releaseLocks();
  }
}

module.exports = {
  COPY_OWNERSHIP_FILE,
  applyActivationPlan,
  applyActivationPlanEvents,
  inspectOperation,
  materialize,
  previewActivationPlan,
};
