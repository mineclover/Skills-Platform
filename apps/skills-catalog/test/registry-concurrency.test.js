const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const test = require("node:test");
const { digestDirectory } = require("@skills-platform/contracts");
const { importLocalSource, importGitSource, loadRegistry, saveRegistry } = require("../src");
const execFileAsync = promisify(execFile);

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "registry-concurrency-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const registryRoot = path.join(root, "registry");
  const sources = [];
  for (let index = 0; index < 6; index += 1) {
    const sourcePath = path.join(root, `source-${index}`);
    await fs.mkdir(sourcePath);
    await fs.writeFile(path.join(sourcePath, "SKILL.md"), `---\nname: skill-${index}\ndescription: Concurrent import fixture.\n---\n# Skill ${index}\n`);
    sources.push(sourcePath);
  }
  return { root, registryRoot, sources };
}

async function verifyRegistry(registryRoot, expectedSkills, expectedSources = expectedSkills) {
  const registry = await loadRegistry(registryRoot);
  assert.equal(registry.skills.length, expectedSkills);
  assert.equal(registry.sources.length, expectedSources);
  assert.equal(new Set(registry.skills.map((skill) => skill.id)).size, expectedSkills);
  for (const skill of registry.skills) assert.equal(await digestDirectory(skill.canonical_path), skill.content_digest);
  return registry;
}

test("concurrent imports of different sources retain every index entry and immutable artifact", async (context) => {
  const f = await fixture(context);
  const results = await Promise.all(f.sources.map((sourcePath) => importLocalSource({ registryRoot: f.registryRoot, sourcePath })));
  assert.equal(results.length, 6);
  await verifyRegistry(f.registryRoot, 6);
});

test("same-source imports reuse artifacts without duplicate copies or losing selected members", async (context) => {
  const f = await fixture(context);
  const sourcePath = path.join(f.root, "combined");
  await fs.mkdir(sourcePath);
  for (const [index, source] of f.sources.entries()) await fs.cp(source, path.join(sourcePath, `member-${index}`), { recursive: true });
  const results = await Promise.all(Array.from({ length: 12 }, (_, index) => importLocalSource({ registryRoot: f.registryRoot, sourcePath, selectedSkillNames: [`skill-${index % 6}`] })));
  assert.equal(new Set(results.map((result) => result.source_revision_id)).size, 1);
  const registry = await verifyRegistry(f.registryRoot, 6, 1);
  assert.equal(registry.revisions.length, 1);
});

test("Git fetches and local imports may run concurrently before serialized Registry publication", async (context) => {
  const f = await fixture(context);
  const repository = f.sources[0];
  await execFileAsync("git", ["init", "--quiet", repository]);
  await execFileAsync("git", ["-C", repository, "config", "user.name", "Fixture"]);
  await execFileAsync("git", ["-C", repository, "config", "user.email", "fixture@example.test"]);
  await execFileAsync("git", ["-C", repository, "add", "SKILL.md"]);
  await execFileAsync("git", ["-C", repository, "commit", "--quiet", "-m", "Fixture"]);
  const { stdout } = await execFileAsync("git", ["-C", repository, "rev-parse", "HEAD"]);
  const results = await Promise.all([
    importGitSource({ registryRoot: f.registryRoot, repository, ref: stdout.trim() }),
    importGitSource({ registryRoot: f.registryRoot, repository, ref: stdout.trim() }),
    importLocalSource({ registryRoot: f.registryRoot, sourcePath: f.sources[1] }),
  ]);
  assert.equal(results[0].source_revision_id, results[1].source_revision_id);
  await verifyRegistry(f.registryRoot, 2);
});

test("stale low-level Registry snapshots cannot erase intervening successful imports", async (context) => {
  const f = await fixture(context);
  await importLocalSource({ registryRoot: f.registryRoot, sourcePath: f.sources[0] });
  const stale = await loadRegistry(f.registryRoot);
  await importLocalSource({ registryRoot: f.registryRoot, sourcePath: f.sources[1] });
  stale.sources[0].requested_ref = "stale";
  await assert.rejects(saveRegistry(f.registryRoot, stale), { code: "REGISTRY_WRITE_CONFLICT" });
  await verifyRegistry(f.registryRoot, 2);
});

test("Registry materialization failure releases the shared import lock for retry", async (context) => {
  const f = await fixture(context);
  const originalCopy = fs.cp;
  fs.cp = async () => { throw new Error("Fixture copy failed"); };
  try {
    await assert.rejects(importLocalSource({ registryRoot: f.registryRoot, sourcePath: f.sources[0] }), /Fixture copy failed/);
  } finally {
    fs.cp = originalCopy;
  }
  await importLocalSource({ registryRoot: f.registryRoot, sourcePath: f.sources[0] });
  await verifyRegistry(f.registryRoot, 1);
});

test("IPC-synchronized processes serialize both identical and different source imports", { timeout: 20000 }, async (context) => {
  const f = await fixture(context);
  await fs.mkdir(f.registryRoot);
  const alias = path.join(f.root, "registry-alias");
  await fs.symlink(f.registryRoot, alias, process.platform === "win32" ? "junction" : "dir");
  const modulePath = path.resolve(__dirname, "../src");
  const code = `const api = require(${JSON.stringify(modulePath)}); process.send({ ready: true }); process.on('message', async args => { try { const result = await api.importLocalSource(args); process.send({ revision: result.source_revision_id }); } catch (error) { process.send({ error: error.message }); } process.disconnect(); });`;
  const children = [0, 0, 1, 2, 3, 4].map((sourceIndex, index) => {
    const child = spawn(process.execPath, ["-e", code], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    context.after(() => { if (child.exitCode === null) child.kill(); });
    let readyResolve;
    let doneResolve;
    let reject;
    const ready = new Promise((resolve) => { readyResolve = resolve; });
    const done = new Promise((resolve, fail) => { doneResolve = resolve; reject = fail; });
    child.on("error", reject);
    child.on("message", (message) => {
      if (message.ready) readyResolve();
      else if (message.error) reject(new Error(message.error));
      else doneResolve(message);
    });
    return { child, ready, done, args: { registryRoot: index % 2 === 0 ? f.registryRoot : alias, sourcePath: f.sources[sourceIndex] } };
  });
  await Promise.all(children.map((item) => item.ready));
  for (const { child, args } of children) child.send(args);
  const results = await Promise.all(children.map((item) => item.done));
  assert.equal(results[0].revision, results[1].revision);
  await verifyRegistry(f.registryRoot, 5);
});
