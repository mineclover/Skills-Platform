const crypto = require("node:crypto");
const { getRegistrySkills, getSourceRevision, loadRegistry } = require("./registry");
const { PRISTINE_PRESET_ID, loadCatalog, saveCatalog, mutateCatalog } = require("./catalog-state");

const REVIEW_DECISIONS = new Set(["approved", "rejected"]);

async function recordSourceReview({ catalogRoot, registryRoot, sourceRevisionId, decision, summary, reviewer = "local" }) {
  return mutateCatalog(catalogRoot, async () => {
    if (!REVIEW_DECISIONS.has(decision)) throw new Error("Source review decision is not valid");
    if (typeof summary !== "string" || summary.trim() === "") throw new Error("Source review summary is required");
    const revision = await getSourceRevision(registryRoot, sourceRevisionId);
    const catalog = await loadCatalog(catalogRoot);
    const review = { id: `source_review_${crypto.randomUUID()}`, source_revision_id: revision.id, source_id: revision.source_id, decision, summary: summary.trim(), reviewer: reviewer.trim() || "local", reviewed_at: new Date().toISOString() };
    catalog.source_reviews.push(review);
    await saveCatalog(catalogRoot, catalog);
    return review;
  });
}

async function latestSourceReview({ catalogRoot, sourceRevisionId }) {
  const catalog = await loadCatalog(catalogRoot);
  return latestReviewsByRevision(catalog.source_reviews).get(sourceRevisionId) ?? null;
}

function latestReviewsByRevision(reviews) {
  const latest = new Map();
  for (const review of reviews) {
    const current = latest.get(review.source_revision_id);
    // Reviews are appended. The later decision wins when both were saved in
    // the same millisecond, including approval revocations.
    if (!current || current.reviewed_at.localeCompare(review.reviewed_at) <= 0) latest.set(review.source_revision_id, review);
  }
  return latest;
}

async function listSourceAdoptionCandidates({ catalogRoot, registryRoot }) {
  const [catalog, registry] = await Promise.all([
    loadCatalog(catalogRoot),
    loadRegistry(registryRoot),
  ]);
  const reviews = latestReviewsByRevision(catalog.source_reviews);
  const skillsById = new Map(registry.skills.map((skill) => [skill.id, skill]));
  const importOrder = new Map(registry.skills.map((skill, index) => [skill.id, index]));
  // Registry insertion order resolves equal timestamps without relying on the
  // alphabetical presentation order or opaque revision hashes.
  const compareImports = (left, right) => left.imported_at.localeCompare(right.imported_at)
    || importOrder.get(left.id) - importOrder.get(right.id);
  const latestByLineage = new Map();
  const approvedByLineage = new Map();
  for (const skill of registry.skills) {
    const latest = latestByLineage.get(skill.lineage_id);
    if (!latest || compareImports(latest, skill) < 0) latestByLineage.set(skill.lineage_id, skill);
    if (reviews.get(skill.source_revision_id)?.decision !== "approved") continue;
    const approved = approvedByLineage.get(skill.lineage_id);
    if (!approved || compareImports(approved, skill) < 0) approvedByLineage.set(skill.lineage_id, skill);
  }
  const revisionSummary = (skill) => skill ? {
    registry_skill_id: skill.id,
    source_revision_id: skill.source_revision_id,
    imported_at: skill.imported_at,
    review: reviews.get(skill.source_revision_id) ?? null,
  } : null;
  const candidates = new Map();
  for (const preset of catalog.presets.slice().sort((left, right) => left.name.localeCompare(right.name))) {
    if (preset.id === PRISTINE_PRESET_ID) continue;
    for (const entry of preset.entries) {
      const latest = latestByLineage.get(entry.lineage_id);
      const approved = approvedByLineage.get(entry.lineage_id);
      const current = skillsById.get(entry.registry_skill_id);
      for (const candidate of new Set([latest, approved])) {
        if (!candidate || !current || candidate.source_revision_id === entry.source_revision_id
          || compareImports(candidate, current) <= 0) continue;
        if (!candidates.has(candidate.id)) {
          candidates.set(candidate.id, {
            lineage_id: candidate.lineage_id,
            skill_name: candidate.skill_name,
            ...revisionSummary(candidate),
            candidate_kind: candidate.id === approved?.id ? "latest_approved" : "latest_import",
            latest_import: revisionSummary(latest),
            latest_approved: revisionSummary(approved),
            compatible_presets: [],
          });
        }
        candidates.get(candidate.id).compatible_presets.push({
          id: preset.id,
          name: preset.name,
          selected_version: preset.selected_version,
          current_registry_skill_id: entry.registry_skill_id,
          current_source_revision_id: entry.source_revision_id,
        });
      }
    }
  }
  return [...candidates.values()].sort((left, right) => compareImports(
    skillsById.get(right.registry_skill_id), skillsById.get(left.registry_skill_id),
  ));
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
  return mutateCatalog(catalogRoot, async () => {
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
  });
}

module.exports = {
  REVIEW_DECISIONS,
  adoptApprovedRevisionIntoPreset,
  latestSourceReview,
  listSourceAdoptionCandidates,
  recordSourceReview,
};
