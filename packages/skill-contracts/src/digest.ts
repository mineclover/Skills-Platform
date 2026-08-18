import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import * as path from "node:path";

export const DEFAULT_IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  "dist",
  "target",
]);

export async function listFiles(
  root: string,
  relative = "",
  ignoredDirectories: ReadonlySet<string> = DEFAULT_IGNORED_DIRECTORIES,
): Promise<string[]> {
  const directory = path.join(root, relative);
  const entries: Dirent[] = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left: Dirent, right: Dirent) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await listFiles(root, path.join(relative, entry.name), ignoredDirectories)));
      }
    } else if (entry.isFile()) {
      files.push(path.join(relative, entry.name));
    }
  }
  return files;
}

export async function digestDirectory(
  root: string,
  options: { ignoredDirectories?: ReadonlySet<string> } = {},
): Promise<string> {
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
