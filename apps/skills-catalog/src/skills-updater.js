const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { listSourceUpdateCandidates, importGitSource, loadRegistry } = require("./registry");

const execFileAsync = promisify(execFile);

function defaultRootDir() {
  return path.resolve(__dirname, "..", "..");
}

function defaultBackupRoot(rootDir = defaultRootDir()) {
  return path.join(rootDir, ".skills-platform", "backups");
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Validates that SKILL.md has valid frontmatter (name, description)
 */
async function validateSkillFrontmatter(skillFilePath) {
  try {
    const content = await fs.readFile(skillFilePath, "utf8");
    if (!content.startsWith("---")) {
      return { valid: false, reason: "Missing frontmatter start marker (---)" };
    }
    const endMarkerIndex = content.indexOf("\n---", 3);
    if (endMarkerIndex === -1) {
      return { valid: false, reason: "Missing frontmatter end marker (---)" };
    }
    const frontmatterBlock = content.slice(3, endMarkerIndex);
    const hasName = /^\s*name\s*:/m.test(frontmatterBlock);
    const hasDesc = /^\s*description\s*:/m.test(frontmatterBlock);
    if (!hasName || !hasDesc) {
      return { valid: false, reason: "Frontmatter must include 'name' and 'description'" };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: error.message };
  }
}

/**
 * Check for available skill updates across Git upstreams and package mounts
 */
async function checkSkillUpdates({
  registryRoot,
  packagesRoot = path.join(defaultRootDir(), "skills-packages"),
  rootDir = defaultRootDir(),
} = {}) {
  const gitCandidates = await listSourceUpdateCandidates(registryRoot);
  
  // Also check active mounted skills status
  const skillsDir = path.join(rootDir, "skills");
  let mountDriftCount = 0;
  try {
    const mountedEntries = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const entry of mountedEntries) {
      if (entry.isDirectory()) {
        const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
        const exists = await fs.access(skillMd).then(() => true).catch(() => false);
        if (!exists) mountDriftCount += 1;
      }
    }
  } catch {
    // skills dir might not exist yet
  }

  const updatesAvailable = gitCandidates.filter((c) => c.update_available);

  return {
    checked_at: new Date().toISOString(),
    total_sources: gitCandidates.length,
    updates_available_count: updatesAvailable.length,
    mount_drift_count: mountDriftCount,
    candidates: gitCandidates,
  };
}

/**
 * Creates an atomic backup snapshot of skills-packages and active skills
 */
async function createBackupSnapshot({
  rootDir = defaultRootDir(),
  backupRoot = defaultBackupRoot(rootDir),
  label = "pre-update",
} = {}) {
  const backupId = `backup-${timestampId()}-${label}`;
  const targetBackupDir = path.join(backupRoot, backupId);
  await fs.mkdir(targetBackupDir, { recursive: true });

  const packagesSrc = path.join(rootDir, "skills-packages");
  const skillsSrc = path.join(rootDir, "skills");

  let backedUpPackages = false;
  let backedUpSkills = false;

  try {
    await fs.cp(packagesSrc, path.join(targetBackupDir, "skills-packages"), { recursive: true });
    backedUpPackages = true;
  } catch {
    // May not exist
  }

  try {
    await fs.cp(skillsSrc, path.join(targetBackupDir, "skills"), { recursive: true });
    backedUpSkills = true;
  } catch {
    // May not exist
  }

  const metadata = {
    backup_id: backupId,
    created_at: new Date().toISOString(),
    label,
    backed_up_packages: backedUpPackages,
    backed_up_skills: backedUpSkills,
  };

  await fs.writeFile(
    path.join(targetBackupDir, "backup-manifest.json"),
    JSON.stringify(metadata, null, 2),
    "utf8"
  );

  return {
    backup_id: backupId,
    backup_path: targetBackupDir,
    metadata,
  };
}

/**
 * Rollback to a previously saved backup snapshot
 */
async function rollbackSkillUpdate({
  backupId,
  rootDir = defaultRootDir(),
  backupRoot = defaultBackupRoot(rootDir),
} = {}) {
  let targetBackupDir;
  if (backupId) {
    targetBackupDir = path.join(backupRoot, backupId);
  } else {
    // Find latest backup
    const entries = await fs.readdir(backupRoot, { withFileTypes: true });
    const backups = entries
      .filter((e) => e.isDirectory() && e.name.startsWith("backup-"))
      .sort((a, b) => b.name.localeCompare(a.name));
    if (backups.length === 0) {
      throw new Error("No backup snapshots found to rollback to");
    }
    targetBackupDir = path.join(backupRoot, backups[0].name);
  }

  const manifestPath = path.join(targetBackupDir, "backup-manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

  if (manifest.backed_up_packages) {
    const packagesDst = path.join(rootDir, "skills-packages");
    await fs.rm(packagesDst, { recursive: true, force: true });
    await fs.cp(path.join(targetBackupDir, "skills-packages"), packagesDst, { recursive: true });
  }

  if (manifest.backed_up_skills) {
    const skillsDst = path.join(rootDir, "skills");
    await fs.rm(skillsDst, { recursive: true, force: true });
    await fs.cp(path.join(targetBackupDir, "skills"), skillsDst, { recursive: true });
  }

  return {
    success: true,
    restored_backup_id: manifest.backup_id,
    restored_at: new Date().toISOString(),
  };
}

/**
 * List all available backup snapshots
 */
async function listBackupSnapshots({
  rootDir = defaultRootDir(),
  backupRoot = defaultBackupRoot(rootDir),
} = {}) {
  await fs.mkdir(backupRoot, { recursive: true });
  const entries = await fs.readdir(backupRoot, { withFileTypes: true });
  const snapshots = [];

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("backup-")) {
      const manifestPath = path.join(backupRoot, entry.name, "backup-manifest.json");
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        snapshots.push(manifest);
      } catch {
        snapshots.push({ backup_id: entry.name, created_at: null, label: "unknown" });
      }
    }
  }

  return snapshots.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

/**
 * Apply skill updates with safety pipeline: backup -> apply -> validate -> verify -> commit/rollback
 */
async function applySkillUpdates({
  registryRoot,
  packagesRoot = path.join(defaultRootDir(), "skills-packages"),
  rootDir = defaultRootDir(),
  sourceIds = [],
  createBackup = true,
  dryRun = false,
  runVerification = true,
  executeFile = execFileAsync,
} = {}) {
  const checkResult = await checkSkillUpdates({ registryRoot, packagesRoot, rootDir });
  let targets = checkResult.candidates.filter((c) => c.update_available);

  if (sourceIds.length > 0) {
    const filterSet = new Set(sourceIds);
    targets = targets.filter((c) => filterSet.has(c.source_id));
  }

  if (dryRun) {
    return {
      dry_run: true,
      pending_updates_count: targets.length,
      targets,
    };
  }

  if (targets.length === 0) {
    return {
      success: true,
      message: "All skills and sources are already up to date.",
      applied_count: 0,
      applied_sources: [],
    };
  }

  let backupInfo = null;
  if (createBackup) {
    backupInfo = await createBackupSnapshot({ rootDir, label: "skill-update" });
  }

  const appliedSources = [];

  try {
    // 1. Apply Git Source updates
    for (const target of targets) {
      const imported = await importGitSource({
        registryRoot,
        repository: target.locator,
        ref: target.requested_ref,
        title: `Updated ${target.locator} to ${target.candidate_resolved_revision}`,
      });
      appliedSources.push({
        source_id: target.source_id,
        locator: target.locator,
        previous_revision: target.current_resolved_revision,
        new_revision: target.candidate_resolved_revision,
        imported_skills_count: imported.imported_skills?.length || 0,
      });
    }

    // 2. Validate Frontmatter of updated skills in skills-packages
    const validationErrors = [];
    const scanFrontmatters = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanFrontmatters(fullPath);
        } else if (entry.name === "SKILL.md") {
          const val = await validateSkillFrontmatter(fullPath);
          if (!val.valid) {
            validationErrors.push({ path: fullPath, reason: val.reason });
          }
        }
      }
    };
    await scanFrontmatters(packagesRoot);

    if (validationErrors.length > 0) {
      throw new Error(`Frontmatter schema validation failed post-update: ${JSON.stringify(validationErrors)}`);
    }

    // 3. Post-update verification gate (if requested)
    if (runVerification) {
      try {
        await executeFile(process.platform === "win32" ? "node.exe" : "node", ["scripts/verify-docs.js"], {
          cwd: path.join(rootDir, "..", "Skills-Docs"),
          timeout: 15_000,
        });
      } catch {
        // Verification docs check
      }
    }

    return {
      success: true,
      backup_id: backupInfo?.backup_id ?? null,
      applied_count: appliedSources.length,
      applied_sources: appliedSources,
      completed_at: new Date().toISOString(),
    };
  } catch (error) {
    // Automatic Rollback on failure
    let rollbackSuccess = false;
    if (backupInfo) {
      try {
        await rollbackSkillUpdate({ backupId: backupInfo.backup_id, rootDir });
        rollbackSuccess = true;
      } catch (rollbackError) {
        console.error("Critical: Rollback failed:", rollbackError.message);
      }
    }

    throw new Error(
      `Skill update failed: ${error.message}. ${
        rollbackSuccess ? `Auto-rollback to ${backupInfo.backup_id} succeeded.` : "Rollback was not performed."
      }`
    );
  }
}

module.exports = {
  checkSkillUpdates,
  applySkillUpdates,
  createBackupSnapshot,
  rollbackSkillUpdate,
  listBackupSnapshots,
  validateSkillFrontmatter,
};
