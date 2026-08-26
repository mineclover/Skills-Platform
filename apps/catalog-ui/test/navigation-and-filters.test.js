import test from "node:test";
import assert from "node:assert/strict";

// Navigation tabs specification
const NAVIGATION_TABS = [
  { label: "Skills", icon: "Database", tooltip: "Managed skills, immutable profiles & notes" },
  { label: "Templates", icon: "FileText", tooltip: "Versioned skill membership & recipe export" },
  { label: "Projects", icon: "ClipboardCheck", tooltip: "Project policy, effective skills & activation" },
  { label: "Recipes", icon: "Layers", tooltip: "Recipe hub, export/import & multi-provider apply" },
];

test("Navigation: Defined tabs include Skills, Templates, Projects, and Recipes", () => {
  const tabLabels = NAVIGATION_TABS.map((t) => t.label);
  assert.deepEqual(tabLabels, ["Skills", "Templates", "Projects", "Recipes"]);
  for (const tab of NAVIGATION_TABS) {
    assert.ok(tab.icon, `Tab ${tab.label} must have an icon`);
    assert.ok(tab.tooltip, `Tab ${tab.label} must have a tooltip`);
  }
});

test("Navigation: Active page resolution and switching logic", () => {
  let activePage = "Projects";
  const navigateTo = (page) => {
    if (NAVIGATION_TABS.some((t) => t.label === page)) {
      activePage = page;
    }
  };

  navigateTo("Skills");
  assert.equal(activePage, "Skills");

  navigateTo("Recipes");
  assert.equal(activePage, "Recipes");

  navigateTo("InvalidTab");
  assert.equal(activePage, "Recipes"); // Should remain unchanged
});

// Sample skills dataset for filter unit tests
const sampleSkills = [
  {
    lineage: { id: "lin-planning", skill_name: "planning", invocation_mode: "model_invoked" },
    profile: {
      title: "Task Planning",
      summary: "Autonomous task planner and decomposition",
      purpose: "Break down engineering tasks",
      review_state: "reviewed",
      invocation_mode: "model_invoked",
      risk_level: "low",
      tags: ["planning", "antigravity", "reasoning"],
      use_when: ["Before coding", "During design"],
    },
    latest_skill: {
      id: "sk-1",
      source_revision_id: "rev123456789abc",
      description: "Autonomous reasoning routine for Antigravity",
      invocation_mode: "model_invoked",
    },
  },
  {
    lineage: { id: "lin-testing", skill_name: "testing", invocation_mode: "user_invoked" },
    profile: {
      title: "Unit & Integration Testing",
      summary: "Human steering testing commands",
      purpose: "Run test suites and audits",
      review_state: "reviewed",
      invocation_mode: "user_invoked",
      risk_level: "medium",
      tags: ["testing", "codex", "qa"],
      use_when: ["After implementation", "Before PR"],
    },
    latest_skill: {
      id: "sk-2",
      source_revision_id: "rev234567890def",
      description: "User invoked test suite runner for Codex",
      invocation_mode: "user_invoked",
    },
  },
  {
    lineage: { id: "lin-code-review", skill_name: "code-review", invocation_mode: "hybrid" },
    profile: {
      title: "Code Reviewer",
      summary: "Automated and interactive review policy",
      purpose: "Ensure code quality and style standards",
      review_state: "unreviewed",
      invocation_mode: "hybrid",
      risk_level: "low",
      tags: ["review", "claude", "quality"],
      use_when: ["During PR review"],
    },
    latest_skill: {
      id: "sk-3",
      source_revision_id: "rev345678901ghi",
      description: "Hybrid automated + user feedback review assistant",
      invocation_mode: "hybrid",
    },
  },
  {
    lineage: { id: "lin-deprecated-db", skill_name: "legacy-db", invocation_mode: "unspecified" },
    profile: {
      title: "Legacy DB Migration",
      summary: "Old database schema updater",
      purpose: "Migrate legacy tables",
      review_state: "deprecated",
      invocation_mode: "unspecified",
      risk_level: "high",
      tags: ["db", "legacy"],
      use_when: ["Deprecated workflows"],
    },
    latest_skill: {
      id: "sk-4",
      source_revision_id: "rev456789012jkl",
      description: "Deprecated database tool",
      invocation_mode: "unspecified",
    },
  },
];

// Reusable filter function implementing FilterToolbar logic
function filterSkills(skills, { invocationFilter = "all", providerFilter = "all", searchQuery = "" }) {
  return skills.filter((skill) => {
    // 1. Invocation mode filter
    if (invocationFilter !== "all") {
      const mode =
        skill.profile?.invocation_mode ??
        skill.latest_skill?.invocation_mode ??
        skill.lineage?.invocation_mode ??
        skill.invocation_mode ??
        "unspecified";
      if (mode !== invocationFilter) return false;
    }

    // 2. Provider filter
    if (providerFilter !== "all") {
      const tags = (skill.profile?.tags || []).map((t) => t.toLowerCase());
      const desc = (skill.latest_skill?.description || "").toLowerCase();
      const prov = providerFilter.toLowerCase();
      const matches =
        tags.some((t) => t.includes(prov)) ||
        desc.includes(prov) ||
        (skill.lineage?.id || "").toLowerCase().includes(prov);
      if (!matches) return false;
    }

    // 3. Search query
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return true;

    const searchable = [
      skill.lineage?.skill_name,
      skill.name,
      skill.profile?.title,
      skill.profile?.summary,
      skill.profile?.purpose,
      skill.latest_skill?.description,
      skill.reason,
      skill.source,
      ...(skill.profile?.tags || []),
      ...(skill.profile?.use_when || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(needle);
  });
}

test("FilterToolbar: Invocation mode chip filtering works accurately", () => {
  const allResults = filterSkills(sampleSkills, { invocationFilter: "all" });
  assert.equal(allResults.length, 4);

  const modelResults = filterSkills(sampleSkills, { invocationFilter: "model_invoked" });
  assert.equal(modelResults.length, 1);
  assert.equal(modelResults[0].lineage.skill_name, "planning");

  const userResults = filterSkills(sampleSkills, { invocationFilter: "user_invoked" });
  assert.equal(userResults.length, 1);
  assert.equal(userResults[0].lineage.skill_name, "testing");

  const hybridResults = filterSkills(sampleSkills, { invocationFilter: "hybrid" });
  assert.equal(hybridResults.length, 1);
  assert.equal(hybridResults[0].lineage.skill_name, "code-review");
});

test("FilterToolbar: Provider dropdown filtering works accurately", () => {
  const allProviders = filterSkills(sampleSkills, { providerFilter: "all" });
  assert.equal(allProviders.length, 4);

  const antigravityResults = filterSkills(sampleSkills, { providerFilter: "antigravity" });
  assert.equal(antigravityResults.length, 1);
  assert.equal(antigravityResults[0].lineage.skill_name, "planning");

  const codexResults = filterSkills(sampleSkills, { providerFilter: "codex" });
  assert.equal(codexResults.length, 1);
  assert.equal(codexResults[0].lineage.skill_name, "testing");

  const claudeResults = filterSkills(sampleSkills, { providerFilter: "claude" });
  assert.equal(claudeResults.length, 1);
  assert.equal(claudeResults[0].lineage.skill_name, "code-review");
});

test("FilterToolbar: Keyword and tag search query filtering", () => {
  // Search by skill title
  const titleSearch = filterSkills(sampleSkills, { searchQuery: "Task Planning" });
  assert.equal(titleSearch.length, 1);
  assert.equal(titleSearch[0].lineage.skill_name, "planning");

  // Search by use_when condition
  const tagSearch = filterSkills(sampleSkills, { searchQuery: "Before coding" });
  assert.equal(tagSearch.length, 1);
  assert.equal(tagSearch[0].lineage.skill_name, "planning");

  // Search by summary keyword
  const summarySearch = filterSkills(sampleSkills, { searchQuery: "steering" });
  assert.equal(summarySearch.length, 1);
  assert.equal(summarySearch[0].lineage.skill_name, "testing");

  // Search by non-matching query
  const emptySearch = filterSkills(sampleSkills, { searchQuery: "nonexistent_skill_keyword" });
  assert.equal(emptySearch.length, 0);

  // Search with leading/trailing whitespace
  const trimmedSearch = filterSkills(sampleSkills, { searchQuery: "   quality   " });
  assert.equal(trimmedSearch.length, 1);
  assert.equal(trimmedSearch[0].lineage.skill_name, "code-review");
});

test("FilterToolbar: Combined multi-criteria filtering pipeline", () => {
  // Model invoked + Antigravity + "planning"
  const combo1 = filterSkills(sampleSkills, {
    invocationFilter: "model_invoked",
    providerFilter: "antigravity",
    searchQuery: "planning",
  });
  assert.equal(combo1.length, 1);
  assert.equal(combo1[0].lineage.skill_name, "planning");

  // Model invoked + Codex -> 0 matches (testing is user_invoked)
  const combo2 = filterSkills(sampleSkills, {
    invocationFilter: "model_invoked",
    providerFilter: "codex",
  });
  assert.equal(combo2.length, 0);
});

test("View Mode: Table and Grid view mode state toggling and match counter formatting", () => {
  let viewMode = "table";
  const toggleViewMode = (mode) => {
    if (mode === "table" || mode === "grid") {
      viewMode = mode;
    }
  };

  assert.equal(viewMode, "table");
  toggleViewMode("grid");
  assert.equal(viewMode, "grid");
  toggleViewMode("table");
  assert.equal(viewMode, "table");

  // Match counter calculation
  const totalCount = sampleSkills.length;
  const filtered = filterSkills(sampleSkills, { invocationFilter: "model_invoked" });
  const formatCounter = (filteredCount, total, entity = "skills") =>
    `Showing ${filteredCount} of ${total} ${entity}`;

  assert.equal(formatCounter(filtered.length, totalCount), "Showing 1 of 4 skills");
  assert.equal(formatCounter(totalCount, totalCount, "effective skills"), "Showing 4 of 4 effective skills");
});

test("Template Composition: Skill membership selection and bulk operations with filtering", () => {
  let selectedSkillIds = ["lin-planning"];

  const toggleSkill = (skillId) => {
    if (selectedSkillIds.includes(skillId)) {
      selectedSkillIds = selectedSkillIds.filter((id) => id !== skillId);
    } else {
      selectedSkillIds = [...selectedSkillIds, skillId];
    }
  };

  const selectAll = (skillsList) => {
    const set = new Set(selectedSkillIds);
    for (const s of skillsList) set.add(s.lineage.id);
    selectedSkillIds = Array.from(set);
  };

  const deselectAll = (skillsList) => {
    const toRemove = new Set(skillsList.map((s) => s.lineage.id));
    selectedSkillIds = selectedSkillIds.filter((id) => !toRemove.has(id));
  };

  // Toggle skill on/off
  toggleSkill("lin-testing");
  assert.deepEqual(selectedSkillIds, ["lin-planning", "lin-testing"]);

  toggleSkill("lin-planning");
  assert.deepEqual(selectedSkillIds, ["lin-testing"]);

  // Select all from filtered list
  const filtered = filterSkills(sampleSkills, { invocationFilter: "hybrid" });
  selectAll(filtered);
  assert.ok(selectedSkillIds.includes("lin-code-review"));
  assert.ok(selectedSkillIds.includes("lin-testing"));

  // Deselect all from filtered list
  deselectAll(filtered);
  assert.ok(!selectedSkillIds.includes("lin-code-review"));
  assert.ok(selectedSkillIds.includes("lin-testing"));
});
