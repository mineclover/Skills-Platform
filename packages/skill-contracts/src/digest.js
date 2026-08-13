const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "target"]);

async function listFiles(root, relative = "", ignoredDirectories = DEFAULT_IGNORED_DIRECTORIES) {
  const directory = path.join(root, relative);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await listFiles(root, path.join(relative, entry.name), ignoredDirectories));
      }
    } else if (entry.isFile()) {
      files.push(path.join(relative, entry.name));
    }
  }
  return files;
}

async function digestDirectory(root, options = {}) {
  const hash = crypto.createHash("sha256");
  const ignoredDirectories = options.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES;
  for (const relativePath of await listFiles(root, "", ignoredDirectories)) {
    hash.update(relativePath.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await fs.readFile(path.join(root, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

module.exports = { DEFAULT_IGNORED_DIRECTORIES, digestDirectory, listFiles };
