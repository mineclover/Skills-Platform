#!/usr/bin/env node
const path = require("node:path");
const {
  createPlanFromRegistry,
  addSkillNote,
  deleteSkillNote,
  editSkillNote,
  getSkillProfile,
  createPreset,
  createProject,
  createProjectPlan,
  defaultRegistryRoot,
  buildSystemPrompt,
  assignPreset,
  exportActivationPlan,
  importLocalSource,
  listPresets,
  listProjects,
  listRegistrySkills,
  listSkillNotes,
  searchSkills,
  restoreSkillNote,
  updateSkillProfile,
} = require(".");

const MULTI_VALUE_FLAGS = new Set([
  "skill", "use-when", "avoid-when", "tag", "domain", "work-scope",
  "maintainer", "provider", "runtime",
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
    "  skills-catalog list [--registry <path>]",
    "  skills-catalog project add <id> --name <name> --path <path> --provider <id> --delivery-root <path>",
    "  skills-catalog project list",
    "  skills-catalog preset create <id> --name <name> --skill <registry-skill-id>...",
    "  skills-catalog preset list | preset assign <project-id> <preset-id>",
    "  skills-catalog project-plan <project-id> [--preset <id>] [--copy] [--out <file>]",
    "  skills-catalog system-prompt --preset <id>",
    "  skills-catalog skill list | skill search [query] [--tag <tag>] [--provider <id>]",
    "  skills-catalog skill profile show <lineage-id>",
    "  skills-catalog skill profile set <lineage-id> [--purpose <text>] [--use-when <text>] [--tag <tag>]...",
    "  skills-catalog skill note add <lineage-id> --body <text> [--scope <scope>] [--kind <kind>]",
    "  skills-catalog skill note list [--lineage <id>] | skill note edit <note-id> --body <text>",
    "  skills-catalog skill note delete|restore <note-id>",
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

  if (command === "list") return listRegistrySkills(registryRoot);

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
        registrySkillIds: flags.skill ?? [],
      });
    }
    if (action === "list") return listPresets(catalogRoot);
    if (action === "assign") {
      return assignPreset({ catalogRoot, projectId: presetId, presetId: assignmentPresetId });
    }
  }

  if (command === "project-plan") {
    const projectId = positional[1];
    const plan = await createProjectPlan({
      catalogRoot,
      registryRoot,
      projectId,
      presetId: flags.preset,
      distribution: { method: flags.copy === true ? "copy" : "symlink" },
    });
    if (flags.out) await exportActivationPlan({ outputPath: flags.out, plan });
    return plan;
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
