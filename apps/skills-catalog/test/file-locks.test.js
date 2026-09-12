const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { fork } = require("node:child_process");
const { once } = require("node:events");
const { setTimeout: sleep } = require("node:timers/promises");
const { physicalPath, withFileLock } = require("../src/file-locks");

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-file-lock-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function lockDirectory(resource) {
  const user = typeof process.getuid === "function"
    ? process.getuid()
    : crypto.createHash("sha256").update(os.userInfo().username).digest("hex").slice(0, 16);
  const key = crypto.createHash("sha256").update(await physicalPath(resource)).digest("hex");
  return path.join(os.tmpdir(), `skills-platform-locks-${user}`, key);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function worker(t, root, resource, mode, rounds = 1) {
  const script = path.join(root, `worker-${crypto.randomUUID()}.cjs`);
  await fs.writeFile(script, `
    const fs = require('node:fs/promises');
    const { setTimeout: sleep } = require('node:timers/promises');
    const { withFileLock } = require(${JSON.stringify(require.resolve("../src/file-locks"))});
    const [resource, mode, rounds] = process.argv.slice(2);
    process.once('message', async () => {
      try {
        if (mode === 'hold') {
          await withFileLock(resource, async () => {
            process.send({ type: 'locked' });
            await new Promise(resolve => process.once('message', resolve));
          });
        } else {
          for (let i = 0; i < Number(rounds); i++) {
            await withFileLock(resource, async () => {
              const value = Number(await fs.readFile(resource, 'utf8'));
              await sleep(3);
              await fs.writeFile(resource, String(value + 1));
            }, { pollMs: 2 });
          }
        }
        process.send({ type: 'done' });
        process.disconnect();
      } catch (error) {
        process.send({ type: 'error', message: error.stack });
        process.exitCode = 1;
        process.disconnect();
      }
    });
    process.send({ type: 'ready' });
  `);
  const child = fork(script, [resource, mode, String(rounds)], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
  });
  const messages = [];
  const waiters = [];
  child.on("message", (message) => {
    if (waiters.length) waiters.shift()(message);
    else messages.push(message);
  });
  const next = async (expected) => {
    const message = messages.length ? messages.shift() : await Promise.race([
      new Promise((resolve) => { waiters.push(resolve); }),
      exited.then(([code, signal]) => { throw new Error(`Worker exited before ${expected}: ${code ?? signal}; ${stderr}`); }),
    ]);
    assert.equal(message.type, expected, message.message ?? stderr);
    return message;
  };
  await next("ready");
  return { child, exited, next, start: () => child.send({ type: "start" }) };
}

test("parallel calls in one process preserve every read-modify-write", async (t) => {
  const root = await fixture(t);
  const resource = path.join(root, "counter");
  await fs.writeFile(resource, "0");
  let active = 0;
  let maximum = 0;
  await Promise.all(Array.from({ length: 24 }, () => withFileLock(resource, async () => {
    maximum = Math.max(maximum, ++active);
    const value = Number(await fs.readFile(resource, "utf8"));
    await sleep(2);
    await fs.writeFile(resource, String(value + 1));
    active--;
  }, { pollMs: 2 })));
  assert.equal(await fs.readFile(resource, "utf8"), "24");
  assert.equal(maximum, 1);
  assert.deepEqual(await fs.readdir(root), ["counter"]);
  await assert.rejects(fs.stat(await lockDirectory(resource)), { code: "ENOENT" });
});

test("physical aliases share a lock before missing resource directories are created", async (t) => {
  const root = await fixture(t);
  const actual = path.join(root, "actual");
  const alias = path.join(root, "alias");
  await fs.mkdir(actual);
  await fs.symlink(actual, alias, "dir");
  const firstPath = path.join(actual, "new", "deeper", "resource.json");
  const aliasPath = path.join(alias, "new", "deeper", "resource.json");
  assert.equal(await physicalPath(firstPath), await physicalPath(aliasPath));
  const entered = deferred();
  const release = deferred();
  const first = withFileLock(firstPath, async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  await assert.rejects(withFileLock(aliasPath, async () => assert.fail("alias entered while locked"), {
    timeoutMs: 30, pollMs: 2,
  }), { code: "FILE_LOCK_TIMEOUT" });
  release.resolve();
  await first;
  await assert.rejects(fs.stat(path.join(actual, "new")), { code: "ENOENT" });
});

test("nested acquisition is reentrant and callback exceptions release ownership", async (t) => {
  const root = await fixture(t);
  const resource = path.join(root, "resource");
  const result = await withFileLock(resource, () => withFileLock(resource, async () => "nested", { timeoutMs: 0 }));
  assert.equal(result, "nested");
  const failure = Object.assign(new Error("callback failed"), { code: "ENOENT" });
  await assert.rejects(withFileLock(resource, async () => { throw failure; }), (error) => error === failure);
  assert.equal(await withFileLock(resource, async () => "released", { timeoutMs: 100 }), "released");
});

test("physical paths resolve file symlinks and dangling directory aliases", async (t) => {
  const root = await fixture(t);
  const actual = path.join(root, "actual.json");
  const alias = path.join(root, "alias.json");
  await fs.writeFile(actual, "{}");
  await fs.symlink("actual.json", alias, "file");
  assert.equal(await physicalPath(actual), await physicalPath(alias));
  const future = path.join(root, "future");
  const futureAlias = path.join(root, "future-alias");
  await fs.symlink("future", futureAlias, "dir");
  assert.equal(await physicalPath(path.join(futureAlias, "nested", "catalog.json")),
    await physicalPath(path.join(future, "nested", "catalog.json")));
});

test("Windows missing resource paths have a case-insensitive identity", { skip: process.platform !== "win32" }, async (t) => {
  const root = await fixture(t);
  const first = path.join(root, "Future", "Catalog.json");
  const second = path.join(root, "future", "catalog.JSON");
  assert.equal(await physicalPath(first), await physicalPath(second));
});

test("an unawaited descendant cannot reuse inherited ownership after release", async (t) => {
  const root = await fixture(t);
  const resource = path.join(root, "resource");
  const startDescendant = deferred();
  let descendant;
  await withFileLock(resource, async () => {
    descendant = startDescendant.promise.then(() => withFileLock(resource, async () => "descendant", {
      timeoutMs: 30, pollMs: 2,
    }));
  });
  const held = deferred();
  const release = deferred();
  const holder = withFileLock(resource, async () => {
    held.resolve();
    await release.promise;
  });
  await held.promise;
  startDescendant.resolve();
  await assert.rejects(descendant, { code: "FILE_LOCK_TIMEOUT" });
  release.resolve();
  await holder;
});

test("a live owner is not reclaimed even when its metadata is very old", async (t) => {
  const root = await fixture(t);
  const resource = path.join(root, "resource");
  const held = await worker(t, root, resource, "hold");
  held.start();
  await held.next("locked");
  const directory = await lockDirectory(resource);
  const [ownerName] = await fs.readdir(directory);
  await fs.utimes(path.join(directory, ownerName), new Date(0), new Date(0));
  await assert.rejects(withFileLock(resource, async () => assert.fail("stole live lock"), {
    timeoutMs: 40, pollMs: 2, orphanGraceMs: 1,
  }), { code: "FILE_LOCK_TIMEOUT" });
  held.child.send({ type: "release" });
  await held.next("done");
  await held.exited;
});

test("a crashed owner is reclaimed by competing callers without losing exclusion", async (t) => {
  const root = await fixture(t);
  const resource = path.join(root, "resource");
  const held = await worker(t, root, resource, "hold");
  held.start();
  await held.next("locked");
  held.child.kill("SIGKILL");
  await held.exited;
  let active = 0;
  let maximum = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: 12 }, () => withFileLock(resource, async () => {
    maximum = Math.max(maximum, ++active);
    await sleep(2);
    completed++;
    active--;
  }, { timeoutMs: 2_000, pollMs: 1 })));
  assert.equal(maximum, 1);
  assert.equal(completed, 12);
});

test("incomplete owner setup recovers after the orphan grace period", async (t) => {
  const root = await fixture(t);
  const resource = path.join(root, "resource");
  const directory = await lockDirectory(resource);
  await fs.mkdir(directory, { recursive: true });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await assert.rejects(withFileLock(resource, async () => assert.fail("reclaimed too early"), {
    timeoutMs: 20, pollMs: 2, orphanGraceMs: 10_000,
  }), { code: "FILE_LOCK_TIMEOUT" });
  await fs.utimes(directory, new Date(0), new Date(0));
  assert.equal(await withFileLock(resource, async () => "recovered", { timeoutMs: 100, pollMs: 1 }), "recovered");

  await fs.mkdir(directory);
  const incompleteFile = path.join(directory, `owner-${crypto.randomUUID()}.json`);
  await fs.writeFile(incompleteFile, "{");
  await fs.utimes(incompleteFile, new Date(0), new Date(0));
  assert.equal(await withFileLock(resource, async () => "recovered metadata", { timeoutMs: 100, pollMs: 1 }), "recovered metadata");
});

test("release preserves a lock whose ownership token changed", async (t) => {
  const root = await fixture(t);
  const resource = path.join(root, "resource");
  const directory = await lockDirectory(resource);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let ownerFile;
  await withFileLock(resource, async () => {
    const [ownerName] = await fs.readdir(directory);
    ownerFile = path.join(directory, ownerName);
    const owner = JSON.parse(await fs.readFile(ownerFile, "utf8"));
    owner.token = crypto.randomUUID();
    await fs.writeFile(ownerFile, JSON.stringify(owner));
  });
  assert.equal((await fs.stat(ownerFile)).isFile(), true);
});

test("two IPC-synchronized processes serialize read-modify-write operations", async (t) => {
  const root = await fixture(t);
  const resource = path.join(root, "counter");
  await fs.writeFile(resource, "0");
  const first = await worker(t, root, resource, "increment", 15);
  const second = await worker(t, root, resource, "increment", 15);
  first.start();
  second.start();
  await Promise.all([first.next("done"), second.next("done")]);
  const exits = await Promise.all([first.exited, second.exited]);
  assert.deepEqual(exits, [[0, null], [0, null]]);
  assert.equal(await fs.readFile(resource, "utf8"), "30");
});
