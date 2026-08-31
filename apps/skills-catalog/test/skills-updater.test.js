const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  checkSkillUpdates,
  createBackupSnapshot,
  rollbackSkillUpdate,
  listBackupSnapshots,
  validateSkillFrontmatter,
  applySkillUpdates,
  startCatalogServer,
} = require("../src");

test("Skills Updater: validateSkillFrontmatter detects valid and malformed frontmatter", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-updater-val-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const validPath = path.join(root, "valid.md");
  await fs.writeFile(validPath, "---\nname: my-skill\ndescription: A valid skill\n---\n# Content\n", "utf8");

  const invalidPath1 = path.join(root, "no-marker.md");
  await fs.writeFile(invalidPath1, "# Missing frontmatter\n", "utf8");

  const invalidPath2 = path.join(root, "no-desc.md");
  await fs.writeFile(invalidPath2, "---\nname: only-name\n---\n# Missing desc\n", "utf8");

  const val1 = await validateSkillFrontmatter(validPath);
  assert.equal(val1.valid, true);

  const val2 = await validateSkillFrontmatter(invalidPath1);
  assert.equal(val2.valid, false);

  const val3 = await validateSkillFrontmatter(invalidPath2);
  assert.equal(val3.valid, false);
});

test("Skills Updater: createBackupSnapshot, listBackupSnapshots, and rollbackSkillUpdate", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-updater-backup-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const packagesDir = path.join(root, "skills-packages", "pkg-test");
  const skillsDir = path.join(root, "skills", "skill-test");
  await fs.mkdir(packagesDir, { recursive: true });
  await fs.mkdir(skillsDir, { recursive: true });

  await fs.writeFile(path.join(packagesDir, "original.txt"), "v1", "utf8");
  await fs.writeFile(path.join(skillsDir, "original.txt"), "v1", "utf8");

  const backupRoot = path.join(root, ".skills-platform", "backups");
  const backup = await createBackupSnapshot({ rootDir: root, backupRoot, label: "test-snapshot" });

  assert.ok(backup.backup_id.startsWith("backup-"));

  const list = await listBackupSnapshots({ rootDir: root, backupRoot });
  assert.equal(list.length, 1);
  assert.equal(list[0].backup_id, backup.backup_id);

  // Mutate files
  await fs.writeFile(path.join(packagesDir, "original.txt"), "v2-mutated", "utf8");
  await fs.writeFile(path.join(skillsDir, "new-file.txt"), "v2-added", "utf8");

  // Rollback
  const rollbackResult = await rollbackSkillUpdate({ backupId: backup.backup_id, rootDir: root, backupRoot });
  assert.equal(rollbackResult.success, true);

  // Verify restored
  const restoredContent = await fs.readFile(path.join(packagesDir, "original.txt"), "utf8");
  assert.equal(restoredContent, "v1");

  const addedExists = await fs.access(path.join(skillsDir, "new-file.txt")).then(() => true).catch(() => false);
  assert.equal(addedExists, false);
});

test("Skills Updater: checkSkillUpdates returns structured candidate state", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-updater-check-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const registryRoot = path.join(root, "registry");
  await fs.mkdir(registryRoot, { recursive: true });
  await fs.writeFile(
    path.join(registryRoot, "registry.json"),
    JSON.stringify({ schema_version: 1, sources: [], revisions: [], skills: [] }),
    "utf8"
  );

  const result = await checkSkillUpdates({ registryRoot, rootDir: root });
  assert.equal(result.total_sources, 0);
  assert.equal(result.updates_available_count, 0);
  assert.ok(result.checked_at);
});

test("Skills Updater: applySkillUpdates dry-run mode", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-updater-apply-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const registryRoot = path.join(root, "registry");
  await fs.mkdir(registryRoot, { recursive: true });
  await fs.writeFile(
    path.join(registryRoot, "registry.json"),
    JSON.stringify({ schema_version: 1, sources: [], revisions: [], skills: [] }),
    "utf8"
  );

  const dryResult = await applySkillUpdates({ registryRoot, rootDir: root, dryRun: true });
  assert.equal(dryResult.dry_run, true);
  assert.equal(dryResult.pending_updates_count, 0);

  const applyResult = await applySkillUpdates({ registryRoot, rootDir: root, dryRun: false });
  assert.equal(applyResult.success, true);
  assert.equal(applyResult.applied_count, 0);
});

test("Skills Updater: REST API endpoints for updates, apply, rollback, and backups", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-updater-api-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.mkdir(registryRoot, { recursive: true });

  await fs.writeFile(path.join(catalogRoot, "catalog.json"), JSON.stringify({ schema_version: 1, presets: [], projects: [], activation_history: [] }), "utf8");
  await fs.writeFile(path.join(registryRoot, "registry.json"), JSON.stringify({ schema_version: 1, sources: [], revisions: [], skills: [] }), "utf8");

  const server = await startCatalogServer({ catalogRoot, registryRoot, port: 0 });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  context.after(() => new Promise((resolve) => server.close(resolve)));

  // 1. GET /api/skills/updates
  const checkRes = await fetch(`${baseUrl}/api/skills/updates`);
  assert.equal(checkRes.status, 200);
  const checkJson = await checkRes.json();
  assert.equal(checkJson.total_sources, 0);

  // 2. POST /api/skills/updates/apply
  const applyRes = await fetch(`${baseUrl}/api/skills/updates/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun: true }),
  });
  assert.equal(applyRes.status, 200);
  const applyJson = await applyRes.json();
  assert.equal(applyJson.dry_run, true);

  // 3. GET /api/skills/updates/backups
  const backupsRes = await fetch(`${baseUrl}/api/skills/updates/backups`);
  assert.equal(backupsRes.status, 200);
  const backupsJson = await backupsRes.json();
  assert.ok(Array.isArray(backupsJson.backups));
});
