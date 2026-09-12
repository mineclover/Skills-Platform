import { filterSkillSearchEntries, type SkillSearchFilters } from "@skills-platform/contracts/skill-search";
import type { CatalogSkill } from "./types";

export interface WorkspaceSkillFilters extends Omit<SkillSearchFilters, "query" | "providerId" | "invocationMode"> {
  searchQuery?: string;
  providerFilter?: string;
  invocationFilter?: string;
}

export function filterWorkspaceSkills(
  skills: readonly CatalogSkill[],
  { searchQuery = "", providerFilter = "all", invocationFilter = "all", ...facets }: WorkspaceSkillFilters = {},
): CatalogSkill[] {
  return filterSkillSearchEntries(skills, {
    ...facets,
    query: searchQuery,
    providerId: providerFilter === "all" ? undefined : providerFilter,
    invocationMode: invocationFilter === "all" ? undefined : invocationFilter,
  });
}
