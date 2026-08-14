const crypto = require("node:crypto");
const { getRegistrySkills, getSourceRevision, listRegistrySkills } = require("./registry");
const { PRISTINE_PRESET_ID, listPresets, loadCatalog, saveCatalog } = require("./catalog-state");

const REVIEW_DECISIONS = new Set(["approved", "rejected"]);

async function recordSourceReview({ catalogRoot, registryRoot, sourceRevisionId, decision, summary, reviewer = "local" }) {
  if (!REVIEW_DECISIONS.has(decision)) throw new Error("Source review decision is not valid");
  if (typeof summary !== "string" || summary.trim() === "") throw new Error("Source review summary is required");
  const revision = await getSourceRevision(registryRoot, sourceRevisionId);
  const catalog = await loadCatalog(catalogRoot);
  const review = { id: `source_review_${crypto.randomUUID()}`, source_revision_id: revision.id, source_id: revision.source_id, decision, summary: summary.trim(), reviewer: reviewer.trim() || "local", reviewed_at: new Date().toISOString() };
  catalog.source_reviews.push(review);
  await saveCatalog(catalogRoot, catalog);
  return review;
}

async function latestSourceReview({ catalogRoot, sourceRevisionId }) {
  const catalog = await loadCatalog(catalogRoot);
  return catalog.source_reviews.filter((item) => item.source_revision_id === sourceRevisionId).sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))[0] ?? null;
}

function latestSkillByLineage(skills) {
  const latest = new Map();
  for (const skill of skills) {
    const current = latest.get(skill.lineage_id);
    if (!current || current.imported_at.localeCompare(skill.imported_at) < 0) latest.set(skill.lineage_id, skill);
  }
  return latest;
}

async function listSourceAdoptionCandidates({ catalogRoot, registryRoot }) {
  const [presets, skills] = await Promise.all([
    listPresets(catalogRoot),
    listRegistrySkills(registryRoot),
  ]);
  const latestByLineage = latestSkillByLineage(skills);
  const candidates = new Map();
  for (const preset of presets) {
    if (preset.id === PRISTINE_PRESET_ID) continue;
    for (const entry of preset.entries) {
      const candidate = latestByLineage.get(entry.lineage_id);
      if (!candidate || candidate.id === entry.registry_skill_id) continue;
      const key = candidate.id;
      if (!candidates.has(key)) {
        candidates.set(key, {
          lineage_id: candidate.lineage_id,
          skill_name: candidate.skill_name,
          registry_skill_id: candidate.id,
          source_revision_id: candidate.source_revision_id,
          imported_at: candidate.imported_at,
          compatible_presets: [],
        });
      }
      candidates.get(key).compatible_presets.push({
        id: preset.id,
        name: preset.name,
        selected_version: preset.selected_version,
        current_registry_skill_id: entry.registry_skill_id,
        current_source_revision_id: entry.source_revision_id,
      });
    }
  }
  return Promise.all([...candidates.values()].map(async (candidate) => ({
    ...candidate,
    review: await latestSourceReview({ catalogRoot, sourceRevisionId: candidate.source_revision_id }),
  }))).then((items) => items.sort((left, right) => right.imported_at.localeCompare(left.imported_at)));
}

function entryFor(skill) {
  return {
    lineage_id: skill.lineage_id,
    source_revision_id: skill.source_revision_id,
    registry_skill_id: skill.id,
    revision_policy: "pinned",
    required: true,
    enabled_by_default: true,
  };
}

async function adoptApprovedRevisionIntoPreset({ catalogRoot, registryRoot, presetId, registrySkillId }) {
  if (presetId === PRISTINE_PRESET_ID) throw new Error("Pristine template cannot adopt a revision");
  const [catalog, candidate] = await Promise.all([
    loadCatalog(catalogRoot),
    getRegistrySkills(registryRoot, [registrySkillId]).then((items) => items[0]),
  ]);
  const review = await latestSourceReview({ catalogRoot, sourceRevisionId: candidate.source_revision_id });
  if (review?.decision !== "approved") throw new Error(`Source revision is not approved for adoption: ${candidate.source_revision_id}`);
  const preset = catalog.presets.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Preset not found: ${presetId}`);
  const current = preset.versions.find((item) => item.version === preset.active_version) ?? preset.versions.at(-1);
  const index = current.entries.findIndex((entry) => entry.lineage_id === candidate.lineage_id);
  if (index < 0) throw new Error("Approved revision can only replace an existing preset skill lineage");
  if (current.entries[index].registry_skill_id === candidate.id) throw new Error("Preset already uses this approved revision");
  const entries = current.entries.map((entry, itemIndex) => itemIndex === index ? entryFor(candidate) : { ...entry });
  const nextVersion = Math.max(...preset.versions.map((item) => item.version)) + 1;
  const snapshot = {
    version: nextVersion,
    registry_skill_ids: entries.map((entry) => entry.registry_skill_id),
    entries,
    description: current.description,
    purpose: current.purpose,
    work_scope_tags: [...current.work_scope_tags],
    template_notes: current.template_notes.map((note) => ({ ...note })),
    adoption: { source_review_id: review.id, source_revision_id: candidate.source_revision_id, lineage_id: candidate.lineage_id, adopted_at: new Date().toISOString() },
    created_at: new Date().toISOString(),
  };
  preset.versions.push(snapshot);
  preset.active_version = nextVersion;
  preset.registry_skill_ids = snapshot.registry_skill_ids;
  preset.entries = snapshot.entries;
  preset.updated_at = snapshot.created_at;
  await saveCatalog(catalogRoot, catalog);
  return { preset_id: preset.id, selected_version: nextVersion, adopted: snapshot.adoption };
}

module.exports = {
  REVIEW_DECISIONS,
  adoptApprovedRevisionIntoPreset,
  latestSourceReview,
  listSourceAdoptionCandidates,
  recordSourceReview,
};
