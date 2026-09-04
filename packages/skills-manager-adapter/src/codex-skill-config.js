const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const SKILLS_CONFIG_HEADER = /^\s*\[\[\s*skills\.config\s*\]\]\s*(?:#.*)?$/;
const TABLE_HEADER = /^\s*\[{1,2}[^\]]+\]{1,2}\s*(?:#.*)?$/;
const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
const DEFAULT_LOCK_STALE_MS = 60_000;

function isCodexTarget(target) {
  return String(target?.provider_id ?? "").trim().toLowerCase() === "codex";
}

function isWindowsAbsolute(value) {
  return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

function absoluteConfigPath(value) {
  if (isWindowsAbsolute(value)) return path.win32.normalize(value.replace(/\//g, "\\"));
  return path.resolve(value);
}

function comparableSkillPath(value) {
  if (isWindowsAbsolute(value)) return path.win32.normalize(value.replace(/\//g, "\\")).toLowerCase();
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function resolveCodexConfigPath(target, options = {}) {
  if (!isCodexTarget(target)) return null;
  const explicitPath = options.codexConfigPath;
  if (typeof explicitPath === "string" && explicitPath.trim() !== "") {
    return absoluteConfigPath(explicitPath.trim());
  }
  const explicitHome = options.codexHome;
  if (typeof explicitHome === "string" && explicitHome.trim() !== "") {
    return path.join(absoluteConfigPath(explicitHome.trim()), "config.toml");
  }
  // Node's test runner must never discover and mutate the developer's real
  // Codex configuration. Tests opt in through trusted adapter options.
  if (process.env.NODE_TEST_CONTEXT) return null;
  const configuredHome = process.env.CODEX_HOME;
  if (typeof configuredHome === "string" && configuredHome.trim() !== "") {
    return path.join(absoluteConfigPath(configuredHome.trim()), "config.toml");
  }
  return path.join(os.homedir(), ".codex", "config.toml");
}

function codexSkillManifestPath(operation) {
  return path.resolve(operation.delivery_path, "SKILL.md");
}

function decodeTomlString(rawValue) {
  const value = rawValue.trim();
  if (value.startsWith('"')) {
    let escaped = false;
    for (let index = 1; index < value.length; index += 1) {
      const character = value[index];
      if (character === '"' && !escaped) {
        try {
          return JSON.parse(value.slice(0, index + 1));
        } catch {
          return null;
        }
      }
      if (character === "\\" && !escaped) escaped = true;
      else escaped = false;
    }
    return null;
  }
  if (value.startsWith("'")) {
    const end = value.indexOf("'", 1);
    return end < 0 ? null : value.slice(1, end);
  }
  return null;
}

function encodeTomlString(value) {
  // TOML basic strings and JSON strings share the escaping needed for paths,
  // including Windows backslashes and quotes.
  return JSON.stringify(value);
}

function assignmentInlineComment(body, key) {
  const match = body.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
  if (!match) return "";
  const value = match[1].trimStart();
  if (value.startsWith('"')) {
    let escaped = false;
    for (let index = 1; index < value.length; index += 1) {
      const character = value[index];
      if (character === '"' && !escaped) {
        const suffix = value.slice(index + 1).trim();
        return suffix.startsWith("#") ? ` ${suffix}` : "";
      }
      if (character === "\\" && !escaped) escaped = true;
      else escaped = false;
    }
    return "";
  }
  if (value.startsWith("'")) {
    const end = value.indexOf("'", 1);
    const suffix = end < 0 ? "" : value.slice(end + 1).trim();
    return suffix.startsWith("#") ? ` ${suffix}` : "";
  }
  const commentIndex = value.indexOf("#");
  return commentIndex < 0 ? "" : ` ${value.slice(commentIndex).trim()}`;
}

function splitLines(content) {
  const matches = content.match(/.*(?:\r\n|\n|$)/g) ?? [];
  return matches.filter((line) => line !== "");
}

function lineBody(line) {
  return line.replace(/\r?\n$/, "");
}

function parseSections(content) {
  const lines = splitLines(content);
  const sections = [];
  let current = { kind: "preamble", lines: [] };
  sections.push(current);
  for (const line of lines) {
    const body = lineBody(line);
    if (TABLE_HEADER.test(body)) {
      current = {
        kind: SKILLS_CONFIG_HEADER.test(body) ? "skills_config" : "table",
        lines: [line],
      };
      sections.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return sections;
}

function parseSkillConfigSection(section) {
  let configuredPath = null;
  let enabled = null;
  let pathLineCount = 0;
  let enabledLineCount = 0;
  for (const line of section.lines.slice(1)) {
    const body = lineBody(line);
    const pathMatch = body.match(/^\s*path\s*=\s*(.*)$/);
    if (pathMatch) {
      pathLineCount += 1;
      if (configuredPath === null) configuredPath = decodeTomlString(pathMatch[1]);
      continue;
    }
    const enabledMatch = body.match(/^\s*enabled\s*=\s*(true|false)\s*(?:#.*)?$/i);
    if (enabledMatch) {
      enabledLineCount += 1;
      if (enabled === null) enabled = enabledMatch[1].toLowerCase() === "true";
    }
  }
  return { configuredPath, enabled, pathLineCount, enabledLineCount };
}

function inspectCodexSkillConfigContent(content, skillPath) {
  const comparableTarget = comparableSkillPath(skillPath);
  const matches = [];
  for (const [index, section] of parseSections(content).entries()) {
    if (section.kind !== "skills_config") continue;
    const parsed = parseSkillConfigSection(section);
    if (parsed.configuredPath !== null && comparableSkillPath(parsed.configuredPath) === comparableTarget) {
      matches.push({ index, section, ...parsed });
    }
  }
  const deterministic = matches.length === 1
    && matches[0].pathLineCount === 1
    && matches[0].enabledLineCount === 1
    && typeof matches[0].enabled === "boolean";
  return {
    entry_count: matches.length,
    deterministic,
    enabled: deterministic ? matches[0].enabled : matches.length === 0 ? true : null,
  };
}

function rewriteSkillConfigSection(section, skillPath, enabled) {
  const newline = section.lines.some((line) => line.endsWith("\r\n")) ? "\r\n" : "\n";
  const output = [section.lines[0] ?? `[[skills.config]]${newline}`];
  let wrotePath = false;
  let wroteEnabled = false;
  for (const line of section.lines.slice(1)) {
    const body = lineBody(line);
    if (/^\s*path\s*=/.test(body)) {
      if (!wrotePath) {
        output.push(`path = ${encodeTomlString(skillPath)}${assignmentInlineComment(body, "path")}${newline}`);
        wrotePath = true;
      }
      continue;
    }
    if (/^\s*enabled\s*=/.test(body)) {
      if (!wroteEnabled) {
        output.push(`enabled = ${enabled ? "true" : "false"}${assignmentInlineComment(body, "enabled")}${newline}`);
        wroteEnabled = true;
      }
      continue;
    }
    output.push(line);
  }
  if (!wrotePath) output.push(`path = ${encodeTomlString(skillPath)}${newline}`);
  if (!wroteEnabled) output.push(`enabled = ${enabled ? "true" : "false"}${newline}`);
  return output.join("");
}

function appendSkillConfig(content, skillPath, enabled) {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const separator = content === "" ? "" : content.endsWith(newline) ? newline : `${newline}${newline}`;
  return `${content}${separator}[[skills.config]]${newline}path = ${encodeTomlString(skillPath)}${newline}enabled = ${enabled ? "true" : "false"}${newline}`;
}

function reconcileCodexSkillConfigContent(content, skillPath, enabled) {
  const sections = parseSections(content);
  const comparableTarget = comparableSkillPath(skillPath);
  const matchingIndexes = [];
  for (const [index, section] of sections.entries()) {
    if (section.kind !== "skills_config") continue;
    const parsed = parseSkillConfigSection(section);
    if (parsed.configuredPath !== null && comparableSkillPath(parsed.configuredPath) === comparableTarget) {
      matchingIndexes.push(index);
    }
  }

  // A missing entry means enabled by default. Avoid creating config.toml just
  // to restate that default, but always make disablement explicit.
  if (matchingIndexes.length === 0 && enabled) {
    return { content, changed: false, entry_count_before: 0 };
  }
  if (matchingIndexes.length === 0) {
    return {
      content: appendSkillConfig(content, skillPath, enabled),
      changed: true,
      entry_count_before: 0,
    };
  }

  const firstMatch = matchingIndexes[0];
  const duplicateMatches = new Set(matchingIndexes.slice(1));
  const next = sections.map((section, index) => {
    if (index === firstMatch) return rewriteSkillConfigSection(section, skillPath, enabled);
    if (duplicateMatches.has(index)) return "";
    return section.lines.join("");
  }).join("");
  return {
    content: next,
    changed: next !== content,
    entry_count_before: matchingIndexes.length,
  };
}

async function readConfig(configPath) {
  try {
    return { existed: true, content: await fs.readFile(configPath, "utf8") };
  } catch (error) {
    if (error.code === "ENOENT") return { existed: false, content: "" };
    throw error;
  }
}

async function atomicWrite(configPath, content) {
  await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  const temporary = `${configPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, configPath);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function codexConfigLockPath(configPath) {
  return `${configPath}.skills-platform.lock`;
}

async function acquireCodexConfigFileLock(
  configPath,
  { timeoutMs = DEFAULT_LOCK_TIMEOUT_MS, staleMs = DEFAULT_LOCK_STALE_MS } = {},
) {
  if (!configPath) return async () => {};
  const lockPath = codexConfigLockPath(configPath);
  const ownerPath = path.join(lockPath, "owner.json");
  const token = crypto.randomUUID();
  const deadline = Date.now() + timeoutMs;
  await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });

  while (true) {
    try {
      await fs.mkdir(lockPath, { mode: 0o700 });
      try {
        await fs.writeFile(
          ownerPath,
          `${JSON.stringify({ token, pid: process.pid, acquired_at: new Date().toISOString() })}\n`,
          { encoding: "utf8", flag: "wx", mode: 0o600 },
        );
      } catch (error) {
        await fs.rm(lockPath, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        let owner;
        try {
          owner = JSON.parse(await fs.readFile(ownerPath, "utf8"));
        } catch (error) {
          if (error.code === "ENOENT") return;
          throw error;
        }
        if (owner.token !== token) {
          throw new Error(`refusing to release a Codex config lock owned by another process: ${lockPath}`);
        }
        await fs.rm(lockPath, { recursive: true, force: true });
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let stale = false;
      try {
        const stats = await fs.stat(lockPath);
        stale = Date.now() - stats.mtimeMs > staleMs;
      } catch (statError) {
        if (statError.code === "ENOENT") continue;
        throw statError;
      }
      if (stale) {
        const stalePath = `${lockPath}.stale.${crypto.randomUUID()}`;
        try {
          await fs.rename(lockPath, stalePath);
          await fs.rm(stalePath, { recursive: true, force: true });
          continue;
        } catch (renameError) {
          if (["ENOENT", "EEXIST"].includes(renameError.code)) continue;
          throw renameError;
        }
      }
      if (Date.now() >= deadline) {
        const timeoutError = new Error(`timed out waiting for Codex config lock: ${lockPath}`);
        timeoutError.code = "ERR_CODEX_CONFIG_LOCK_TIMEOUT";
        throw timeoutError;
      }
      await delay(Math.min(50, Math.max(1, deadline - Date.now())));
    }
  }
}

async function withCodexConfigFileLock(configPath, lockOptions, operation) {
  const release = await acquireCodexConfigFileLock(configPath, lockOptions);
  try {
    return await operation();
  } finally {
    await release();
  }
}

async function inspectCodexSkillConfig({ configPath, skillPath }) {
  if (!configPath) {
    return {
      managed: false,
      config_path: null,
      skill_path: skillPath,
      entry_count: 0,
      enabled: null,
      deterministic: false,
    };
  }
  const current = await readConfig(configPath);
  return {
    managed: true,
    config_path: configPath,
    skill_path: skillPath,
    ...inspectCodexSkillConfigContent(current.content, skillPath),
  };
}

async function reconcileCodexSkillConfig({ configPath, skillPath, enabled, lockTimeoutMs, lockStaleMs }) {
  if (!configPath) {
    return {
      result: {
        managed: false,
        changed: false,
        config_path: null,
        skill_path: skillPath,
        enabled,
        restart_required: false,
        reason: "Codex config path is unavailable",
      },
      journal: null,
    };
  }
  const lockOptions = { timeoutMs: lockTimeoutMs, staleMs: lockStaleMs };
  return withCodexConfigFileLock(configPath, lockOptions, async () => {
    const before = await readConfig(configPath);
    const reconciled = reconcileCodexSkillConfigContent(before.content, skillPath, enabled);
    if (!reconciled.changed) {
      return {
        result: {
          managed: true,
          changed: false,
          config_path: configPath,
          skill_path: skillPath,
          enabled,
          entry_count_before: reconciled.entry_count_before,
          restart_required: false,
        },
        journal: null,
      };
    }
    await atomicWrite(configPath, reconciled.content);
    const result = {
      managed: true,
      changed: true,
      config_path: configPath,
      skill_path: skillPath,
      enabled,
      entry_count_before: reconciled.entry_count_before,
      restart_required: true,
    };
    return {
      result,
      journal: {
        result,
        async rollback() {
          return withCodexConfigFileLock(configPath, lockOptions, async () => {
            const current = await readConfig(configPath);
            if (!current.existed || current.content !== reconciled.content) {
              throw new Error(`refusing to roll back Codex config because it changed after reconciliation: ${configPath}`);
            }
            if (before.existed) await atomicWrite(configPath, before.content);
            else await fs.unlink(configPath);
          });
        },
        async commit() {},
      },
    };
  });
}

module.exports = {
  acquireCodexConfigFileLock,
  codexSkillManifestPath,
  codexConfigLockPath,
  inspectCodexSkillConfig,
  inspectCodexSkillConfigContent,
  isCodexTarget,
  reconcileCodexSkillConfig,
  reconcileCodexSkillConfigContent,
  resolveCodexConfigPath,
};
