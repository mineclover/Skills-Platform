const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const skillsDir = path.join(root, "skills");
const agentsSkillsDir = path.join(root, ".agents", "skills");

const ESSENTIAL_SKILLS_MAP = {
  // Antigravity Native Built-ins
  "teamwork-preview": path.join(root, "skills-packages", "antigravity-builtin", "teamwork-preview"),
  "ralph-loop": path.join(root, "skills-packages", "antigravity-builtin", "ralph-loop"),
  "grill-me": path.join(root, "skills-packages", "antigravity-builtin", "grill-me"),
  "goal": path.join(root, "skills-packages", "antigravity-builtin", "goal"),
  "learn": path.join(root, "skills-packages", "antigravity-builtin", "learn"),
  "schedule": path.join(root, "skills-packages", "antigravity-builtin", "schedule"),
  "browser": path.join(root, "skills-packages", "antigravity-builtin", "browser"),
  "generative-ui": path.join(root, "skills-packages", "antigravity-builtin", "generative-ui"),
  "agy-customizations": path.join(root, "skills-packages", "antigravity-builtin", "agy-customizations"),
  "antigravity-guide": path.join(root, "skills-packages", "antigravity-builtin", "antigravity-guide"),

  // Platform Core
  "skill-authoring-standard": path.join(root, "skills-packages", "platform-core", "skill-authoring-standard"),
  "worktree-lifecycle-orchestrator": path.join(root, "skills-packages", "platform-core", "worktree-lifecycle-orchestrator"),
  "vertical-spec-documenter": path.join(root, "skills-packages", "platform-core", "vertical-spec-documenter"),
  "logical-completion-core": path.join(root, "skills-packages", "platform-core", "logical-completion-core"),
  "logical-completion-harness": path.join(root, "skills-packages", "platform-core", "logical-completion-harness"),
  "lch-contract-compiler": path.join(root, "skills-packages", "platform-core", "lch-contract-compiler"),
  "lch-horizontal-explorer": path.join(root, "skills-packages", "platform-core", "lch-horizontal-explorer"),
  "lch-obligation-ledger": path.join(root, "skills-packages", "platform-core", "lch-obligation-ledger"),
  "lch-responsibility-router": path.join(root, "skills-packages", "platform-core", "lch-responsibility-router"),
  "lch-work-unit-executor": path.join(root, "skills-packages", "platform-core", "lch-work-unit-executor"),
  "lch-evidence-collector": path.join(root, "skills-packages", "platform-core", "lch-evidence-collector"),
  "lch-independent-auditor": path.join(root, "skills-packages", "platform-core", "lch-independent-auditor"),
  "lch-failure-recovery": path.join(root, "skills-packages", "platform-core", "lch-failure-recovery"),
  "lch-closure-gate": path.join(root, "skills-packages", "platform-core", "lch-closure-gate"),
  "lch-experience-consolidator": path.join(root, "skills-packages", "platform-core", "lch-experience-consolidator"),
  "lch-evolution-supervisor": path.join(root, "skills-packages", "platform-core", "lch-evolution-supervisor"),

  // Skills Manager Core
  "skills-manager-testing": path.join(root, "skills-packages", "skills-manager", "skills-manager-testing"),
  "skills-manager-architecture": path.join(root, "skills-packages", "skills-manager", "skills-manager-architecture"),

  // Paperthin Core Iteration Skills
  "re0-plan": path.join(root, "skills-packages", "paperthin", "re0-plan"),
  "re0-work": path.join(root, "skills-packages", "paperthin", "re0-work"),
  "re0-loop": path.join(root, "skills-packages", "paperthin", "re0-loop"),
};

async function syncEssentialSkills(targetDir) {
  console.log(`\n=== Processing ${targetDir} ===`);
  await fs.mkdir(targetDir, { recursive: true });

  const existingEntries = await fs.readdir(targetDir, { withFileTypes: true });

  // 1. Remove non-essential entries
  for (const entry of existingEntries) {
    if (!Object.prototype.hasOwnProperty.call(ESSENTIAL_SKILLS_MAP, entry.name)) {
      const fullPath = path.join(targetDir, entry.name);
      console.log(`Deactivating non-essential skill: ${entry.name}`);
      await fs.rm(fullPath, { recursive: true, force: true });
    }
  }

  // 2. Link essential skills
  for (const [skillName, targetSource] of Object.entries(ESSENTIAL_SKILLS_MAP)) {
    const linkPath = path.join(targetDir, skillName);
    try {
      await fs.access(targetSource);
      try {
        await fs.rm(linkPath, { recursive: true, force: true });
      } catch {}
      await fs.symlink(targetSource, linkPath, "junction");
      console.log(`Mounted essential skill: ${skillName} -> ${targetSource}`);
    } catch (err) {
      console.warn(`Could not mount ${skillName}: ${err.message}`);
    }
  }
}

async function main() {
  await syncEssentialSkills(skillsDir);
  await syncEssentialSkills(agentsSkillsDir);
  console.log("\nEssential skills sync complete!");
}

main().catch(console.error);
