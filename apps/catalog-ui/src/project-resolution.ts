import type { Assignment, DisplaySkill, RemoteAssignment, RemoteSet } from "./types";

export function embeddedProjectSnapshot(effectiveSet?: RemoteSet) {
  if (!effectiveSet || effectiveSet.project.preset_assignments === undefined) return null;
  return { effectiveSet, assignments: effectiveSet.project.preset_assignments };
}

export async function resolveProjectSnapshot(
  effectiveSet: RemoteSet,
  loadLegacyAssignments: () => Promise<RemoteAssignment[]>,
) {
  return embeddedProjectSnapshot(effectiveSet) ?? {
    effectiveSet,
    assignments: await loadLegacyAssignments(),
  };
}

export interface SharedBindingImpact {
  provider_id: string;
  display_name: string;
  root_path?: string | null;
  shared: boolean;
  reason?: string | null;
}

export interface ProjectPlanPreview {
  effective_set?: RemoteSet;
  plan: {
    operations: unknown[];
    plan_id?: string;
    distribution?: { shared_root_confirmation?: boolean };
  };
  preflight?: {
    status: string;
    requires_shared_confirmation?: boolean;
    mappings?: Array<{ preview?: { requires_confirmation?: boolean; impacts?: SharedBindingImpact[] } }>;
  } | null;
}

export function projectPreviewRequest(scope: string, pristine: boolean, sharedConsent = false) {
  return {
    work_scope_tags: [scope],
    preset_id: pristine ? "builtin-pristine" : undefined,
    preflight: true,
    distribution: { shared_root_confirmation: sharedConsent },
  };
}

export function sharedPreviewReview(preview: ProjectPlanPreview) {
  const mappings = preview.preflight?.mappings ?? [];
  const requiresConfirmation = preview.preflight?.requires_shared_confirmation === true
    || mappings.some((mapping) => mapping.preview?.requires_confirmation === true);
  const impacts = Array.from(new Map(mappings.flatMap((mapping) => mapping.preview?.impacts ?? [])
    .map((impact) => [JSON.stringify([impact.provider_id, impact.root_path ?? null]), impact])).values());
  return { requiresConfirmation, impacts };
}

export function canApplyProjectPreview(preview: ProjectPlanPreview, sharedConsent: boolean) {
  const review = sharedPreviewReview(preview);
  return Boolean(preview.plan.plan_id && preview.preflight && preview.preflight.status !== "failed" && (
    !review.requiresConfirmation
    || (sharedConsent && review.impacts.length > 0 && preview.plan.distribution?.shared_root_confirmation === true)
  ));
}

export function sharedImpactSignature(impacts: SharedBindingImpact[]) {
  return JSON.stringify(impacts.map((impact) => JSON.stringify([
    impact.provider_id, impact.root_path ?? null, impact.shared,
  ])).sort());
}

export function displayEffectiveSkill(
  skill: RemoteSet["skills"][number],
  assignments: Assignment[],
  pristine = false,
): DisplaySkill {
  const selected = skill.selected_by;
  const selectedRole = selected?.reason === "selected_by_work_scope_overlay"
    ? "work_scope_overlay"
    : selected?.reason === "selected_by_default_template" ? "default" : undefined;
  const assignment = assignments.find((item) =>
    item.preset_id === selected?.preset_id
    && (selected?.template_version === undefined || item.template_version === selected.template_version)
    && (selected?.priority === undefined || item.priority === selected.priority)
    && (!selectedRole || item.role === selectedRole),
  );
  const priority = selected?.priority ?? assignment?.priority;
  const source = skill.override
    ? "Project override"
    : assignment
      ? `${assignment.name ?? assignment.preset_id} · v${assignment.template_version}${priority === undefined ? "" : ` · P${priority}`}`
      : pristine ? "Pristine" : "Catalog";
  const reason = (skill.override ? skill.reason : selected?.reason ?? skill.reason).replaceAll("_", " ");
  const selectionDetails = assignment?.role === "work_scope_overlay"
    ? `; priority ${priority ?? 0}; matching scope: ${assignment.work_scope_tags?.join(", ") || "all scopes"}`
    : "";
  return {
    name: skill.skill_name,
    registry_skill_id: skill.registry_skill_id,
    lineage_id: skill.lineage_id,
    source,
    enabled: skill.desired_state === "enabled",
    reason: `${reason}${selectionDetails}`,
    artifact_type: skill.artifact_type,
    invocation_mode: skill.invocation_mode,
    override: skill.override,
  };
}
