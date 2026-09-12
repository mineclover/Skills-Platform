/** Browser-safe search contract shared by the Catalog API, CLI, and workspace. */
export interface SkillSearchEntry {
  lineage: { id: string; skill_name: string };
  latest_skill?: { description?: string | null } | null;
  profile: {
    title?: string | null;
    summary?: string | null;
    purpose?: string | null;
    artifact_type?: string;
    invocation_mode?: string;
    use_when?: string[];
    avoid_when?: string[];
    tags?: string[];
    domains?: string[];
    provider_constraints?: string[];
    review_state?: string;
  };
  notes?: Array<{ body?: string; deleted_at?: string | null }>;
}

export interface SkillSearchFilters {
  query?: string;
  tags?: string[];
  domains?: string[];
  providerId?: string;
  reviewState?: string;
  artifactType?: string;
  invocationMode?: string;
}

function normalizedList(value: string[] | undefined, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return [...new Set(value.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`${field} must contain non-empty strings`);
    }
    return item.trim();
  }))];
}

/**
 * Text search uses profile metadata, revision descriptions, and active note bodies.
 * Facets match exact values; an empty provider constraint list means unknown and
 * never supplies evidence that a skill supports a specific provider.
 * Case folding and title ordering are independent of the host's default locale.
 */
export function filterSkillSearchEntries<T extends SkillSearchEntry>(
  entries: readonly T[],
  { query = "", tags, domains, providerId, reviewState, artifactType, invocationMode }: SkillSearchFilters = {},
): T[] {
  const queryText = query.trim().toLowerCase();
  const expectedTags = normalizedList(tags, "tags");
  const expectedDomains = normalizedList(domains, "domains");
  return entries.filter((entry) => {
    const profile = entry.profile;
    if (artifactType && profile.artifact_type !== artifactType) return false;
    if (invocationMode && profile.invocation_mode !== invocationMode) return false;
    if (expectedTags.some((tag) => !(profile.tags ?? []).includes(tag))) return false;
    if (expectedDomains.some((domain) => !(profile.domains ?? []).includes(domain))) return false;
    if (providerId && !(profile.provider_constraints ?? []).includes(providerId)) return false;
    if (reviewState && profile.review_state !== reviewState) return false;
    if (!queryText) return true;
    const haystack = [
      entry.lineage.skill_name,
      profile.artifact_type,
      profile.invocation_mode,
      entry.latest_skill?.description,
      profile.title,
      profile.summary,
      profile.purpose,
      ...(profile.use_when ?? []),
      ...(profile.avoid_when ?? []),
      ...(profile.tags ?? []),
      ...(profile.domains ?? []),
      ...(entry.notes ?? []).filter((note) => !note.deleted_at).map((note) => note.body),
    ].filter(Boolean).join("\n").toLowerCase();
    return haystack.includes(queryText);
  }).sort((left, right) =>
    (left.profile.title || left.lineage.skill_name).localeCompare(right.profile.title || right.lineage.skill_name, "en")
    || left.lineage.id.localeCompare(right.lineage.id, "en"));
}
