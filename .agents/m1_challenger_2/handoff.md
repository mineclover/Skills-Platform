# Verification & Adversarial Test Report: Recipe Apply & Multi-Provider Mappings

## 1. Observation

### Codebase Inspection
- **Provider Delivery Path Logic** (`apps/skills-catalog/src/catalog-state.js` lines 180-191):
  ```javascript
  function defaultDeliveryRoot(providerId, projectPath) {
    if (!projectPath) return path.resolve("skills");
    const base = path.resolve(projectPath);
    const normalized = (providerId ?? "").toLowerCase();
    if (normalized === "antigravity" || normalized === "agy" || normalized === "gemini") {
      return path.join(base, ".agents", "skills");
    }
    if (normalized === "claude") {
      return path.join(base, ".claude", "skills");
    }
    return path.join(base, "skills");
  }
  ```
- **UI Delivery Path Resolution Preview** (`apps/catalog-ui/src/components/RecipeWorkspace.tsx` lines 401-413):
  ```typescript
  const deliveryPathExample = useMemo(() => {
    const cleanPath = targetProjectPath.replace(/[\\/]+$/, "");
    switch (selectedProvider) {
      case "antigravity":
        return `${cleanPath}/.agents/skills/<skill_name>/`;
      case "claude":
        return `${cleanPath}/.claude/skills/<skill_name>/`;
      case "codex":
      default:
        return `${cleanPath}/skills/<skill_name>/`;
    }
  }, [targetProjectPath, selectedProvider]);
  ```
- **Preview vs Confirmed Execution Invariant** (`apps/skills-catalog/src/recipes.js` lines 303-322):
  ```javascript
  const adapter = require("@skills-platform/skills-manager-adapter");
  if (!confirm) {
    const preview = await adapter.previewActivationPlan(plan);
    deliveryResult = {
      project_id: project.id,
      preview,
      applied: false,
      message: "Preview ready. Pass --confirm to apply delivery bindings.",
    };
  } else {
    const report = await adapter.applyActivationPlan(plan, { confirm: true });
    ...
  }
  ```
- **REST Endpoints** (`apps/skills-catalog/src/server.js` lines 454-480):
  - `GET /api/recipes/export`
  - `POST /api/recipes/inspect`
  - `POST /api/recipes/apply`

### Adversarial Empirical Test Execution
A dedicated adversarial test suite was authored and executed in `apps/skills-catalog/test/recipe-adversarial-empirical.test.js`:
- Command: `node --test apps/skills-catalog/test/recipe-adversarial-empirical.test.js`
- Result:
  ```
  TAP version 13
  ok 1 - Empirical: Provider Mappings correctly materialize into provider-specific delivery paths (330.15ms)
  ok 2 - Empirical: Provider aliases (AGY, Gemini, CLAUDE, Codex) resolve to correct delivery directories (351.07ms)
  ok 3 - Empirical: Preview vs Confirmed apply invariant holds (no disk mutations on preview) (158.26ms)
  ok 4 - Empirical: Repeated recipe apply is idempotent and reconciles existing project & presets (184.24ms)
  ok 5 - Empirical: Missing project_path applies recipe to catalog/registry only without delivery (87.85ms)
  ok 6 - Empirical: Invalid recipe manifest throws descriptive validation issues (37.57ms)
  ok 7 - Empirical: HTTP Server REST endpoint handles preview, confirm, multi-provider, and errors (241.88ms)
  # tests 7
  # pass 7
  # fail 0
  ```

### Project-Wide Verification Commands
1. `npm run check` $\rightarrow$ Exit Code 0 (0 type errors across `@skills-platform/catalog`, `@skills-platform/catalog-ui`, `@skills-platform/contracts`, `@skills-platform/skills-manager-adapter`).
2. `npm run build` $\rightarrow$ Exit Code 0 (Production build created in `apps/catalog-ui/dist/` with 0 warnings/errors).
3. `npm test` $\rightarrow$ Exit Code 0 (61 total unit & integration tests passing across all packages and apps).

---

## 2. Logic Chain

1. **Provider Mapping Invariant**:
   - `antigravity` (and aliases `agy`, `gemini`) resolves directly to `<project_path>/.agents/skills/`.
   - `codex` resolves to `<project_path>/skills/`.
   - `claude` resolves to `<project_path>/.claude/skills/`.
   - Direct empirical disk assertions confirmed that applying a recipe with each provider id materializes skills (`SKILL.md`) exclusively in the designated delivery root, leaving other provider folders uncreated.

2. **Preview vs Confirmed Execution Safety Invariant**:
   - When `confirm: false` is passed to `applyRecipe` or `POST /api/recipes/apply`:
     - Operations are planned and returned in `delivery.preview.operations`.
     - `delivery.applied` is `false`.
     - Empirical `fs.stat` assertions confirmed that neither `.agents/`, `.claude/`, nor `skills/` directories are created on disk.
   - When `confirm: true` is passed:
     - Operations are executed through the skills manager adapter.
     - `delivery.applied` is `true`.
     - Verified symlinks and target skill files exist and are readable on disk.

3. **Missing Target Path & Error Handling**:
   - When `project_path` is omitted (null or undefined):
     - The recipe sources and presets are imported and reconciled in the catalog/registry.
     - `delivery` is returned as `null` without throwing exceptions or corrupting state.
   - When malformed/invalid recipe JSON is provided:
     - Schema validation catches issues early and returns HTTP 400 with a detailed list of schema violation fields.

4. **Idempotence & Re-application**:
   - Re-applying a recipe onto an existing project updates the preset definitions without duplicate project collision errors.

---

## 3. Caveats

- **No caveats.** The implementation conforms strictly to `PROJECT.md` specifications, interfaces, and delivery contracts across all providers.

---

## 4. Conclusion

**Verdict: APPROVE**

All requirements of the Recipe Apply flow, multi-provider mappings (`codex`, `antigravity`, `claude`), live preview vs confirmed materialization, and missing target path resilience were empirically tested and confirmed functional.

---

## 5. Verification Method

To independently reproduce and verify all results:

```powershell
# 1. Type check all workspaces
npm run check

# 2. Build production assets
npm run build

# 3. Run all test suites across workspaces
npm test

# 4. Run adversarial empirical test harness specifically
node --test apps/skills-catalog/test/recipe-adversarial-empirical.test.js
```
