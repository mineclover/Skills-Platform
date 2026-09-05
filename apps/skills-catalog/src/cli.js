#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  createPlanFromRegistry,
  adoptApprovedRevisionIntoPreset,
  createEvaluationCase,
  addSkillFeedback,
  addPresetTemplateNote,
  addSkillNote,
  analyzeSkillRevision,
  createSkillAnnotation,
  deleteSkillAnnotation,
  latestSourceReview,
  deleteSkillNote,
  diffSkillRevisions,
  editSkillNote,
  getPreset,
  getSkillProfile,
  getSkillFeedbackSummary,
  getSkillEvaluationSummary,
  createPreset,
  createProject,
  clearProjectSkillOverride,
  createProjectPlan,
  clonePresetTemplate,
  comparePresetVersions,
  compareRecordedPlanWithObservedState,
  defaultRegistryRoot,
  buildSystemPrompt,
  assignPreset,
  exportActivationPlan,
  importLocalSource,
  importGitSource,
  inspectLocalSource,
  listPresets,
  listProjects,
  listRegistrySkills,
  listSourceUpdateCandidates,
  listSkillRevisions,
  listSkillNotes,
  listSkillAnnotations,
  listSkillAnalyses,
  listSkillFeedback,
  listEvaluationCases,
  listEvaluationRuns,
  listReviewQueue,
  listObservedStates,
  listActivationHistory,
  recordActivationPlan,
  recordActivationReport,
  resolveProjectSelection,
  searchSkills,
  startCatalogServer,
  setProjectSkillOverride,
  recordSourceReview,
  recordEvaluationRun,
  recordObservedState,
  resolveProjectEffectiveSet,
  restoreSkillNote,
  restoreSkillAnnotation,
  updateEvaluationCase,
  updatePresetTemplate,
  updateSkillProfile,
  updateSkillAnnotation,
  applyRecipe,
  exportRecipe,
  inspectRecipe,
  checkSkillUpdates,
  applySkillUpdates,
  rollbackSkillUpdate,
  listBackupSnapshots,
  loadUpstreamChannels,
  registerUpstreamChannel,
  removeUpstreamChannel,
  checkChannelStatus,
  syncChannelRoute,
  createPlan,
  getPlan,
  listPlans,
  deletePlan,
  transitionObligation,
  recordPlanVerification,
  issuePlanCertificate,
  calculatePlanGap,
  getReadyObligations,
  freezeSkillPackage,
  getProjectSkillStatus,
  initializeSkillPackage,
  inspectSkillPackage,
  linkProjectSkill,
  listSkillAuthoringRulesets,
} = require(".");

const MULTI_VALUE_FLAGS = new Set([
  "skill", "use-when", "avoid-when", "tag", "domain", "work-scope",
  "maintainer", "provider", "runtime", "criterion",
  "owned", "owned-file", "owned-files",
  "prohibited", "prohibited-action", "prohibited-actions",
  "acceptance", "acceptance-criterion", "acceptance-criteria",
  "dependency", "dependencies", "guard", "resource", "resources", "interface",
]);

function parseArguments(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const name = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[name] = true;
      continue;
    }
    index += 1;
    if (MULTI_VALUE_FLAGS.has(name)) {
      flags[name] = [...(flags[name] ?? []), next];
    } else {
      flags[name] = next;
    }
  }
  return { positional, flags };
}

function usage() {
  return [
    "Usage:",
    "  skills-catalog sync <skill-path-or-name> [--project <id>] [--provider <id>] [--confirm] [--copy]",
    "  skills-catalog import-local <source-path> [--registry <path>] [--skill <name>]...",
    "  skills-catalog import-git <repository> [--ref <commit-or-ref>] [--registry <path>] [--skill <name>]...",
    "  skills-catalog source inspect <source-path> | source updates [--registry <path>]",
    "  skills-catalog source review approve|reject <source-revision-id> --summary <text>",
    "  skills-catalog serve [--catalog <path>] [--registry <path>] [--host <host>] [--port <n>]",
    "  skills-catalog list [--registry <path>]",
    "  skills-catalog workspace spawn --procedure <type> --task <id> --recipe <recipe_path>",
    "      [--preset <preset_id>] [--test <target_test>] [--owned <file>]... [--prohibited <action>]... [--acceptance <crit>]...",
    "  skills-catalog workspace list [--status <status>]",
    "  skills-catalog workspace verify --task <id>",
    "  skills-catalog workspace merge --task <id> [--force]",
    "  skills-catalog workspace prune --task <id>",
    "  skills-catalog project add <id> --name <name> --path <path> --provider <id> [--delivery-root <path>] [--upstream-project-id <id>]",
    "  skills-catalog project list | project resolve <id> [--preset <id>] [--work-scope <tag>]...",
    "  skills-catalog project apply <id> [--confirm] [--preset <id>] [--work-scope <tag>]... [--enabled-only] [--copy]",
    "  skills-catalog project link <project-id> <skill-name> [--version <semver>] [--latest]",
    "  skills-catalog project status <project-id>",
    "  skills-catalog project skill <project-id> enable|disable <lineage-id> --skill <registry-skill-id>",
    "  skills-catalog project skill <project-id> inherit <lineage-id>",
    "  skills-catalog preset create <id> --name <name> --skill <registry-skill-id>...",
    "  skills-catalog preset show <id> [--version <n>] | preset update <id> [--skill <id>]...",
    "  skills-catalog preset clone <source-id> <new-id> --name <name> | preset compare <id> <left> <right>",
    "  skills-catalog preset note add <id> --body <text> | preset assign <project-id> <preset-id> [--version <n>]",
    "  skills-catalog preset adopt <preset-id> --skill <approved-registry-skill-id>",
    "      [--role default|recommended|work_scope_overlay] [--priority <n>] [--work-scope <tag>]...",
    "  skills-catalog project-plan <project-id> [--preset <id>] [--work-scope <tag>]... [--enabled-only] [--copy] [--out <file>]",
    "  skills-catalog history record-plan <project-id> [--preset <id>] [--work-scope <tag>]... [--copy]",
    "  skills-catalog history record-report <plan-id> --file <adapter-report.json> | history list [--project-id <id>]",
    "  skills-catalog system-prompt --preset <id>",
    "  skills-catalog skill list | skill search [query] [--tag <tag>] [--provider <id>]",
    "  skills-catalog skill revisions <lineage-id> | skill diff <lineage-id> <left-revision> <right-revision>",
    "  skills-catalog skill profile show <lineage-id>",
    "  skills-catalog skill profile set <lineage-id> [--purpose <text>] [--use-when <text>] [--tag <tag>]...",
    "  skills-catalog skill freeze <skill-name> --version <semver> [--force] [--out <path>]",
    "  skills-catalog skill init <name> [--out <parent-dir>] [--provider codex|antigravity|portable] [--resources <list>] [--interface key=value]...",
    "  skills-catalog skill inspect|validate <skill-dir> [--provider codex|antigravity|portable] | skill rulesets",
    "  skills-catalog skill note add <lineage-id> --body <text> [--scope <scope>] [--kind <kind>]",
    "  skills-catalog skill note list [--lineage <id>] | skill note edit <note-id> --body <text>",
    "  skills-catalog skill note delete|restore <note-id>",
    "  skills-catalog skill annotation add <lineage-id> --body <text> [--revision <id>] [--kind <kind>] [--locale <tag>]",
    "  skills-catalog skill annotation list <lineage-id> | skill annotation edit|delete|restore <annotation-id> --lineage <id> --expected-version <n>",
    "  skills-catalog skill analysis run|list <lineage-id> [--revision <id>]",
    "  skills-catalog skill feedback add <lineage-id> --summary <text> [--outcome <outcome>] [--evidence <type>]",
    "  skills-catalog skill feedback list [--lineage <id>] | skill feedback summary <lineage-id>",
    "  skills-catalog evaluation case create <id> --lineage <id> --name <name> --objective <text> --criterion <text>...",
    "  skills-catalog evaluation case list [--lineage <id>] | evaluation run record <case-id> --revision <id> --outcome <outcome>",
    "      --summary <text> --criterion-results <json> | evaluation summary <lineage-id> | review queue",
    "  skills-catalog observed-state record <project-id> --provider <id> --inventory <file> --bindings <file>",
    "      | observed-state list [--project-id <id>] | observed-state compare <plan-id>",
    "  skills-catalog hook list|diagnostics [--project <path>] [--event <name>]",
    "  skills-catalog hook add --id <id> --name <name> --event <event> --handler <path> [--failure-policy open|closed] [--no-sync]",
    "  skills-catalog hook enable|disable|remove <id> [--project <path>] [--no-sync] | hook sync | hook test --event <event>",
    "  skills-catalog plan --skill <registry-skill-id>... --provider <id> --delivery-root <path>",
    "      [--registry <path>] [--project-id <id> --project-path <path> | --global] [--copy]",
    "  skills-catalog recipe export [--project <id>] [--preset <id>] [--name <text>] [--out <file>]",
    "  skills-catalog recipe inspect <file>",
    "  skills-catalog recipe apply <file> [--path <path>] [--provider <id>] [--enabled-only] [--confirm]",
    "  skills-catalog loop run --prd <path> [--project <path>] [--provider <id>] [--confirm]",
  ].join("\n");
}

async function run(argv) {
  const { positional, flags } = parseArguments(argv);
  const [command, sourcePath] = positional;
  const registryRoot = path.resolve(flags.registry ?? defaultRegistryRoot());
  const catalogRoot = path.resolve(flags.catalog ?? path.join(registryRoot, "..", "catalog"));

  if (command === "sync") {
    const rawTarget = sourcePath ?? flags.path ?? flags.source ?? process.cwd();
    let skillPath = path.resolve(rawTarget);
    try {
      await fs.access(skillPath);
    } catch {
      const candidate1 = path.resolve(process.cwd(), "skills-packages", rawTarget);
      const candidate2 = path.resolve(process.cwd(), "skills-packages", "platform-core", rawTarget);
      try {
        await fs.access(candidate1);
        skillPath = candidate1;
      } catch {
        try {
          await fs.access(candidate2);
          skillPath = candidate2;
        } catch {
          // keep skillPath
        }
      }
    }

    const provider = flags.provider?.[0] ?? "portable";

    // 1. Preflight lint
    const inspection = await inspectSkillPackage({ skillPath, provider });
    if (!inspection.valid) {
      const errors = inspection.findings.filter((f) => f.level === "error");
      const err = new Error(`Skill preflight validation failed with ${errors.length} error(s)`);
      err.issues = inspection.findings;
      throw err;
    }

    // 2. Ingest immutable revision into registry
    const importResult = await importLocalSource({
      registryRoot,
      sourcePath: skillPath,
      selectedSkillNames: flags.skill ?? [],
    });
    const importedSkill = importResult.skills[0];
    if (!importedSkill) {
      throw new Error(`No valid skill found in source: ${skillPath}`);
    }

    const projectId = flags.project ?? flags["project-id"];
    if (!projectId) {
      return {
        status: "imported",
        skill: importedSkill,
        source_revision_id: importResult.source_revision_id,
        validation: { valid: true, findings: inspection.findings },
      };
    }

    // 3. Pin project override to newly imported skill revision
    await setProjectSkillOverride({
      catalogRoot,
      registryRoot,
      projectId,
      lineageId: importedSkill.lineage_id,
      registrySkillId: importedSkill.id,
      desiredState: "enabled",
    });

    // 4. Synthesize activation plan
    const plan = await createProjectPlan({
      catalogRoot,
      registryRoot,
      projectId,
      presetId: flags.preset,
      workScopeTags: flags["work-scope"] ?? [],
      distribution: { method: flags.copy === true ? "copy" : "symlink" },
      enabledOnly: true,
    });

    // 5. Deliver via adapter
    const adapter = require("@skills-platform/skills-manager-adapter");
    const confirmed = flags.confirm === true;
    if (!confirmed) {
      const preview = await adapter.previewActivationPlan(plan);
      return {
        status: "preview",
        skill: importedSkill,
        plan,
        preview,
        message: "Revision imported and project binding updated. Pass --confirm to apply symlink delivery.",
      };
    }

    const report = await adapter.applyActivationPlan(plan, { confirm: true });
    const selection = await resolveProjectSelection({
      catalogRoot,
      registryRoot,
      projectId,
      presetId: flags.preset,
      workScopeTags: flags["work-scope"] ?? [],
    });
    await recordActivationPlan({ catalogRoot, plan, projectId, assignments: selection.assignments });
    await recordActivationReport({ catalogRoot, planId: plan.plan_id, report });

    return {
      status: "applied",
      skill: importedSkill,
      source_revision_id: importResult.source_revision_id,
      plan,
      report,
    };
  }

  if (command === "import-local") {
    if (!sourcePath) throw new Error("import-local requires a source path");
    return importLocalSource({
      registryRoot,
      sourcePath,
      selectedSkillNames: flags.skill ?? [],
    });
  }

  if (command === "import-git") {
    if (!sourcePath) throw new Error("import-git requires a repository locator");
    return importGitSource({
      registryRoot,
      repository: sourcePath,
      ref: flags.ref ?? "HEAD",
      selectedSkillNames: flags.skill ?? [],
    });
  }

  if (command === "source") {
    const [action, inspectedPath] = positional.slice(1);
    if (action === "inspect") return inspectLocalSource({ sourcePath: inspectedPath });
    if (action === "updates") return listSourceUpdateCandidates(registryRoot);
    if (action === "review") {
      const [decision, revisionId] = positional.slice(2);
      if (decision === "show") return latestSourceReview({ catalogRoot, sourceRevisionId: revisionId });
      return recordSourceReview({ catalogRoot, registryRoot, sourceRevisionId: revisionId, decision: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : decision, summary: flags.summary, reviewer: flags.reviewer });
    }
  }

  if (command === "update" || command === "updates") {
    const [action] = positional.slice(1);
    if (action === "check" || action === "status" || !action) {
      return checkSkillUpdates({ registryRoot });
    }
    if (action === "apply") {
      return applySkillUpdates({
        registryRoot,
        sourceIds: flags.source ? [flags.source] : (flags.sources ?? []),
        dryRun: Boolean(flags["dry-run"] || flags.dryRun),
        createBackup: flags.backup !== false && flags["no-backup"] !== true,
        runVerification: flags.verify !== false && flags["no-verify"] !== true,
      });
    }
    if (action === "rollback") {
      return rollbackSkillUpdate({ backupId: flags.backup || flags["backup-id"] });
    }
    if (action === "backups" || action === "list-backups") {
      return listBackupSnapshots();
    }
  }

  if (command === "upstream" || command === "channels") {
    const [action] = positional.slice(1);
    if (action === "list" || !action) {
      return loadUpstreamChannels();
    }
    if (action === "check" || action === "status") {
      return checkChannelStatus({ channelId: flags.channel || flags.id });
    }
    if (action === "add" || action === "register") {
      return registerUpstreamChannel({
        channelId: flags.channel || flags.id || flags.name,
        displayName: flags.title || flags["display-name"] || flags.name,
        packageId: flags.package || flags["package-id"],
        kind: flags.kind || "git",
        locator: flags.locator || flags.url || positional[2],
        requestedRef: flags.ref || flags.branch || "HEAD",
        subpath: flags.subpath || "",
        targetDirectory: flags.target || flags["target-directory"],
        syncPolicy: flags.policy || flags["sync-policy"] || "fast-forward-only",
      });
    }
    if (action === "remove" || action === "delete") {
      return removeUpstreamChannel(flags.channel || flags.id || positional[2]);
    }
    if (action === "sync" || action === "pull") {
      return syncChannelRoute({
        channelId: flags.channel || flags.id || positional[2],
        dryRun: Boolean(flags["dry-run"] || flags.dryRun),
        createBackup: flags.backup !== false && flags["no-backup"] !== true,
      });
    }
  }

  if (command === "ledger") {
    const [action] = positional.slice(1);
    if (action === "list" || !action) {
      return listPlans({ filter: { status: flags.status, phase: flags.phase } });
    }
    if (action === "get" || action === "show") {
      return getPlan(flags.id || flags.plan || positional[2]);
    }
    if (action === "create" || action === "new") {
      return createPlan({
        planId: flags.id || flags.plan,
        title: flags.title || positional[2] || "New Plan",
      });
    }
    if (action === "gap" || action === "check-gap") {
      return calculatePlanGap(flags.id || flags.plan || positional[2]);
    }
    if (action === "ready" || action === "ready-obligations") {
      return getReadyObligations(flags.id || flags.plan || positional[2]);
    }
    if (action === "transition") {
      return transitionObligation(
        flags.id || flags.plan || positional[2],
        flags.obligation || flags.oid,
        flags.status || positional[3],
        { actor: flags.actor || "cli_user", reason: flags.reason }
      );
    }
    if (action === "events" || action === "history") {
      return getEventHistory(flags.id || flags.plan || positional[2]);
    }
    if (action === "delete" || action === "rm") {
      return deletePlan(flags.id || flags.plan || positional[2]);
    }
  }

  if (command === "list") return listRegistrySkills(registryRoot);

  if (command === "serve") {
    const server = await startCatalogServer({
      catalogRoot,
      registryRoot,
      host: flags.host ?? "127.0.0.1",
      port: Number(flags.port ?? 4300),
    });
    const address = server.address();
    return new Promise((resolve) => {
      process.stdout.write(`${JSON.stringify({ listening: `http://${address.address}:${address.port}` }, null, 2)}\n`);
      process.once("SIGINT", () => server.close(() => resolve({ stopped: true })));
      process.once("SIGTERM", () => server.close(() => resolve({ stopped: true })));
    });
  }

  if (command === "skill") {
    const [area, action, subject] = positional.slice(1);
    if (area === "list") return searchSkills({
      catalogRoot,
      registryRoot,
      artifactType: flags.type ?? flags["artifact-type"],
      invocationMode: flags.invoker ?? flags["invocation-mode"],
    });
    if (area === "search") {
      return searchSkills({
        catalogRoot,
        registryRoot,
        query: action ?? "",
        tags: flags.tag ?? [],
        domains: flags.domain ?? [],
        providerId: flags.provider?.[0],
        reviewState: flags["review-state"],
        artifactType: flags.type ?? flags["artifact-type"],
        invocationMode: flags.invoker ?? flags["invocation-mode"],
      });
    }
    if (area === "revisions") return listSkillRevisions({ registryRoot, lineageId: action });
    if (area === "diff") return diffSkillRevisions({
      registryRoot,
      lineageId: action,
      leftRevisionId: subject,
      rightRevisionId: positional[4],
    });
    if (area === "profile") {
      if (action === "show") return getSkillProfile({ catalogRoot, registryRoot, lineageId: subject });
      if (action === "set") {
        return updateSkillProfile({
          catalogRoot,
          registryRoot,
          lineageId: subject,
          patch: {
            title: flags.title,
            summary: flags.summary,
            purpose: flags.purpose,
            use_when: flags["use-when"],
            avoid_when: flags["avoid-when"],
            tags: flags.tag,
            domains: flags.domain,
            work_scope_tags: flags["work-scope"],
            owner: flags.owner,
            maintainers: flags.maintainer,
            visibility: flags.visibility,
            provider_constraints: flags.provider,
            runtime_requirements: flags.runtime,
            risk_level: flags["risk-level"],
            review_state: flags["review-state"],
            artifact_type: flags.type ?? flags["artifact-type"],
            invocation_mode: flags.invoker ?? flags["invocation-mode"],
          },
        });
      }
    }
    if (area === "note") {
      if (action === "add") {
        return addSkillNote({
          catalogRoot,
          registryRoot,
          lineageId: subject,
          body: flags.body,
          scope: flags.scope,
          kind: flags.kind,
          author: flags.author,
          projectId: flags["project-id"],
          sourceRevisionId: flags["source-revision-id"],
          presetId: flags["preset-id"],
          activationPlanId: flags["activation-plan-id"],
          visibility: flags.visibility,
          injectIntoPrompt: flags["inject-into-prompt"] === true,
        });
      }
      if (action === "list") {
        return listSkillNotes({
          catalogRoot,
          lineageId: flags.lineage,
          scope: flags.scope,
          projectId: flags["project-id"],
          presetId: flags["preset-id"],
          sourceRevisionId: flags["source-revision-id"],
          includeDeleted: flags["include-deleted"] === true,
        });
      }
      if (action === "edit") {
        return editSkillNote({
          catalogRoot,
          noteId: subject,
          body: flags.body,
          kind: flags.kind,
          visibility: flags.visibility,
          injectIntoPrompt: flags["inject-into-prompt"],
        });
      }
      if (action === "delete") return deleteSkillNote({ catalogRoot, noteId: subject, author: flags.author });
      if (action === "restore") return restoreSkillNote({ catalogRoot, noteId: subject });
    }
    if (area === "annotation") {
      const parseAnchor = () => {
        if (flags.anchor === undefined) return undefined;
        try {
          return JSON.parse(flags.anchor);
        } catch {
          throw new Error("Annotation anchor must be valid JSON");
        }
      };
      if (action === "add") {
        return createSkillAnnotation({
          catalogRoot,
          registryRoot,
          lineageId: subject,
          sourceRevisionId: flags.revision ?? flags["source-revision-id"] ?? null,
          kind: flags.kind,
          title: flags.title,
          body: flags.body,
          locale: flags.locale,
          anchor: parseAnchor(),
          author: flags.author,
        });
      }
      if (action === "list") {
        return listSkillAnnotations({
          catalogRoot,
          lineageId: subject ?? flags.lineage,
          sourceRevisionId: flags.revision ?? flags["source-revision-id"],
          kind: flags.kind,
          includeDeleted: flags["include-deleted"] === true,
        });
      }
      const mutation = {
        catalogRoot,
        registryRoot,
        lineageId: flags.lineage,
        annotationId: subject,
        expectedVersion: flags["expected-version"],
        author: flags.author,
      };
      if (action === "edit") {
        return updateSkillAnnotation({
          ...mutation,
          patch: {
            ...(flags.kind !== undefined ? { kind: flags.kind } : {}),
            ...(flags.title !== undefined ? { title: flags.title } : {}),
            ...(flags.body !== undefined ? { body: flags.body } : {}),
            ...(flags.locale !== undefined ? { locale: flags.locale } : {}),
            ...(flags.anchor !== undefined ? { anchor: parseAnchor() } : {}),
          },
        });
      }
      if (action === "delete") return deleteSkillAnnotation(mutation);
      if (action === "restore") return restoreSkillAnnotation(mutation);
    }
    if (area === "analysis") {
      if (action === "run") {
        return analyzeSkillRevision({
          catalogRoot,
          registryRoot,
          lineageId: subject,
          sourceRevisionId: flags.revision ?? flags["source-revision-id"],
          analyzerVersion: flags["analyzer-version"],
        });
      }
      if (action === "list") {
        return listSkillAnalyses({ catalogRoot, registryRoot, lineageId: subject });
      }
    }
    if (area === "feedback") {
      if (action === "add") {
        let metrics;
        if (flags.metrics !== undefined) {
          try {
            metrics = JSON.parse(flags.metrics);
          } catch {
            throw new Error("Feedback metrics must be valid JSON");
          }
        }
        return addSkillFeedback({
          catalogRoot,
          registryRoot,
          lineageId: subject,
          summary: flags.summary,
          details: flags.details,
          scope: flags.scope,
          outcome: flags.outcome,
          evidenceType: flags.evidence,
          author: flags.author,
          projectId: flags["project-id"],
          sourceRevisionId: flags["source-revision-id"],
          presetId: flags["preset-id"],
          activationPlanId: flags["activation-plan-id"],
          redaction: flags.redaction,
          metrics,
        });
      }
      if (action === "list") {
        return listSkillFeedback({
          catalogRoot,
          lineageId: flags.lineage,
          scope: flags.scope,
          outcome: flags.outcome,
          evidenceType: flags.evidence,
          projectId: flags["project-id"],
          sourceRevisionId: flags["source-revision-id"],
          presetId: flags["preset-id"],
          activationPlanId: flags["activation-plan-id"],
        });
      }
      if (action === "summary") {
        return getSkillFeedbackSummary({
          catalogRoot,
          registryRoot,
          lineageId: subject,
          projectId: flags["project-id"],
          sourceRevisionId: flags["source-revision-id"],
        });
      }
    }
    if (area === "init") {
      const skillName = action ?? subject ?? flags.name;
      if (!skillName) throw new Error("skill init requires a skill name: skills-platform skill init <name>");
      const pkgName = flags.pkg ?? flags.package ?? flags.group ?? "platform-core";
      const outputDirectory = flags.out ?? flags.dir ?? path.join(process.cwd(), "skills-packages", pkgName);
      const provider = flags.provider?.[0] ?? "portable";
      const resources = [...(flags.resource ?? []), ...(flags.resources ?? [])];
      const interfaceValues = {};
      for (const raw of flags.interface ?? []) {
        const separator = raw.indexOf("=");
        if (separator <= 0) throw new Error("--interface must use key=value");
        interfaceValues[raw.slice(0, separator).trim()] = raw.slice(separator + 1).trim();
      }
      return initializeSkillPackage({ skillName, outputDirectory, provider, resources, interfaceValues });
    }
    if (area === "inspect" || area === "validate") {
      const skillPath = path.resolve(action ?? subject ?? flags.path ?? process.cwd());
      return inspectSkillPackage({ skillPath, provider: flags.provider?.[0] ?? "portable" });
    }
    if (area === "freeze") {
      const skillName = action ?? subject ?? flags.name;
      if (!skillName) throw new Error("skill freeze requires a skill name: skills-catalog skill freeze <name> --version <v>");
      const version = flags.version ?? flags["to-version"];
      if (!version) throw new Error("skill freeze requires --version <semver>");
      const packagesRoot = flags.out ? path.resolve(flags.out) : path.join(process.cwd(), "skills-packages");
      let sourceSkillPath = null;
      try {
        const groups = await fs.readdir(packagesRoot);
        for (const group of groups) {
          const candidate = path.join(packagesRoot, group, skillName);
          try {
            const st = await fs.stat(candidate);
            if (st.isDirectory()) {
              sourceSkillPath = candidate;
              break;
            }
          } catch {}
        }
      } catch {}
      if (!sourceSkillPath) {
        try {
          const st = await fs.stat(path.resolve(skillName));
          if (st.isDirectory()) sourceSkillPath = path.resolve(skillName);
        } catch {}
      }
      if (!sourceSkillPath) throw new Error(`Skill source package not found for ${skillName}`);
      return freezeSkillPackage({
        sourceSkillPath,
        version,
        force: flags.force === true,
        provider: flags.provider?.[0] ?? "portable",
      });
    }
    if (area === "rulesets") return { rulesets: listSkillAuthoringRulesets() };
  }

  if (command === "evaluation") {
    const [area, action, subject] = positional.slice(1);
    if (area === "case") {
      if (action === "create") return createEvaluationCase({
        catalogRoot,
        registryRoot,
        id: subject,
        lineageId: flags.lineage,
        name: flags.name,
        objective: flags.objective,
        criteria: flags.criterion,
        owner: flags.owner,
        lifecycle: flags.lifecycle,
      });
      if (action === "list") return listEvaluationCases({
        catalogRoot,
        lineageId: flags.lineage,
        lifecycle: flags.lifecycle,
        includeRetired: flags["include-retired"] === true,
      });
      if (action === "update") return updateEvaluationCase({
        catalogRoot,
        caseId: subject,
        name: flags.name,
        owner: flags.owner,
        lifecycle: flags.lifecycle,
        objective: flags.objective,
        criteria: flags.criterion,
      });
    }
    if (area === "run") {
      if (action === "record") {
        let criterionResults;
        try {
          criterionResults = JSON.parse(flags["criterion-results"] ?? "");
        } catch {
          throw new Error("Criterion results must be valid JSON");
        }
        return recordEvaluationRun({
          catalogRoot,
          registryRoot,
          caseId: subject,
          version: flags.version,
          sourceRevisionId: flags.revision,
          outcome: flags.outcome,
          summary: flags.summary,
          details: flags.details,
          author: flags.author,
          criterionResults,
        });
      }
      if (action === "list") return listEvaluationRuns({
        catalogRoot,
        lineageId: flags.lineage,
        caseId: flags["case-id"],
        sourceRevisionId: flags.revision,
        outcome: flags.outcome,
      });
    }
    if (area === "summary") return getSkillEvaluationSummary({
      catalogRoot,
      registryRoot,
      lineageId: action,
      sourceRevisionId: flags.revision,
    });
  }

  if (command === "review" && sourcePath === "queue") return listReviewQueue({ catalogRoot, registryRoot });

  if (command === "observed-state") {
    const [action, subject] = positional.slice(1);
    if (action === "record") {
      if (!flags.inventory || !flags.bindings) throw new Error("observed-state record requires --inventory and --bindings JSON files");
      const [inventory, bindings] = await Promise.all([
        fs.readFile(path.resolve(flags.inventory), "utf8").then(JSON.parse),
        fs.readFile(path.resolve(flags.bindings), "utf8").then(JSON.parse),
      ]);
      return recordObservedState({
        catalogRoot,
        projectId: subject,
        providerId: flags.provider?.[0],
        inventory,
        bindings,
        capturedAt: flags["captured-at"],
        source: flags.source,
      });
    }
    if (action === "list") return listObservedStates({ catalogRoot, projectId: flags["project-id"], providerId: flags.provider?.[0] });
    if (action === "compare") return compareRecordedPlanWithObservedState({ catalogRoot, planId: subject, observedStateId: flags["observed-state-id"] });
  }

  if (command === "project") {
    const [action, projectId] = positional.slice(1);
    if (action === "add") {
      return createProject({
        catalogRoot,
        id: projectId,
        name: flags.name,
        projectPath: flags.path,
        providerId: flags.provider?.[0],
        deliveryRoot: flags["delivery-root"],
        scope: flags.global === true ? "global" : "project",
        upstreamProjectId: flags["upstream-project-id"],
      });
    }
    if (action === "list") return listProjects(catalogRoot);
    if (action === "skill") {
      const desiredState = positional[3];
      const lineageId = positional[4];
      if (desiredState === "inherit") {
        return clearProjectSkillOverride({ catalogRoot, registryRoot, projectId, lineageId });
      }
      if (desiredState !== "enabled" && desiredState !== "disabled" && desiredState !== "enable" && desiredState !== "disable") {
        throw new Error("project skill requires enable, disable, or inherit");
      }
      return setProjectSkillOverride({
        catalogRoot,
        registryRoot,
        projectId,
        lineageId,
        registrySkillId: flags.skill?.[0],
        desiredState: desiredState === "enable" ? "enabled" : desiredState === "disable" ? "disabled" : desiredState,
      });
    }
    if (action === "resolve") {
      return resolveProjectEffectiveSet({ catalogRoot, registryRoot, projectId, presetId: flags.preset, workScopeTags: flags["work-scope"] ?? [] });
    }
    if (action === "apply") {
      const plan = await createProjectPlan({
        catalogRoot,
        registryRoot,
        projectId,
        presetId: flags.preset,
        workScopeTags: flags["work-scope"] ?? [],
        distribution: { method: flags.copy === true ? "copy" : "symlink" },
        enabledOnly: flags["enabled-only"] === true,
      });
      const adapter = require("@skills-platform/skills-manager-adapter");
      const confirmed = flags.confirm === true;
      if (!confirmed) {
        const preview = await adapter.previewActivationPlan(plan);
        return { plan, preview, message: "Preview only. Pass --confirm to apply." };
      }
      const report = await adapter.applyActivationPlan(plan, { confirm: true });
      const selection = await resolveProjectSelection({
        catalogRoot, registryRoot, projectId, presetId: flags.preset, workScopeTags: flags["work-scope"] ?? [],
      });
      await recordActivationPlan({ catalogRoot, plan, projectId, assignments: selection.assignments });
      await recordActivationReport({ catalogRoot, planId: plan.plan_id, report });
      return { plan, report };
    }
    if (action === "link") {
      const skillName = positional[3] ?? flags.skill?.[0];
      if (!skillName) throw new Error("project link requires a skill name: skills-catalog project link <project-id> <skill-name>");
      const version = flags.version ?? flags["to-version"] ?? null;
      const packagesRoot = flags["packages-root"] ?? flags.packages ?? null;
      return linkProjectSkill({
        catalogRoot,
        projectId,
        skillName,
        version: flags.latest === true ? null : version,
        packagesRoot,
      });
    }
    if (action === "status") {
      return getProjectSkillStatus({
        catalogRoot,
        projectId,
      });
    }
  }

  if (command === "preset") {
    const [action, presetId, assignmentPresetId] = positional.slice(1);
    if (action === "create") {
      return createPreset({
        catalogRoot,
        registryRoot,
        id: presetId,
        name: flags.name,
        description: flags.description ?? null,
        purpose: flags.purpose ?? null,
        workScopeTags: flags["work-scope"] ?? [],
        owner: flags.owner ?? null,
        lifecycle: flags.lifecycle ?? "draft",
        registrySkillIds: flags.skill ?? [],
      });
    }
    if (action === "list") return listPresets(catalogRoot);
    if (action === "show") return getPreset(catalogRoot, presetId, flags.version);
    if (action === "update") {
      return updatePresetTemplate({
        catalogRoot,
        registryRoot,
        presetId,
        patch: {
          name: flags.name,
          description: flags.description,
          purpose: flags.purpose,
          workScopeTags: flags["work-scope"],
          owner: flags.owner,
          lifecycle: flags.lifecycle,
          registrySkillIds: flags.skill,
        },
      });
    }
    if (action === "adopt") return adoptApprovedRevisionIntoPreset({ catalogRoot, registryRoot, presetId, registrySkillId: flags.skill?.[0] });
    if (action === "clone") {
      return clonePresetTemplate({
        catalogRoot,
        registryRoot,
        sourcePresetId: presetId,
        id: assignmentPresetId,
        name: flags.name,
        owner: flags.owner,
      });
    }
    if (action === "compare") {
      const [, leftVersion, rightVersion] = positional.slice(2);
      return comparePresetVersions({ catalogRoot, presetId, leftVersion, rightVersion });
    }
    if (action === "note" && presetId === "add") {
      const targetPresetId = assignmentPresetId;
      return addPresetTemplateNote({ catalogRoot, presetId: targetPresetId, body: flags.body, author: flags.author });
    }
    if (action === "assign") {
      return assignPreset({
        catalogRoot,
        projectId: presetId,
        presetId: assignmentPresetId,
        version: flags.version,
        role: flags.role,
        priority: flags.priority,
        workScopeTags: flags["work-scope"] ?? [],
      });
    }
  }

  if (command === "project-plan") {
    const projectId = positional[1];
    const plan = await createProjectPlan({
      catalogRoot,
      registryRoot,
      projectId,
      presetId: flags.preset,
      workScopeTags: flags["work-scope"] ?? [],
      distribution: { method: flags.copy === true ? "copy" : "symlink" },
      enabledOnly: flags["enabled-only"] === true,
    });
    if (flags.out) await exportActivationPlan({ outputPath: flags.out, plan });
    return plan;
  }

  if (command === "history") {
    const [action, subject] = positional.slice(1);
    if (action === "list") return listActivationHistory({ catalogRoot, projectId: flags["project-id"], planId: flags["plan-id"] });
    if (action === "record-plan") {
      const selection = await resolveProjectSelection({
        catalogRoot, registryRoot, projectId: subject, presetId: flags.preset, workScopeTags: flags["work-scope"] ?? [],
      });
      const plan = await createProjectPlan({
        catalogRoot,
        registryRoot,
        projectId: subject,
        presetId: flags.preset,
        workScopeTags: flags["work-scope"] ?? [],
        distribution: { method: flags.copy === true ? "copy" : "symlink" },
      });
      return recordActivationPlan({ catalogRoot, plan, projectId: subject, assignments: selection.assignments });
    }
    if (action === "record-report") {
      if (!flags.file) throw new Error("history record-report requires --file <adapter-report.json>");
      const report = JSON.parse(await fs.readFile(path.resolve(flags.file), "utf8"));
      return recordActivationReport({ catalogRoot, planId: subject, report });
    }
  }

  if (command === "system-prompt") {
    return buildSystemPrompt({
      catalogRoot,
      registryRoot,
      presetId: flags.preset,
      includeInjectedNotes: flags["include-notes"] === true,
      projectId: flags["project-id"] ?? null,
    });
  }

  if (command === "plan") {
    const isGlobal = flags.global === true;
    return createPlanFromRegistry({
      registryRoot,
      skillIds: flags.skill ?? [],
      deliveryRoot: flags["delivery-root"],
      target: {
        project_id: isGlobal ? undefined : flags["project-id"],
        project_path: isGlobal ? undefined : flags["project-path"],
        provider_id: flags.provider?.[0],
        scope: isGlobal ? "global" : "project",
      },
      distribution: { method: flags.copy === true ? "copy" : "symlink" },
    });
  }

  if (command === "recipe") {
    const [action, targetFile] = positional.slice(1);
    if (action === "export") {
      const recipe = await exportRecipe({
        catalogRoot,
        registryRoot,
        projectId: flags.project,
        presetId: flags.preset,
        name: flags.name,
        description: flags.description,
      });
      if (flags.out) {
        await fs.writeFile(path.resolve(flags.out), `${JSON.stringify(recipe, null, 2)}\n`, "utf8");
      }
      return recipe;
    }
    if (action === "inspect") {
      return inspectRecipe({ recipePath: targetFile });
    }
    if (action === "apply") {
      return applyRecipe({
        catalogRoot,
        registryRoot,
        recipePath: targetFile,
        projectPath: flags.path,
        providerId: flags.provider?.[0],
        confirm: flags.confirm === true,
        enabledOnly: flags["enabled-only"] === true,
      });
    }
  }

  if (command === "hook") {
    const [action, targetId] = positional.slice(1);
    const {
      listHooks,
      registerHook,
      removeHook,
      updateHookStatus,
      compileProviderConfigs,
      getHookDiagnostics,
      triggerHookEvent,
    } = require("./hooks-manager");

    const projectPath = flags.project ?? flags.path ?? process.cwd();

    if (!action || action === "list") {
      const hooks = listHooks({ projectPath, eventName: flags.event });
      return {
        hooks_count: hooks.length,
        hooks: hooks.map((h) => ({
          id: h.id,
          name: h.name,
          event: h.event,
          enabled: h.enabled,
          matcher: h.matcher,
          description: h.description,
          type: h.handler.type,
          target: h.handler.target || h.handler.command,
          timeout_ms: h.handler.timeout_ms,
          failure_policy: h.failure_policy ?? "open",
          priority: h.priority ?? 100,
          providers: h.providers ?? [],
        })),
      };
    }

    if (action === "diagnostics" || action === "status") {
      return getHookDiagnostics({ projectPath });
    }

    if (action === "add" || action === "register") {
      const id = flags.id ?? targetId;
      const name = flags.name ?? id;
      const event = flags.event ?? "post_tool_use";
      const handlerType = flags.type ?? (flags.command ? "command" : "script");
      const target = flags.target ?? flags.handler ?? flags.script;
      const cmd = flags.command;

      if (!id) throw new Error("hook add requires --id <id>");
      if (!target && !cmd && !flags.url) throw new Error("hook add requires --handler <path>, --command <cmd>, or --url <webhook>");

      return registerHook({
        projectPath,
        hook: {
          id,
          name,
          event,
          description: flags.desc ?? flags.description ?? null,
          enabled: flags.disabled !== true,
          matcher: flags.matcher ?? null,
          handler: {
            type: handlerType,
            target: target ?? undefined,
            command: cmd ?? undefined,
            url: flags.url ?? undefined,
            timeout_ms: flags.timeout ? Number(flags.timeout) : 5000,
          },
          priority: flags.priority ? Number(flags.priority) : 100,
          failure_policy: flags["failure-policy"] ?? "open",
          providers: flags.provider ? (Array.isArray(flags.provider) ? flags.provider : [flags.provider]) : undefined,
        },
        sync: flags["no-sync"] !== true,
      });
    }

    if (action === "remove" || action === "delete") {
      const id = flags.id ?? targetId;
      if (!id) throw new Error("hook remove requires <id>");
      return removeHook({ projectPath, hookId: id, sync: flags["no-sync"] !== true });
    }

    if (action === "enable") {
      const id = flags.id ?? targetId;
      if (!id) throw new Error("hook enable requires <id>");
      return updateHookStatus({ projectPath, hookId: id, enabled: true, sync: flags["no-sync"] !== true });
    }

    if (action === "disable") {
      const id = flags.id ?? targetId;
      if (!id) throw new Error("hook disable requires <id>");
      return updateHookStatus({ projectPath, hookId: id, enabled: false, sync: flags["no-sync"] !== true });
    }

    if (action === "sync") {
      return compileProviderConfigs({ projectPath });
    }

    if (action === "test" || action === "trigger") {
      const eventName = flags.event ?? targetId ?? "post_tool_use";
      let payload = {};
      if (flags.payload) {
        try {
          payload = JSON.parse(flags.payload);
        } catch {
          payload = { raw: flags.payload };
        }
      }
      return triggerHookEvent({ projectPath, eventName, payload });
    }
  }

  if (command === "loop") {
    const [action] = positional.slice(1);
    if (action === "run") {
      const { runLifecycleLoop } = require("./lifecycle-loop");
      const prdPath = flags.prd ?? positional[2];
      if (!prdPath) {
        throw new Error("loop run requires --prd <path>");
      }
      return runLifecycleLoop({
        prdPath,
        projectPath: flags.project ?? flags.path ?? process.cwd(),
        providerId: flags.provider?.[0] ?? (typeof flags.provider === "string" ? flags.provider : undefined) ?? "codex",
        catalogRoot,
        registryRoot,
        confirm: flags.confirm !== false,
        dryRun: flags["dry-run"] === true,
      });
    }
  }

  if (command === "spec") {
    const [action, targetFile] = positional.slice(1);
    const {
      createVerticalTopicSpec,
      validateVerticalTopicSpec,
      renderVerticalTopicMarkdown,
    } = require("@skills-platform/contracts");

    if (action === "init") {
      const topicId = flags.id ?? targetFile ?? "topic:default";
      const name = flags.name ?? "Target Problem Resolution";
      const spec = createVerticalTopicSpec({
        topic_id: topicId,
        canonical_name: name,
        lineage_path: flags.lineage ? flags.lineage.split(",") : ["root", topicId],
        local_horizontal_scope: {
          owned_files: flags.owned ? (Array.isArray(flags.owned) ? flags.owned : [flags.owned]) : [],
          read_only_interfaces: flags.interfaces ? (Array.isArray(flags.interfaces) ? flags.interfaces : [flags.interfaces]) : [],
          out_of_bounds: flags.forbidden ? (Array.isArray(flags.forbidden) ? flags.forbidden : [flags.forbidden]) : [],
        },
        invariants: {
          pre_conditions: flags.pre ? (Array.isArray(flags.pre) ? flags.pre : [flags.pre]) : [],
          post_conditions: flags.post ? (Array.isArray(flags.post) ? flags.post : [flags.post]) : [],
          strict_invariants: flags.strict ? (Array.isArray(flags.strict) ? flags.strict : [flags.strict]) : [],
        },
        verification: {
          target_test_file: flags.test ?? "test/target.test.js",
          allowed_command: flags.command ?? `node --test ${flags.test ?? "test/target.test.js"}`,
          prohibited_commands: ["npm test", "pytest", "ctest"],
        },
        acceptance_criteria: flags.criteria ? (Array.isArray(flags.criteria) ? flags.criteria : [flags.criteria]) : ["Target scoped test passes with 0 failures"],
      });

      if (flags.out) {
        const outPath = path.resolve(flags.out);
        if (outPath.endsWith(".md")) {
          await fs.writeFile(outPath, renderVerticalTopicMarkdown(spec), "utf8");
        } else {
          await fs.writeFile(outPath, JSON.stringify(spec, null, 2) + "\n", "utf8");
        }
      }
      return spec;
    }

    if (action === "render") {
      if (!targetFile) throw new Error("spec render requires <spec.json>");
      const raw = JSON.parse(await fs.readFile(path.resolve(targetFile), "utf8"));
      const md = renderVerticalTopicMarkdown(raw);
      if (flags.out) {
        await fs.writeFile(path.resolve(flags.out), md, "utf8");
      }
      return { rendered_markdown: md };
    }

    if (action === "validate") {
      if (!targetFile) throw new Error("spec validate requires <spec.json>");
      const raw = JSON.parse(await fs.readFile(path.resolve(targetFile), "utf8"));
      const validation = validateVerticalTopicSpec(raw);
      if (!validation.valid) {
        const error = new Error("Vertical topic spec is invalid");
        error.issues = validation.issues;
        throw error;
      }
      return { valid: true, topic_id: raw.topic_id };
    }
  }

  if (command === "workspace") {
    const [action, targetSubject] = positional.slice(1);
    const projectPath = path.resolve(flags.project ?? flags.path ?? process.cwd());
    const {
      spawnProcedureWorkspace,
      pruneProcedureWorkspace,
      listProcedureWorkspaces,
      getProcedureWorkspace,
      verifyWorkspace,
      mergeWorkspace,
      enqueueWorkspace,
      discardWorkspace,
      getQueueStatus,
    } = require(".");

    if (action === "spawn") {
      const taskId = flags.task ?? flags["task-id"] ?? flags.workspace ?? flags["workspace-id"] ?? targetSubject;
      if (!taskId) {
        throw new Error("workspace spawn requires --task <id>");
      }
      const procedureType = flags.procedure ?? flags["procedure-type"] ?? flags.type ?? "INNER_LOOP_TDD";
      let recipeId = flags.recipe ?? flags["recipe-id"] ?? flags["recipe-path"];
      let activeSkills = flags.skill ? (Array.isArray(flags.skill) ? flags.skill : [flags.skill]) : undefined;
      let activeGuards = flags.guard ? (Array.isArray(flags.guard) ? flags.guard : [flags.guard]) : undefined;

      if (recipeId) {
        try {
          const recipeFilePath = path.resolve(recipeId);
          const st = await fs.stat(recipeFilePath);
          if (st.isFile()) {
            const rawRecipe = JSON.parse(await fs.readFile(recipeFilePath, "utf8"));
            if (rawRecipe.recipe_id) recipeId = rawRecipe.recipe_id;
            if (!activeSkills && Array.isArray(rawRecipe.skills)) {
              activeSkills = rawRecipe.skills.map((s) => s.name || s.skill_name).filter(Boolean);
            }
          }
        } catch {}
      }

      const ownedFiles = flags.owned
        ? (Array.isArray(flags.owned) ? flags.owned : [flags.owned])
        : flags["owned-files"]
          ? (Array.isArray(flags["owned-files"]) ? flags["owned-files"] : [flags["owned-files"]])
          : flags["owned-file"]
            ? (Array.isArray(flags["owned-file"]) ? flags["owned-file"] : [flags["owned-file"]])
            : [];

      const prohibitedActions = flags.prohibited
        ? (Array.isArray(flags.prohibited) ? flags.prohibited : [flags.prohibited])
        : flags["prohibited-actions"]
          ? (Array.isArray(flags["prohibited-actions"]) ? flags["prohibited-actions"] : [flags["prohibited-actions"]])
          : flags["prohibited-action"]
            ? (Array.isArray(flags["prohibited-action"]) ? flags["prohibited-action"] : [flags["prohibited-action"]])
            : [];

      const acceptanceCriteria = flags.acceptance
        ? (Array.isArray(flags.acceptance) ? flags.acceptance : [flags.acceptance])
        : flags["acceptance-criteria"]
          ? (Array.isArray(flags["acceptance-criteria"]) ? flags["acceptance-criteria"] : [flags["acceptance-criteria"]])
          : flags["acceptance-criterion"]
            ? (Array.isArray(flags["acceptance-criterion"]) ? flags["acceptance-criterion"] : [flags["acceptance-criterion"]])
            : [];

      const targetTestFile = flags.test ?? flags["target-test"] ?? flags["target-test-file"];
      const presetId = flags.preset ?? flags["preset-id"];

      return await spawnProcedureWorkspace({
        procedure_type: procedureType,
        task_id: taskId,
        recipe_id: recipeId,
        preset_id: presetId,
        target_test_file: targetTestFile,
        owned_files: ownedFiles,
        prohibited_actions: prohibitedActions,
        acceptance_criteria: acceptanceCriteria,
        project_path: projectPath,
        active_skills: activeSkills,
        active_guards: activeGuards,
      });
    }

    if (action === "list") {
      const status = flags.status ?? targetSubject;
      return await listProcedureWorkspaces({
        project_path: projectPath,
        status,
      });
    }

    if (action === "verify") {
      const taskId = flags.task ?? flags["task-id"] ?? flags.workspace ?? flags["workspace-id"] ?? targetSubject;
      if (!taskId) {
        throw new Error("workspace verify requires --task <id>");
      }
      return await verifyWorkspace(taskId, {
        project_path: projectPath,
      });
    }

    if (action === "merge") {
      const taskId = flags.task ?? flags["task-id"] ?? flags.workspace ?? flags["workspace-id"] ?? targetSubject;
      if (!taskId) {
        throw new Error("workspace merge requires --task <id>");
      }
      return await mergeWorkspace(taskId, {
        project_path: projectPath,
        force: flags.force === true,
      });
    }

    if (action === "prune") {
      const taskId = flags.task ?? flags["task-id"] ?? flags.workspace ?? flags["workspace-id"] ?? targetSubject;
      if (!taskId) {
        throw new Error("workspace prune requires --task <id>");
      }
      return await pruneProcedureWorkspace(taskId, {
        project_path: projectPath,
        delete_branch: flags["delete-branch"] !== false,
      });
    }

    if (action === "enqueue") {
      const taskId = flags.task ?? flags["task-id"] ?? flags.workspace ?? flags["workspace-id"] ?? targetSubject;
      if (!taskId) {
        throw new Error("workspace enqueue requires --task <id>");
      }
      const dependencies = flags.dependency
        ? (Array.isArray(flags.dependency) ? flags.dependency : [flags.dependency])
        : flags.dependencies
          ? (Array.isArray(flags.dependencies) ? flags.dependencies : [flags.dependencies])
          : [];
      return await enqueueWorkspace(taskId, {
        project_path: projectPath,
        dependencies,
      });
    }

    if (action === "discard") {
      const taskId = flags.task ?? flags["task-id"] ?? flags.workspace ?? flags["workspace-id"] ?? targetSubject;
      if (!taskId) {
        throw new Error("workspace discard requires --task <id>");
      }
      return await discardWorkspace(taskId, {
        project_path: projectPath,
        reason: flags.reason,
      });
    }

    if (action === "status" || action === "queue") {
      return await getQueueStatus({
        project_path: projectPath,
      });
    }

    throw new Error(`Unknown workspace action: ${action}`);
  }

  throw new Error(usage());
}

if (require.main === module) {
  const cliArguments = process.argv.slice(2);
  run(cliArguments)
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (cliArguments[0] === "skill" && cliArguments[1] === "validate" && result?.valid === false) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      if (error.issues) process.stderr.write(`${JSON.stringify(error.issues, null, 2)}\n`);
      process.exitCode = 1;
    });
}

module.exports = { parseArguments, run, usage };
