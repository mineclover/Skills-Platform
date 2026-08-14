const crypto = require("node:crypto");
const { getSourceRevision } = require("./registry");
const { loadCatalog, saveCatalog } = require("./catalog-state");

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

module.exports = { REVIEW_DECISIONS, latestSourceReview, recordSourceReview };
