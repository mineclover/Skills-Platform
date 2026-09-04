const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { loadCatalog, saveCatalog } = require("./catalog-state");

function timestamp() {
  return new Date().toISOString();
}

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value.trim();
}

function plainObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value;
}

function copyJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateInventory(inventory) {
  plainObject(inventory, "Provider inventory");
  if (!Array.isArray(inventory.providers)) throw new Error("Provider inventory providers must be an array");
  for (const provider of inventory.providers) {
    plainObject(provider, "Provider inventory provider");
    requiredText(provider.provider_id, "Provider id");
  }
  return copyJson(inventory);
}

function validateBindings(bindings) {
  if (!Array.isArray(bindings)) throw new Error("Provider bindings must be an array");
  for (const binding of bindings) {
    plainObject(binding, "Provider binding");
    requiredText(binding.provider_id, "Binding provider id");
    requiredText(binding.state, "Binding state");
  }
  return copyJson(bindings);
}

async function recordObservedState({ catalogRoot, projectId, providerId, inventory, bindings, capturedAt = timestamp(), source = "skills-manager-inspect" }) {
  projectId = requiredText(projectId, "Project id");
  providerId = requiredText(providerId, "Provider id");
  capturedAt = requiredText(capturedAt, "Observed state capture time");
  source = requiredText(source, "Observed state source");
  const catalog = await loadCatalog(catalogRoot);
  if (!catalog.projects.some((project) => project.id === projectId)) throw new Error(`Project not found for observed state: ${projectId}`);
  const record = {
    id: `observed_state_${crypto.randomUUID()}`,
    project_id: projectId,
    provider_id: providerId,
    captured_at: capturedAt,
    source,
    inventory: validateInventory(inventory),
    bindings: validateBindings(bindings),
    recorded_at: timestamp(),
  };
  catalog.observed_states.push(record);
  await saveCatalog(catalogRoot, catalog);
  return record;
}

async function listObservedStates({ catalogRoot, projectId, providerId }) {
  const catalog = await loadCatalog(catalogRoot);
  return catalog.observed_states.filter((record) => {
    if (projectId && record.project_id !== projectId) return false;
    if (providerId && record.provider_id !== providerId) return false;
    return true;
  }).sort((left, right) => right.recorded_at.localeCompare(left.recorded_at));
}

function isWindowsPath(value) {
  return process.platform === "win32" || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

function normalizedPath(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const input = value.trim();
  if (isWindowsPath(input)) {
    return { flavor: "win32", value: path.win32.resolve(input).toLowerCase() };
  }
  const resolved = path.resolve(input);
  try {
    return { flavor: "posix", value: fs.realpathSync.native(resolved) };
  } catch {
    return { flavor: "posix", value: path.normalize(resolved) };
  }
}

function pathsEqual(left, right) {
  const normalizedLeft = normalizedPath(left);
  const normalizedRight = normalizedPath(right);
  return Boolean(
    normalizedLeft
      && normalizedRight
      && normalizedLeft.flavor === normalizedRight.flavor
      && normalizedLeft.value === normalizedRight.value,
  );
}

function operationBinding(operation, bindings, providerId) {
  return bindings.find((binding) => binding.provider_id === providerId && pathsEqual(binding.target_path, operation.delivery_path)) ?? null;
}

function firstText(record, fields) {
  for (const field of fields) {
    const value = record?.[field];
    if (typeof value === "string" && value.trim() !== "") return { field, value: value.trim() };
  }
  return null;
}

function normalizedDigest(value) {
  return value.replace(/^sha256:/i, "").toLowerCase();
}

function bindingIdentityMismatches(operation, binding) {
  if (!binding) return [];
  const mismatches = [];
  const digest = firstText(binding, ["content_digest", "source_digest", "digest"]);
  if (digest && typeof operation.content_digest === "string"
    && normalizedDigest(digest.value) !== normalizedDigest(operation.content_digest)) {
    mismatches.push({ field: digest.field, expected: operation.content_digest, observed: digest.value });
  }

  const revision = firstText(binding, ["source_revision_id", "revision_id"]);
  if (revision && typeof operation.source_revision_id === "string" && revision.value !== operation.source_revision_id) {
    mismatches.push({ field: revision.field, expected: operation.source_revision_id, observed: revision.value });
  }

  const registrySkill = firstText(binding, ["registry_skill_id"]);
  if (registrySkill && typeof operation.registry_skill_id === "string" && registrySkill.value !== operation.registry_skill_id) {
    mismatches.push({ field: registrySkill.field, expected: operation.registry_skill_id, observed: registrySkill.value });
  }

  // source_path is useful for direct/link adapters. Prefer immutable digest or
  // revision claims when an upstream manager keeps its own canonical copy.
  const hasImmutableClaim = Boolean(digest || revision || registrySkill);
  const sourcePath = firstText(binding, ["canonical_path", "source_path"]);
  if (!hasImmutableClaim && sourcePath && typeof operation.canonical_path === "string"
    && !pathsEqual(sourcePath.value, operation.canonical_path)) {
    mismatches.push({ field: sourcePath.field, expected: operation.canonical_path, observed: sourcePath.value });
  }
  return mismatches;
}

function comparisonFor(operation, binding, providerAvailable) {
  if (!providerAvailable) return { operation, binding, status: "provider_unavailable", reason: "Provider is not detected or reachable in the observed snapshot." };
  if (operation.desired_state === "enabled") {
    if (!binding) return { operation, binding: null, status: "missing", reason: "No observed binding targets the planned delivery path." };
    const identityMismatches = bindingIdentityMismatches(operation, binding);
    if (identityMismatches.length > 0) {
      return {
        operation,
        binding,
        status: "conflict",
        reason: `Observed binding identity does not match the activation plan (${identityMismatches.map((item) => item.field).join(", ")}).`,
        identity_mismatches: identityMismatches,
      };
    }
    if (binding.state === "enabled") return { operation, binding, status: "matched", reason: "Observed binding is enabled at the planned delivery path." };
    if (binding.state === "disabled") return { operation, binding, status: "disabled", reason: "Observed binding is disabled." };
    return { operation, binding, status: "conflict", reason: binding.reason ?? `Observed binding state is ${binding.state}.` };
  }
  if (!binding || binding.state === "disabled" || binding.state === "missing") {
    return { operation, binding, status: "matched", reason: "Observed state satisfies the disabled delivery intent." };
  }
  const identityMismatches = bindingIdentityMismatches(operation, binding);
  if (identityMismatches.length > 0) {
    return {
      operation,
      binding,
      status: "conflict",
      reason: `An active binding at the delivery path has a different identity (${identityMismatches.map((item) => item.field).join(", ")}).`,
      identity_mismatches: identityMismatches,
    };
  }
  if (binding.state === "enabled") return { operation, binding, status: "still_enabled", reason: "Observed binding remains enabled." };
  return { operation, binding, status: "conflict", reason: binding.reason ?? `Observed binding state is ${binding.state}.` };
}

function compareActivationPlanWithObservedState({ plan, observedState }) {
  if (!plan?.target?.provider_id || !Array.isArray(plan.operations)) throw new Error("A valid activation plan is required for observed-state comparison");
  if (!observedState?.inventory || !Array.isArray(observedState.bindings)) throw new Error("Observed state snapshot is required");
  const providerId = plan.target.provider_id;
  if (observedState.provider_id !== providerId) throw new Error(`Observed provider does not match plan provider: ${observedState.provider_id}`);
  const provider = observedState.inventory.providers.find((item) => item.provider_id === providerId);
  const providerAvailable = Boolean(provider?.detected) && provider?.reachable !== false;
  const operations = plan.operations.map((operation) => comparisonFor(operation, operationBinding(operation, observedState.bindings, providerId), providerAvailable));
  const summary = operations.reduce((result, item) => {
    result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, {});
  return {
    plan_id: plan.plan_id,
    project_id: observedState.project_id,
    provider_id: providerId,
    observed_state_id: observedState.id,
    captured_at: observedState.captured_at,
    provider: provider ?? null,
    in_sync: operations.every((item) => item.status === "matched"),
    summary,
    operations,
  };
}

async function compareRecordedPlanWithObservedState({ catalogRoot, planId, observedStateId }) {
  const catalog = await loadCatalog(catalogRoot);
  const planRecord = catalog.activation_plans.find((item) => item.plan_id === planId);
  if (!planRecord) throw new Error(`Activation plan not found: ${planId}`);
  const providerId = planRecord.plan.target.provider_id;
  const observedState = observedStateId
    ? catalog.observed_states.find((item) => item.id === observedStateId)
    : catalog.observed_states
      .filter((item) => item.project_id === planRecord.project_id
        && item.provider_id === providerId
        && item.captured_at >= planRecord.plan.created_at)
      .sort((left, right) => right.captured_at.localeCompare(left.captured_at)
        || right.recorded_at.localeCompare(left.recorded_at))[0];
  if (!observedState) throw new Error(`No observed state found for project/provider: ${planRecord.project_id}/${providerId}`);
  return compareActivationPlanWithObservedState({ plan: planRecord.plan, observedState });
}

module.exports = {
  compareActivationPlanWithObservedState,
  compareRecordedPlanWithObservedState,
  listObservedStates,
  recordObservedState,
};
