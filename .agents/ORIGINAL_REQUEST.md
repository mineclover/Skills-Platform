# Original User Request

## 2026-08-26T23:16:48Z

Enhance and modernize the Skills Platform web UI (apps/catalog-ui) by adding a dedicated Skill Recipe Hub for portable export/import/apply workflows across machines, overhauling workspace layouts with modern design system components and invocation/provider visual indicators, and polishing real-time activation diagnostics.

Working directory: C:\Users\minec\Skills-Platform
Integrity mode: development

## Requirements

### R1. Recipe Hub & Transfer Workspace
Create a dedicated Recipe Workspace and modal flows in apps/catalog-ui allowing users to:
- Export current catalog templates or project configurations into a formatted, downloadable recipe.json.
- Upload or drag-and-drop external recipe.json files to inspect sources, skills breakdown, invocation modes, and preset structures.
- Apply recipes directly to existing or new project targets with selected assistant providers (Codex, Antigravity, Claude) with live preview and confirmed execution.

### R2. Workspace Layout & Navigation Modernization
- Modernize the navigation and layout across all workspaces (ProjectWorkspace, SkillWorkspace, TemplateWorkspace, ReviewQueue, LiveActivationStatus).
- Implement responsive quick-filter toolbars (filter by invocation mode: 🤖 Model-invoked / Reflex, 👤 User-invoked / Command, 🔀 Hybrid; filter by provider; search by tag/keyword).
- Provide streamlined table/card views with inline profile editing and note inspection.

### R3. Multi-Provider & Invocation Visual Identity
- Refine visual badges, tooltips, and status pills for invocation modes and assistant providers.
- Display clear indicators showing active delivery paths (e.g., .agents/skills/ for Antigravity vs skills/ for Codex).
- Visual indicator for Pristine reset and dirty/drift states.

### R4. Real-time Activation Diagnostics & Progress
- Enhance the Live Activation drawer and progress modal with clean visual step indicators (Plan → Inspect → Preview → Materialize → Verify).
- Surface binding drift warnings and verification summaries with actionable reconciliation buttons.

## Acceptance Criteria

### Recipe Management
- [ ] UI provides a 1-click "Export Recipe" button that triggers browser download of valid recipe.json matching @skills-platform/contracts schema.
- [ ] UI provides a Recipe Inspector panel that parses uploaded/pasted JSON and displays valid summary metrics (sources count, skills breakdown by invocation mode, presets).
- [ ] User can apply an inspected recipe to a project with one click and receive confirmation feedback.

### Workspaces & Design System
- [ ] All workspaces render without layout shifting or truncated controls across standard desktop screen resolutions.
- [ ] Invocation mode filter chips accurately filter skills in SkillWorkspace and TemplateWorkspace.
- [ ] Dark/light styling is harmonious and consistent across cards, modals, tables, and buttons.

### Code Quality & Build Verification
- [ ] npm run check passes with 0 TypeScript/type errors across all workspaces (apps/catalog-ui, apps/skills-catalog, packages/*).
- [ ] npm run build generates clean production assets in apps/catalog-ui/dist.
- [ ] npm test runs all unit tests with 100% pass rate.
