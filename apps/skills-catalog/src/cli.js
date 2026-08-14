#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  createPlanFromRegistry,
  createEvaluationCase,
  addSkillFeedback,
  addPresetTemplateNote,
  addSkillNote,
  deleteSkillNote,
  diffSkillRevisions,
  editSkillNote,
  getPreset,
  getSkillProfile,
  getSkillFeedbackSummary,
  getSkillEvaluationSummary,
  createPreset,
  createProject,
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
  restoreSkillNote,
  recordEvaluationRun,
  recordObservedState,
  resolveProjectEffectiveSet,
  updateSkillProfile,
  updateEvaluationCase,
  updatePresetTemplate,
} = require(".");

const MULTI_VALUE_FLAGS = new Set([
  "skill", "use-when", "avoid-when", "tag", "domain", "work-scope",
  "maintainer", "provider", "runtime", "criterion",
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
    "  skills-catalog import-local <source-path> [--registry <path>] [--skill <name>]...",
    "  skills-catalog import-git <repository> [--ref <commit-or-ref>] [--registry <path>] [--skill <name>]...",
    "  skills-catalog source inspect <source-path> | source updates [--registry <path>]",
    "  skills-catalog serve [--catalog <path>] [--registry <path>] [--host <host>] [--port <n>]",
    "  skills-catalog list [--registry <path>]",
    "  skills-catalog project add <id> --name <name> --path <path> --provider <id> --delivery-root <path>",
    "  skills-catalog project list | project resolve <id> [--preset <id>] [--work-scope <tag>]...",
    "  skills-catalog preset create <id> --name <name> --skill <registry-skill-id>...",
    "  skills-catalog preset show <id> [--version <n>] | preset update <id> [--skill <id>]...",
    "  skills-catalog preset clone <source-id> <new-id> --name <name> | preset compare <id> <left> <right>",
    "  skills-catalog preset note add <id> --body <text> | preset assign <project-id> <preset-id> [--version <n>]",
    "      [--role default|recommended|work_scope_overlay] [--priority <n>] [--work-scope <tag>]...",
    "  skills-catalog project-plan <project-id> [--preset <id>] [--work-scope <tag>]... [--copy] [--out <file>]",
    "  skills-catalog history record-plan <project-id> [--preset <id>] [--work-scope <tag>]... [--copy]",
    "  skills-catalog history record-report <plan-id> --file <adapter-report.json> | history list [--project-id <id>]",
    "  skills-catalog system-prompt --preset <id>",
    "  skills-catalog skill list | skill search [query] [--tag <tag>] [--provider <id>]",
    "  skills-catalog skill revisions <lineage-id> | skill diff <lineage-id> <left-revision> <right-revision>",
    "  skills-catalog skill profile show <lineage-id>",
    "  skills-catalog skill profile set <lineage-id> [--purpose <text>] [--use-when <text>] [--tag <tag>]...",
    "  skills-catalog skill note add <lineage-id> --body <text> [--scope <scope>] [--kind <kind>]",
    "  skills-catalog skill note list [--lineage <id>] | skill note edit <note-id> --body <text>",
    "  skills-catalog skill note delete|restore <note-id>",
    "  skills-catalog skill feedback add <lineage-id> --summary <text> [--outcome <outcome>] [--evidence <type>]",
    "  skills-catalog skill feedback list [--lineage <id>] | skill feedback summary <lineage-id>",
    "  skills-catalog evaluation case create <id> --lineage <id> --name <name> --objective <text> --criterion <text>...",
    "  skills-catalog evaluation case list [--lineage <id>] | evaluation run record <case-id> --revision <id> --outcome <outcome>",
    "      --summary <text> --criterion-results <json> | evaluation summary <lineage-id> | review queue",
    "  skills-catalog observed-state record <project-id> --provider <id> --inventory <file> --bindings <file>",
    "      | observed-state list [--project-id <id>] | observed-state compare <plan-id>",
    "  skills-catalog plan --skill <registry-skill-id>... --provider <id> --delivery-root <path>",
    "      [--registry <path>] [--project-id <id> --project-path <path> | --global] [--copy]",
  ].join("\n");
}

async function run(argv) {
  const { positional, flags } = parseArguments(argv);
  const [command, sourcePath] = positional;
  const registryRoot = path.resolve(flags.registry ?? defaultRegistryRoot());
  const catalogRoot = path.resolve(flags.catalog ?? path.join(registryRoot, "..", "catalog"));

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
    if (area === "list") return searchSkills({ catalogRoot, registryRoot });
    if (area === "search") {
      return searchSkills({
        catalogRoot,
        registryRoot,
        query: action ?? "",
        tags: flags.tag ?? [],
        domains: flags.domain ?? [],
        providerId: flags.provider?.[0],
        reviewState: flags["review-state"],
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
      });
    }
    if (action === "list") return listProjects(catalogRoot);
    if (action === "resolve") {
      return resolveProjectEffectiveSet({ catalogRoot, registryRoot, projectId, presetId: flags.preset, workScopeTags: flags["work-scope"] ?? [] });
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
    });
    if (flags.out) await exportActivationPlan({ outputPath: flags.out, plan });
    return plan;
  }

  if (command === "history") {
    const [action, subject] = positional.slice(1);
    if (action === "list") return listActivationHistory({ catalogRoot, projectId: flags["project-id"], planId: flags["plan-id"] });
    if (action === "record-plan") {
      const selection = await resolveProjectSelection({
        catalogRoot, projectId: subject, presetId: flags.preset, workScopeTags: flags["work-scope"] ?? [],
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

  throw new Error(usage());
}

if (require.main === module) {
  run(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      if (error.issues) process.stderr.write(`${JSON.stringify(error.issues, null, 2)}\n`);
      process.exitCode = 1;
    });
}

module.exports = { parseArguments, run, usage };
