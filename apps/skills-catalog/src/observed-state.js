const crypto = require("node:crypto");
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

function normalizedPath(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  return path.resolve(value).toLowerCase();
}

function operationBinding(operation, bindings, providerId) {
  const deliveryPath = normalizedPath(operation.delivery_path);
  return bindings.find((binding) => binding.provider_id === providerId && normalizedPath(binding.target_path) === deliveryPath) ?? null;
}

function comparisonFor(operation, binding, providerAvailable) {
  if (!providerAvailable) return { operation, binding, status: "provider_unavailable", reason: "Provider is not detected or reachable in the observed snapshot." };
  if (operation.desired_state === "enabled") {
    if (!binding) return { operation, binding: null, status: "missing", reason: "No observed binding targets the planned delivery path." };
    if (binding.state === "enabled") return { operation, binding, status: "matched", reason: "Observed binding is enabled at the planned delivery path." };
    if (binding.state === "disabled") return { operation, binding, status: "disabled", reason: "Observed binding is disabled." };
    return { operation, binding, status: "conflict", reason: binding.reason ?? `Observed binding state is ${binding.state}.` };
  }
  if (!binding || binding.state === "disabled" || binding.state === "missing") {
    return { operation, binding, status: "matched", reason: "Observed state satisfies the disabled delivery intent." };
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
      .filter((item) => item.project_id === planRecord.project_id && item.provider_id === providerId)
      .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))[0];
  if (!observedState) throw new Error(`No observed state found for project/provider: ${planRecord.project_id}/${providerId}`);
  return compareActivationPlanWithObservedState({ plan: planRecord.plan, observedState });
}

module.exports = {
  compareActivationPlanWithObservedState,
  compareRecordedPlanWithObservedState,
  listObservedStates,
  recordObservedState,
};
