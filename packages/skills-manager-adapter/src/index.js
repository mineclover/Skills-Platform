const fs = require("node:fs/promises");
const path = require("node:path");
const { digestDirectory, validateActivationPlan } = require("../../skill-contracts/src");

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function registryRootFor(canonicalPath) {
  const marker = `${path.sep}revisions${path.sep}`;
  const index = path.resolve(canonicalPath).indexOf(marker);
  return index < 0 ? null : path.resolve(canonicalPath).slice(0, index);
}

async function lstatOrNull(candidate) {
  try {
    return await fs.lstat(candidate);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function inspectOperation(operation) {
  const canonicalPath = path.resolve(operation.canonical_path);
  const deliveryPath = path.resolve(operation.delivery_path);
  const canonicalStats = await lstatOrNull(canonicalPath);
  if (!canonicalStats?.isDirectory()) {
    return { operation, status: "invalid", reason: "canonical artifact directory is missing" };
  }
  if (await digestDirectory(canonicalPath) !== operation.content_digest) {
    return { operation, status: "invalid", reason: "canonical artifact digest does not match plan" };
  }

  const deliveryStats = await lstatOrNull(deliveryPath);
  if (!deliveryStats) {
    return { operation, status: operation.desired_state === "enabled" ? "create" : "noop" };
  }
  if (!deliveryStats.isSymbolicLink()) {
    return { operation, status: "conflict", reason: "delivery path is not a managed symbolic link" };
  }

  const actualTarget = await fs.realpath(deliveryPath);
  const sameTarget = path.resolve(actualTarget).toLowerCase() === canonicalPath.toLowerCase();
  const registryRoot = registryRootFor(canonicalPath);
  const managedTarget = registryRoot && isWithin(path.resolve(actualTarget), path.join(registryRoot, "revisions"));
  if (operation.desired_state === "enabled") {
    return sameTarget
      ? { operation, status: "noop" }
      : { operation, status: "replace", reason: "managed link targets a different pinned revision" };
  }
  if (sameTarget || managedTarget) return { operation, status: "remove" };
  return { operation, status: "conflict", reason: "delivery path links to an unmanaged target" };
}

async function previewActivationPlan(plan) {
  const validation = validateActivationPlan(plan);
  if (!validation.valid) return { valid: false, validation_issues: validation.issues, operations: [], summary: {} };
  const operations = [];
  for (const operation of plan.operations) operations.push(await inspectOperation(operation));
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

async function materialize(previewOperation) {
  const { operation, status } = previewOperation;
  const deliveryPath = path.resolve(operation.delivery_path);
  if (status === "noop") return { ...previewOperation, applied: false };
  if (status === "remove" || status === "replace") {
    // Preview establishes this is a symbolic link to a managed registry target.
    await fs.rm(deliveryPath, { recursive: true, force: true });
  }
  if (status === "create" || status === "replace") {
    await fs.mkdir(path.dirname(deliveryPath), { recursive: true });
    await fs.symlink(path.resolve(operation.canonical_path), deliveryPath, "junction");
  }
  return { ...previewOperation, applied: true };
}

async function applyActivationPlan(plan, { confirm = false, onProgress = () => {} } = {}) {
  if (!confirm) throw new Error("Explicit confirmation is required to materialize an activation plan");
  const preview = await previewActivationPlan(plan);
  if (!preview.valid) {
    const error = new Error("Activation plan cannot be applied because preview has invalid operations or conflicts");
    error.preview = preview;
    throw error;
  }
  const completed = [];
  for (const [index, operation] of preview.operations.entries()) {
    const result = await materialize(operation);
    completed.push(result);
    onProgress({ processed_count: index + 1, total_count: preview.operations.length, operation: result });
  }
  return {
    plan_id: plan.plan_id,
    completed_at: new Date().toISOString(),
    operations: completed,
    summary: completed.reduce((result, item) => {
      const key = item.applied ? "applied" : "skipped";
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {}),
  };
}

module.exports = { applyActivationPlan, previewActivationPlan };
