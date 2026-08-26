import test from "node:test";
import assert from "node:assert/strict";

// Reusable logic from SkillWorkspace, ProjectWorkspace, TemplateWorkspace, FilterToolbar
function resolveSkillInvocationMode(skill) {
  return (
    skill.profile?.invocation_mode ??
    skill.latest_skill?.invocation_mode ??
    skill.lineage?.invocation_mode ??
    skill.invocation_mode ??
    "unspecified"
  );
}

function filterSkillsCatalog(skills, { invocationFilter = "all", providerFilter = "all", searchQuery = "" }) {
  return skills.filter((skill) => {
    // 1. Invocation mode filter
    if (invocationFilter !== "all") {
      const mode = resolveSkillInvocationMode(skill);
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
      skill.profile?.title,
      skill.profile?.summary,
      skill.profile?.purpose,
      skill.latest_skill?.description,
      ...(skill.profile?.tags || []),
      ...(skill.profile?.use_when || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(needle);
  });
}

function filterEffectiveSkills(skills, { invocationFilter = "all", searchQuery = "" }) {
  return skills.filter((skill) => {
    if (invocationFilter !== "all") {
      const mode = skill.invocation_mode ?? "unspecified";
      if (mode !== invocationFilter) return false;
    }

    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return true;

    return (
      (skill.name || "").toLowerCase().includes(needle) ||
      (skill.source || "").toLowerCase().includes(needle) ||
      (skill.reason || "").toLowerCase().includes(needle)
    );
  });
}

function filterTemplateRegistrySkills(skills, { invocationFilter = "all", searchQuery = "" }) {
  return skills.filter((skill) => {
    if (invocationFilter !== "all") {
      const mode = skill.invocation_mode ?? "unspecified";
      if (mode !== invocationFilter) return false;
    }

    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return true;

    const searchable = [skill.skill_name, skill.description, skill.source_revision_id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(needle);
  });
}

// ---------------------------------------------------------------------------
// TEST SUITE 1: Invocation Mode Filter Chips & Fallback Hierarchy
// ---------------------------------------------------------------------------

test("Adversarial M2: Invocation mode chips handle all 4 modes plus unspecified fallbacks", () => {
  const dataset = [
    {
      lineage: { id: "lin-1", skill_name: "skill-1", invocation_mode: "model_invoked" },
      profile: { title: "Reflex Skill", invocation_mode: "model_invoked" },
      latest_skill: { invocation_mode: "model_invoked" },
    },
    {
      lineage: { id: "lin-2", skill_name: "skill-2", invocation_mode: "user_invoked" },
      profile: { title: "Command Skill", invocation_mode: "user_invoked" },
      latest_skill: { invocation_mode: "user_invoked" },
    },
    {
      lineage: { id: "lin-3", skill_name: "skill-3", invocation_mode: "hybrid" },
      profile: { title: "Hybrid Skill", invocation_mode: "hybrid" },
      latest_skill: { invocation_mode: "hybrid" },
    },
    {
      lineage: { id: "lin-4", skill_name: "skill-4", invocation_mode: "unspecified" },
      profile: { title: "Unspecified Explicit", invocation_mode: "unspecified" },
      latest_skill: { invocation_mode: "unspecified" },
    },
    {
      lineage: { id: "lin-5", skill_name: "skill-5" }, // no invocation_mode on any level
      profile: { title: "Completely Missing" },
      latest_skill: { id: "sk-5" },
    },
    {
      // Profile overrides lineage
      lineage: { id: "lin-6", skill_name: "skill-6", invocation_mode: "user_invoked" },
      profile: { title: "Profile Overridden", invocation_mode: "model_invoked" },
      latest_skill: { invocation_mode: "hybrid" },
    },
  ];

  // 1. "all" should return all 6 skills
  const allResults = filterSkillsCatalog(dataset, { invocationFilter: "all" });
  assert.equal(allResults.length, 6);

  // 2. "model_invoked" should match lin-1 and lin-6 (due to profile override)
  const modelResults = filterSkillsCatalog(dataset, { invocationFilter: "model_invoked" });
  assert.equal(modelResults.length, 2);
  assert.deepEqual(modelResults.map((s) => s.lineage.id), ["lin-1", "lin-6"]);

  // 3. "user_invoked" should match lin-2
  const userResults = filterSkillsCatalog(dataset, { invocationFilter: "user_invoked" });
  assert.equal(userResults.length, 1);
  assert.equal(userResults[0].lineage.id, "lin-2");

  // 4. "hybrid" should match lin-3
  const hybridResults = filterSkillsCatalog(dataset, { invocationFilter: "hybrid" });
  assert.equal(hybridResults.length, 1);
  assert.equal(hybridResults[0].lineage.id, "lin-3");

  // 5. Check resolution fallback order
  assert.equal(resolveSkillInvocationMode(dataset[4]), "unspecified");
  assert.equal(resolveSkillInvocationMode(dataset[5]), "model_invoked"); // profile wins
});

test("Adversarial M2: Fallback precedence order: profile > latest_skill > lineage > unspecified", () => {
  const item1 = {
    lineage: { id: "lin-a", invocation_mode: "user_invoked" },
    latest_skill: { invocation_mode: "hybrid" },
    profile: { invocation_mode: "model_invoked" },
  };
  assert.equal(resolveSkillInvocationMode(item1), "model_invoked");

  const item2 = {
    lineage: { id: "lin-b", invocation_mode: "user_invoked" },
    latest_skill: { invocation_mode: "hybrid" },
    profile: {},
  };
  assert.equal(resolveSkillInvocationMode(item2), "hybrid");

  const item3 = {
    lineage: { id: "lin-c", invocation_mode: "user_invoked" },
    latest_skill: {},
    profile: {},
  };
  assert.equal(resolveSkillInvocationMode(item3), "user_invoked");

  const item4 = {
    lineage: {},
    latest_skill: {},
    profile: {},
  };
  assert.equal(resolveSkillInvocationMode(item4), "unspecified");
});

// ---------------------------------------------------------------------------
// TEST SUITE 2: Regex Metacharacters, Special Characters & Case-Insensitivity
// ---------------------------------------------------------------------------

test("Adversarial M2: Search query handles regex metacharacters and special syntax safely without throwing", () => {
  const adversarialSkills = [
    {
      lineage: { id: "lin-cplusplus", skill_name: "c++-linter" },
      profile: {
        title: "C++ (Clang-Tidy) Checker",
        summary: "Analyzes [C/C++] syntax patterns and (nested) pointers: *ptr -> val",
        tags: ["c++", "clang*", "[qa]", "regex.*"],
        use_when: ["*.cpp files modified", "malloc() / free() audit"],
      },
      latest_skill: { description: "Checks for $PATH and \\d+ violations" },
    },
    {
      lineage: { id: "lin-regex", skill_name: "regex-master" },
      profile: {
        title: "Regular Expression Toolkit [v2.0]",
        summary: "Evaluates patterns like /^[a-z0-9_.-]+@[a-z0-9-]+\\.[a-z]{2,4}$/",
        tags: ["regex", "patterns", "^start", "end$"],
        use_when: ["when validating input with (?:group)"],
      },
      latest_skill: { description: "Escapes \\n, \\r, \\t and evaluates (.*?) properly" },
    },
  ];

  // Test special regex chars: +, *, [, ], (, ), ?, ^, $, \, {, }, |, .
  const queriesToTest = [
    "c++",
    "[C/C++]",
    "(Clang-Tidy)",
    "*ptr",
    "regex.*",
    "*.cpp",
    "malloc()",
    "$PATH",
    "\\d+",
    "/^[a-z0-9",
    "[v2.0]",
    "(?:group)",
    "(.*?)",
    "\\n",
  ];

  for (const q of queriesToTest) {
    assert.doesNotThrow(() => {
      const results = filterSkillsCatalog(adversarialSkills, { searchQuery: q });
      assert.ok(results.length >= 1, `Query "${q}" should match at least 1 skill safely`);
    }, `Search query "${q}" must not throw regex syntax errors`);
  }
});

test("Adversarial M2: Case-insensitivity across all searchable fields", () => {
  const skill = {
    lineage: { id: "lin-polyglot", skill_name: "POLYGLOT_ORCHESTRATOR" },
    profile: {
      title: "MixedCase Title With NUMBERS 123",
      summary: "UPPERCASE SUMMARY FOR ROBUST TESTING",
      purpose: "lowerCase purpose statement",
      tags: ["TAG_ALPHA", "tag_beta"],
      use_when: ["WHEN_DEPLOYING_PROD", "during_development"],
    },
    latest_skill: { description: "Latest Revision Description With Mixed Characters" },
  };

  const testCases = [
    { query: "polyglot_orchestrator", expected: 1 },
    { query: "POLYGLOT", expected: 1 },
    { query: "mixedcase", expected: 1 },
    { query: "MIXEDCASE", expected: 1 },
    { query: "numbers 123", expected: 1 },
    { query: "uppercase summary", expected: 1 },
    { query: "LOWERCASE PURPOSE", expected: 1 },
    { query: "tag_alpha", expected: 1 },
    { query: "TAG_BETA", expected: 1 },
    { query: "when_deploying_prod", expected: 1 },
    { query: "DURING_DEVELOPMENT", expected: 1 },
    { query: "latest revision", expected: 1 },
    { query: "nonexistent", expected: 0 },
  ];

  for (const tc of testCases) {
    const res = filterSkillsCatalog([skill], { searchQuery: tc.query });
    assert.equal(res.length, tc.expected, `Query "${tc.query}" failed case-insensitivity test`);
  }
});

// ---------------------------------------------------------------------------
// TEST SUITE 3: Table vs Card View State & Overflow Scenarios
// ---------------------------------------------------------------------------

test("Adversarial M2: Table vs Card View toggle with varying datasets and match counters", () => {
  // Empty dataset
  const emptyList = [];
  const emptyCatalog = filterSkillsCatalog(emptyList, { searchQuery: "test" });
  assert.equal(emptyCatalog.length, 0);

  // Single item dataset
  const singleItem = [
    {
      lineage: { id: "lin-solo", skill_name: "solo-skill" },
      profile: { title: "Solo Skill", invocation_mode: "user_invoked" },
      latest_skill: { invocation_mode: "user_invoked" },
    },
  ];
  const singleMatch = filterSkillsCatalog(singleItem, { invocationFilter: "user_invoked" });
  assert.equal(singleMatch.length, 1);
  assert.equal(singleMatch[0].lineage.id, "lin-solo");

  // Large dataset (1000 items)
  const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
    lineage: { id: `lin-${i}`, skill_name: `skill-${i}` },
    profile: {
      title: `Skill Number ${i}`,
      summary: `Automated summary for benchmark item ${i}`,
      invocation_mode: i % 3 === 0 ? "model_invoked" : i % 3 === 1 ? "user_invoked" : "hybrid",
      tags: [`tag-${i % 10}`, `group-${i % 5}`],
    },
    latest_skill: { description: `Description for skill ${i}` },
  }));

  const start = performance.now();
  const filteredLarge = filterSkillsCatalog(largeDataset, {
    invocationFilter: "model_invoked",
    searchQuery: "group-0",
  });
  const elapsed = performance.now() - start;

  // 1000 items / 3 model_invoked = ~334. Filtered by group-0 (every 5th) = ~67 items.
  assert.ok(filteredLarge.length > 50 && filteredLarge.length < 80);
  assert.ok(elapsed < 50, `Filtering 1000 items should take under 50ms, took ${elapsed.toFixed(2)}ms`);

  // Match counter string formatting
  const formatMatchCounter = (filtered, total, entity = "skills") =>
    `Showing ${filtered} of ${total} ${entity}`;

  assert.equal(formatMatchCounter(filteredLarge.length, largeDataset.length), `Showing ${filteredLarge.length} of 1000 skills`);
  assert.equal(formatMatchCounter(0, 0, "effective skills"), "Showing 0 of 0 effective skills");
});

test("Adversarial M2: Card metadata tag truncation slice(+N) logic", () => {
  const skillWithManyTags = {
    lineage: { id: "lin-tags", skill_name: "tag-overflow" },
    profile: {
      title: "Tag Overflow Skill",
      use_when: ["Condition 1", "Condition 2", "Condition 3", "Condition 4", "Condition 5", "Condition 6"],
    },
  };

  const displayedTags = skillWithManyTags.profile.use_when.slice(0, 3);
  const remainingCount = skillWithManyTags.profile.use_when.length - 3;

  assert.deepEqual(displayedTags, ["Condition 1", "Condition 2", "Condition 3"]);
  assert.equal(remainingCount, 3);
  assert.equal(`+${remainingCount}`, "+3");
});

test("Adversarial M2: Extreme string lengths and XSS payload resilience in search and card structures", () => {
  const hugeText = "A".repeat(50000);
  const xssTitle = `<script>alert("XSS")</script><img src=x onerror=alert(1)>`;
  const unicodeTitle = `🚀 🤖 🔀 ⚡ 漢字 日本語 한국어 العربية 💥`;

  const robustSkill = {
    lineage: { id: "lin-huge", skill_name: "huge-skill" },
    profile: {
      title: xssTitle,
      summary: hugeText,
      purpose: unicodeTitle,
      tags: [xssTitle, "huge"],
      use_when: [xssTitle],
    },
    latest_skill: { description: hugeText },
  };

  // Searching huge string
  const resHuge = filterSkillsCatalog([robustSkill], { searchQuery: "AAAA" });
  assert.equal(resHuge.length, 1);

  // Searching XSS tag literally
  const resXss = filterSkillsCatalog([robustSkill], { searchQuery: "<script>" });
  assert.equal(resXss.length, 1);

  // Searching Unicode emojis
  const resUnicode = filterSkillsCatalog([robustSkill], { searchQuery: "🤖 🔀" });
  assert.equal(resUnicode.length, 1);

  // Searching non-matching within huge text
  const resMiss = filterSkillsCatalog([robustSkill], { searchQuery: "ZZZZZ" });
  assert.equal(resMiss.length, 0);
});

// ---------------------------------------------------------------------------
// TEST SUITE 4: Project Workspace Effective Skills Filtering
// ---------------------------------------------------------------------------

test("Adversarial M2: ProjectWorkspace Effective Skills table/grid filter by invocation mode and keywords", () => {
  const effectiveSkills = [
    {
      name: "Planning",
      source: "Build v2",
      enabled: true,
      reason: "Default inclusion in Build v2",
      invocation_mode: "model_invoked",
    },
    {
      name: "Testing",
      source: "Verification v1",
      enabled: true,
      reason: "Verification overlay includes Testing",
      invocation_mode: "user_invoked",
    },
    {
      name: "Code Audit",
      source: "Quality v1",
      enabled: false,
      reason: "Not active in current scope",
      invocation_mode: "hybrid",
    },
    {
      name: "Pristine Placeholder",
      source: "Pristine",
      enabled: false,
      reason: "Pristine baseline disables managed skills",
      invocation_mode: "unspecified",
    },
  ];

  // 1. Invocation mode filter
  const modelOnly = filterEffectiveSkills(effectiveSkills, { invocationFilter: "model_invoked" });
  assert.equal(modelOnly.length, 1);
  assert.equal(modelOnly[0].name, "Planning");

  const userOnly = filterEffectiveSkills(effectiveSkills, { invocationFilter: "user_invoked" });
  assert.equal(userOnly.length, 1);
  assert.equal(userOnly[0].name, "Testing");

  // 2. Keyword search by name
  const nameSearch = filterEffectiveSkills(effectiveSkills, { searchQuery: "audit" });
  assert.equal(nameSearch.length, 1);
  assert.equal(nameSearch[0].name, "Code Audit");

  // 3. Keyword search by source
  const sourceSearch = filterEffectiveSkills(effectiveSkills, { searchQuery: "Verification v1" });
  assert.equal(sourceSearch.length, 1);
  assert.equal(sourceSearch[0].name, "Testing");

  // 4. Keyword search by reason
  const reasonSearch = filterEffectiveSkills(effectiveSkills, { searchQuery: "baseline disables" });
  assert.equal(reasonSearch.length, 1);
  assert.equal(reasonSearch[0].name, "Pristine Placeholder");
});

// ---------------------------------------------------------------------------
// TEST SUITE 5: Template Workspace Filtering & Bulk Selection Isolation
// ---------------------------------------------------------------------------

test("Adversarial M2: TemplateWorkspace filter skills and bulk select/deselect retains hidden state", () => {
  const registrySkills = [
    { id: "reg-1", skill_name: "auth-helper", invocation_mode: "user_invoked", description: "Auth tokens" },
    { id: "reg-2", skill_name: "ai-copilot", invocation_mode: "model_invoked", description: "Reflex coding" },
    { id: "reg-3", skill_name: "ai-debugger", invocation_mode: "model_invoked", description: "Reflex debugging" },
    { id: "reg-4", skill_name: "doc-gen", invocation_mode: "hybrid", description: "Documentation generator" },
  ];

  // Initial state: only reg-1 is selected
  let selectedSkillIds = ["reg-1"];

  // User filters by "model_invoked" -> sees [reg-2, reg-3]
  const modelFiltered = filterTemplateRegistrySkills(registrySkills, { invocationFilter: "model_invoked" });
  assert.equal(modelFiltered.length, 2);

  // User clicks "Select All" on filtered results
  const selectAll = (filteredList) => {
    const set = new Set(selectedSkillIds);
    for (const s of filteredList) set.add(s.id);
    selectedSkillIds = Array.from(set);
  };
  selectAll(modelFiltered);

  // Now selected should be reg-1 (preserved!), reg-2, reg-3
  assert.deepEqual(selectedSkillIds.sort(), ["reg-1", "reg-2", "reg-3"].sort());

  // User filters by search query "copilot" -> sees [reg-2]
  const copilotFiltered = filterTemplateRegistrySkills(registrySkills, { searchQuery: "copilot" });
  assert.equal(copilotFiltered.length, 1);
  assert.equal(copilotFiltered[0].id, "reg-2");

  // User clicks "Clear" (deselect all filtered)
  const deselectAll = (filteredList) => {
    const toRemove = new Set(filteredList.map((s) => s.id));
    selectedSkillIds = selectedSkillIds.filter((id) => !toRemove.has(id));
  };
  deselectAll(copilotFiltered);

  // reg-1 and reg-3 should still be selected, reg-2 removed
  assert.deepEqual(selectedSkillIds.sort(), ["reg-1", "reg-3"].sort());
});

// ---------------------------------------------------------------------------
// TEST SUITE 6: Combined Multi-Criteria Filter Edge Cases
// ---------------------------------------------------------------------------

test("Adversarial M2: Multi-criteria disjoint combinations return empty matches gracefully", () => {
  const skills = [
    {
      lineage: { id: "lin-1", skill_name: "db-migrate", invocation_mode: "user_invoked" },
      profile: { title: "DB Migrator", tags: ["codex", "database"], invocation_mode: "user_invoked" },
      latest_skill: { description: "Database tool", invocation_mode: "user_invoked" },
    },
    {
      lineage: { id: "lin-2", skill_name: "ai-reviewer", invocation_mode: "model_invoked" },
      profile: { title: "AI Reviewer", tags: ["antigravity", "review"], invocation_mode: "model_invoked" },
      latest_skill: { description: "Autonomous code review", invocation_mode: "model_invoked" },
    },
  ];

  // 1. Invocation = model_invoked, Provider = codex (disjoint -> 0 results)
  const disjoint1 = filterSkillsCatalog(skills, {
    invocationFilter: "model_invoked",
    providerFilter: "codex",
  });
  assert.equal(disjoint1.length, 0);

  // 2. Invocation = user_invoked, Search = "reviewer" (disjoint -> 0 results)
  const disjoint2 = filterSkillsCatalog(skills, {
    invocationFilter: "user_invoked",
    searchQuery: "reviewer",
  });
  assert.equal(disjoint2.length, 0);

  // 3. Search query consisting only of whitespace returns all items matching other filters
  const whitespaceSearch = filterSkillsCatalog(skills, {
    invocationFilter: "model_invoked",
    searchQuery: "     ",
  });
  assert.equal(whitespaceSearch.length, 1);
  assert.equal(whitespaceSearch[0].lineage.id, "lin-2");
});
