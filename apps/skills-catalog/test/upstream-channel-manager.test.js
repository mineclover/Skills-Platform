const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  loadUpstreamChannels,
  saveUpstreamChannels,
  registerUpstreamChannel,
  removeUpstreamChannel,
  checkChannelStatus,
} = require("../src");

test("Upstream Channel Manager: lifecycle (register, list, check, remove)", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-channel-mgr-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  // 1. Initial list initializes default channels
  const initial = await loadUpstreamChannels(root);
  assert.ok(Array.isArray(initial));
  assert.ok(initial.length >= 2);

  // 2. Register custom channel
  const customChannel = await registerUpstreamChannel({
    channelId: "channel_custom_repo",
    displayName: "Custom Community Codex Upstream",
    packageId: "community-codex",
    kind: "git",
    locator: "https://github.com/example/codex-skills.git",
    requestedRef: "main",
    subpath: "skills",
    targetDirectory: "skills-packages/community-codex",
    syncPolicy: "fast-forward-only",
    rootDir: root,
  });

  assert.equal(customChannel.channel_id, "channel_custom_repo");

  // 3. List channels contains new channel
  const updatedList = await loadUpstreamChannels(root);
  assert.ok(updatedList.some((c) => c.channel_id === "channel_custom_repo"));

  // 4. Remove channel
  const removeRes = await removeUpstreamChannel("channel_custom_repo", root);
  assert.equal(removeRes.removed_channel_id, "channel_custom_repo");

  const finalList = await loadUpstreamChannels(root);
  assert.ok(!finalList.some((c) => c.channel_id === "channel_custom_repo"));
});
