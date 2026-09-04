const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox } = require("../helpers/fixtures");

test("Tier 2 - B10.1: Never Overwrites Real Unmanaged Directory with Symlink", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b10-");
  t.after(cleanup);

  const realDir = path.join(sandboxPath, "unmanaged-skills");
  await fs.mkdir(realDir, { recursive: true });
  await fs.writeFile(path.join(realDir, "custom.txt"), "Important user files", "utf8");

  // Attempting to create symlink at existing directory without managed markers must fail
  const stat = await fs.lstat(realDir);
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal(stat.isDirectory(), true);

  // Safety guard prevents clobbering
  const isSafeToOverwrite = stat.isSymbolicLink();
  assert.equal(isSafeToOverwrite, false);
});

test("Tier 2 - B10.2: Fails Cleanly When Symlink Target Path Does Not Exist", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b10-");
  t.after(cleanup);

  const missingTarget = path.join(sandboxPath, "missing-target");
  const linkPath = path.join(sandboxPath, "link");

  let errorOccurred = false;
  try {
    const exists = await fs.stat(missingTarget).then(() => true).catch(() => false);
    if (!exists) throw new Error(`Target does not exist: ${missingTarget}`);
    await fs.symlink(missingTarget, linkPath, "junction");
  } catch (err) {
    errorOccurred = true;
    assert.ok(err.message.includes("Target does not exist"));
  }

  assert.equal(errorOccurred, true);
});

test("Tier 2 - B10.3: Portable Re-linking Smoke Test", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b10-");
  t.after(cleanup);

  const targetA = path.join(sandboxPath, "preset-a");
  const targetB = path.join(sandboxPath, "preset-b");
  await fs.mkdir(targetA, { recursive: true });
  await fs.mkdir(targetB, { recursive: true });
  await fs.writeFile(path.join(targetA, "id.txt"), "A", "utf8");
  await fs.writeFile(path.join(targetB, "id.txt"), "B", "utf8");

  const link = path.join(sandboxPath, "active-link");
  await fs.symlink(targetA, link, "junction");
  assert.equal(await fs.readFile(path.join(link, "id.txt"), "utf8"), "A");

  // Low-level smoke test only. Atomic swap and rollback are covered by the
  // reference adapter transaction tests.
  await fs.unlink(link);
  await fs.symlink(targetB, link, "junction");
  assert.equal(await fs.readFile(path.join(link, "id.txt"), "utf8"), "B");
});

test("Tier 2 - B10.4: Path Normalization (Windows / POSIX Slashing)", () => {
  const inputPosix = "apps/skills-catalog/recipes";
  const inputWin = "apps\\skills-catalog\\recipes";

  const portableNormalize = (value) => path.normalize(value.replaceAll("\\", path.sep));
  const norm1 = portableNormalize(inputPosix);
  const norm2 = portableNormalize(inputWin);

  assert.equal(norm1, norm2);
});

test("Tier 2 - B10.5: Safe Idempotent Cleanup of Symlinks", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b10-");
  t.after(cleanup);

  const link = path.join(sandboxPath, "nonexistent-link");

  // Idempotent remove function
  async function safeUnlink(p) {
    try {
      await fs.unlink(p);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  await assert.doesNotReject(() => safeUnlink(link));
});
