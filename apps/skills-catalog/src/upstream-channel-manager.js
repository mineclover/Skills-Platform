const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { inspectGitSource, importGitSource, loadRegistry } = require("./registry");
const { createBackupSnapshot } = require("./skills-updater");

const execFileAsync = promisify(execFile);

function defaultRootDir() {
  return path.resolve(__dirname, "..", "..");
}

function channelsFile(rootDir = defaultRootDir()) {
  return path.join(rootDir, ".skills-platform", "upstream-channels.json");
}

function defaultInitialChannels(rootDir = defaultRootDir()) {
  return [
    {
      channel_id: "channel_paperthin",
      display_name: "Paperthin Reflexes & re0 Upstream",
      package_id: "paperthin",
      kind: "git",
      locator: "https://github.com/LilMGenius/paperthin.git",
      requested_ref: "HEAD",
      subpath: "",
      target_directory: "skills-packages/paperthin",
      sync_policy: "fast-forward-only", // fast-forward-only | manual-review | overlay-protect
      auto_track: true,
      last_synced_commit: "3bca079a51bcfff5dafb53d1d7f9f523d66ee317",
      last_checked_at: new Date().toISOString(),
    },
    {
      channel_id: "channel_shared_agents",
      display_name: "Shared Global Agent Pool (~/.agents)",
      package_id: "shared-agents",
      kind: "local_directory",
      locator: path.join(process.env.USERPROFILE || process.env.HOME || "", ".agents", "skills"),
      requested_ref: null,
      subpath: "",
      target_directory: "skills-packages/shared-agents",
      sync_policy: "overlay-protect",
      auto_track: true,
      last_synced_commit: null,
      last_checked_at: new Date().toISOString(),
    },
  ];
}

/**
 * Load or initialize the upstream channel manifest
 */
async function loadUpstreamChannels(rootDir = defaultRootDir()) {
  const filePath = channelsFile(rootDir);
  try {
    const content = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(content);
    return data.channels || [];
  } catch {
    // If not present, initialize with defaults and save
    const defaults = defaultInitialChannels(rootDir);
    await saveUpstreamChannels(defaults, rootDir);
    return defaults;
  }
}

/**
 * Save upstream channels manifest atomically
 */
async function saveUpstreamChannels(channels, rootDir = defaultRootDir()) {
  const filePath = channelsFile(rootDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const manifest = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    channels,
  };
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
  return manifest;
}

/**
 * Register or update an upstream tracking channel
 */
async function registerUpstreamChannel({
  channelId,
  displayName,
  packageId,
  kind = "git",
  locator,
  requestedRef = "HEAD",
  subpath = "",
  targetDirectory,
  syncPolicy = "fast-forward-only",
  autoTrack = true,
  rootDir = defaultRootDir(),
}) {
  if (!channelId || !locator) {
    throw new Error("channelId and locator are required");
  }

  const channels = await loadUpstreamChannels(rootDir);
  const existingIndex = channels.findIndex((c) => c.channel_id === channelId);

  const channelRecord = {
    channel_id: channelId,
    display_name: displayName || channelId,
    package_id: packageId || channelId,
    kind,
    locator,
    requested_ref: requestedRef,
    subpath: subpath || "",
    target_directory: targetDirectory || `skills-packages/${packageId || channelId}`,
    sync_policy: syncPolicy,
    auto_track: autoTrack,
    last_synced_commit: existingIndex >= 0 ? channels[existingIndex].last_synced_commit : null,
    last_checked_at: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    channels[existingIndex] = { ...channels[existingIndex], ...channelRecord };
  } else {
    channels.push(channelRecord);
  }

  await saveUpstreamChannels(channels, rootDir);
  return channelRecord;
}

/**
 * Remove an upstream tracking channel
 */
async function removeUpstreamChannel(channelId, rootDir = defaultRootDir()) {
  const channels = await loadUpstreamChannels(rootDir);
  const filtered = channels.filter((c) => c.channel_id !== channelId);
  if (filtered.length === channels.length) {
    throw new Error(`Upstream channel not found: ${channelId}`);
  }
  await saveUpstreamChannels(filtered, rootDir);
  return { removed_channel_id: channelId, remaining_count: filtered.length };
}

/**
 * Check upstream channel status & detect remote revision drift
 */
async function checkChannelStatus({ channelId, rootDir = defaultRootDir() } = {}) {
  const channels = await loadUpstreamChannels(rootDir);
  const targetChannels = channelId ? channels.filter((c) => c.channel_id === channelId) : channels;

  const results = [];

  for (const ch of targetChannels) {
    let updateAvailable = false;
    let remoteRevision = null;
    let errorDetail = null;

    if (ch.kind === "git") {
      try {
        const inspected = await inspectGitSource({ repository: ch.locator, ref: ch.requested_ref || "HEAD" });
        remoteRevision = inspected.resolved_revision;
        updateAvailable = ch.last_synced_commit !== remoteRevision;
      } catch (err) {
        errorDetail = err.message;
      }
    } else if (ch.kind === "local_directory") {
      try {
        const exists = await fs.access(ch.locator).then(() => true).catch(() => false);
        if (!exists) {
          errorDetail = `Local directory not accessible: ${ch.locator}`;
        }
      } catch (err) {
        errorDetail = err.message;
      }
    }

    results.push({
      channel_id: ch.channel_id,
      display_name: ch.display_name,
      package_id: ch.package_id,
      kind: ch.kind,
      locator: ch.locator,
      requested_ref: ch.requested_ref,
      subpath: ch.subpath,
      target_directory: ch.target_directory,
      sync_policy: ch.sync_policy,
      last_synced_commit: ch.last_synced_commit,
      remote_revision: remoteRevision,
      update_available: updateAvailable,
      checked_at: new Date().toISOString(),
      error: errorDetail,
    });
  }

  return {
    checked_at: new Date().toISOString(),
    total_channels: targetChannels.length,
    updates_available: results.filter((r) => r.update_available).length,
    channels: results,
  };
}

/**
 * Synchronize from upstream channels to local package directory with backup
 */
async function syncChannelRoute({
  channelId,
  rootDir = defaultRootDir(),
  dryRun = false,
  createBackup = true,
  executeFile = execFileAsync,
} = {}) {
  const channels = await loadUpstreamChannels(rootDir);
  const targetChannel = channels.find((c) => c.channel_id === channelId);

  if (!targetChannel) {
    throw new Error(`Upstream channel not found: ${channelId}`);
  }

  const status = await checkChannelStatus({ channelId, rootDir });
  const channelStatus = status.channels[0];

  if (!channelStatus.update_available && targetChannel.last_synced_commit) {
    return {
      channel_id: channelId,
      status: "up_to_date",
      message: "Channel is already synchronized with upstream.",
      synced_commit: targetChannel.last_synced_commit,
    };
  }

  if (dryRun) {
    return {
      channel_id: channelId,
      dry_run: true,
      current_commit: targetChannel.last_synced_commit,
      target_commit: channelStatus.remote_revision,
      target_directory: targetChannel.target_directory,
    };
  }

  // 1. Create backup snapshot
  let backupInfo = null;
  if (createBackup) {
    backupInfo = await createBackupSnapshot({ rootDir, label: `channel-sync-${channelId}` });
  }

  try {
    // 2. Fetch and checkout into temporary location
    if (targetChannel.kind === "git") {
      const tempDir = await fs.mkdtemp(path.join(rootDir, ".skills-platform", "tmp-sync-"));
      try {
        await executeFile("git", ["clone", "--depth", "1", "--branch", targetChannel.requested_ref || "main", targetChannel.locator, tempDir], {
          timeout: 60_000,
        });

        const sourcePath = targetChannel.subpath ? path.join(tempDir, targetChannel.subpath) : tempDir;
        const targetPath = path.join(rootDir, targetChannel.target_directory);

        await fs.mkdir(targetPath, { recursive: true });
        await fs.cp(sourcePath, targetPath, { recursive: true });

        // Update channel last_synced_commit
        targetChannel.last_synced_commit = channelStatus.remote_revision;
        targetChannel.last_checked_at = new Date().toISOString();
        await saveUpstreamChannels(channels, rootDir);

        return {
          success: true,
          channel_id: channelId,
          backup_id: backupInfo?.backup_id,
          synced_commit: channelStatus.remote_revision,
          target_directory: targetChannel.target_directory,
          synced_at: new Date().toISOString(),
        };
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    } else {
      throw new Error(`Sync not implemented for channel kind: ${targetChannel.kind}`);
    }
  } catch (error) {
    throw new Error(`Channel sync failed for ${channelId}: ${error.message}`);
  }
}

module.exports = {
  loadUpstreamChannels,
  saveUpstreamChannels,
  registerUpstreamChannel,
  removeUpstreamChannel,
  checkChannelStatus,
  syncChannelRoute,
};
