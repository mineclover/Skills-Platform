const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const { performance } = require("node:perf_hooks");
const { setTimeout: sleep } = require("node:timers/promises");

const contexts = new AsyncLocalStorage();
const hostname = os.hostname();
const user = typeof process.getuid === "function"
  ? process.getuid()
  : crypto.createHash("sha256").update(os.userInfo().username).digest("hex").slice(0, 16);
const lockRoot = path.join(os.tmpdir(), `skills-platform-locks-${user}`);
const ownerNamePattern = /^owner-([a-f0-9-]+)\.json$/;

/** Resolve symlink aliases, including paths whose final directories do not exist yet. */
async function physicalPath(resourcePath) {
  let ancestor = path.resolve(resourcePath);
  const missing = [];
  let danglingLinks = 0;
  while (true) {
    try {
      const physical = path.join(await fs.realpath(ancestor), ...missing);
      // realpath cannot normalize the casing of suffixes that do not exist.
      return process.platform === "win32" ? physical.toLowerCase() : physical;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      let stats;
      try {
        stats = await fs.lstat(ancestor);
      } catch (statError) {
        if (statError.code !== "ENOENT") throw statError;
      }
      if (stats?.isSymbolicLink()) {
        if (++danglingLinks > 40) {
          const loop = new Error(`Too many symbolic links resolving ${resourcePath}`);
          loop.code = "ELOOP";
          throw loop;
        }
        ancestor = path.resolve(path.dirname(ancestor), await fs.readlink(ancestor));
        continue;
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      missing.unshift(path.basename(ancestor));
      ancestor = parent;
    }
  }
}

function optionNumber(options, name, fallback, minimum) {
  const value = options[name] ?? fallback;
  if (!Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${name} must be a finite number greater than or equal to ${minimum}`);
  }
  return value;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM and other uncertainty must never be interpreted as a dead owner.
    return error.code !== "ESRCH";
  }
}

async function removeEmptyDirectory(directory) {
  try {
    await fs.rmdir(directory);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
  }
}

async function unlinkIfPresent(filename) {
  try {
    await fs.unlink(filename);
    return true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return false;
  }
}

async function reclaimAbandonedLock(directory, orphanGraceMs) {
  let entries;
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  if (entries.length === 0) {
    try {
      const stats = await fs.stat(directory);
      if (Date.now() - stats.mtimeMs >= orphanGraceMs) await removeEmptyDirectory(directory);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return;
  }

  for (const entry of entries) {
    const match = ownerNamePattern.exec(entry);
    if (!match) continue;
    const ownerFile = path.join(directory, entry);
    let owner;
    let stats;
    try {
      stats = await fs.stat(ownerFile);
      if (!stats.isFile()) continue;
      const content = await fs.readFile(ownerFile, "utf8");
      try {
        owner = JSON.parse(content);
      } catch {
        owner = null;
      }
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }

    if (owner && typeof owner.hostname === "string" && owner.hostname !== hostname) continue;
    if (owner && owner.hostname === hostname && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
      if (processIsAlive(owner.pid)) continue;
    } else if (Date.now() - stats.mtimeMs < orphanGraceMs) {
      continue;
    }

    // Each acquisition uses a fresh filename. A delayed second reclaimer can
    // only unlink the old owner's file, never a replacement owner's file.
    if (await unlinkIfPresent(ownerFile)) await removeEmptyDirectory(directory);
  }
}

async function releaseLock(directory, ownerFile, token) {
  try {
    const owner = JSON.parse(await fs.readFile(ownerFile, "utf8"));
    if (owner?.token !== token) return;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return;
    throw error;
  }
  if (await unlinkIfPresent(ownerFile)) await removeEmptyDirectory(directory);
}

async function tryAcquireLock(directory, preparedFile, ownerName) {
  try {
    await fs.mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }

  const ownerFile = path.join(directory, ownerName);
  let acquired = false;
  let linked = false;
  try {
    // A hard link publishes complete owner metadata atomically. If this
    // process paused after mkdir and its empty directory was reclaimed,
    // the link either fails or registers alongside the new owner. Only
    // a sole registration may enter the callback.
    await fs.link(preparedFile, ownerFile);
    linked = true;
    const entries = await fs.readdir(directory);
    acquired = entries.length === 1 && entries[0] === ownerName;
    return acquired;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  } finally {
    if (!acquired) {
      if (linked) await unlinkIfPresent(ownerFile);
      await removeEmptyDirectory(directory);
    }
  }
}

/**
 * Serialize cooperating local processes for one physical resource. The callback
 * may acquire the same lock again; unrelated calls in this process still wait.
 */
async function withFileLock(resourcePath, callback, options = {}) {
  if (typeof callback !== "function") throw new TypeError("callback must be a function");
  const timeoutMs = optionNumber(options, "timeoutMs", 30_000, 0);
  const pollMs = optionNumber(options, "pollMs", 25, 1);
  const orphanGraceMs = optionNumber(options, "orphanGraceMs", 1_000, 0);
  const resource = await physicalPath(resourcePath);
  const inherited = contexts.getStore();
  if (inherited?.get(resource)?.active) return await callback();

  const key = crypto.createHash("sha256").update(resource).digest("hex");
  const directory = path.join(lockRoot, key);
  const token = crypto.randomUUID();
  const ownerName = `owner-${token}.json`;
  const ownerFile = path.join(directory, ownerName);
  const preparedFile = path.join(lockRoot, `.prepared-${token}.json`);
  const started = performance.now();
  await fs.mkdir(lockRoot, { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(preparedFile, JSON.stringify({
      token,
      pid: process.pid,
      hostname,
      resource,
      createdAt: new Date().toISOString(),
    }), { flag: "wx", mode: 0o600 });

    while (true) {
      if (await tryAcquireLock(directory, preparedFile, ownerName)) {
        const owned = { active: true };
        const context = new Map(inherited);
        context.set(resource, owned);
        try {
          await unlinkIfPresent(preparedFile);
          return await contexts.run(context, callback);
        } finally {
          owned.active = false;
          await releaseLock(directory, ownerFile, token);
        }
      }

      await reclaimAbandonedLock(directory, orphanGraceMs);
      const remaining = timeoutMs - (performance.now() - started);
      if (remaining <= 0) {
        const error = new Error(`Timed out waiting for file lock: ${resource}`);
        error.code = "FILE_LOCK_TIMEOUT";
        error.resourcePath = resource;
        error.timeoutMs = timeoutMs;
        throw error;
      }
      await sleep(Math.min(pollMs, remaining));
    }
  } finally {
    await unlinkIfPresent(preparedFile);
  }
}

module.exports = { physicalPath, withFileLock };
