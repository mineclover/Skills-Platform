const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "../../..");
const { createCatalogServer } = require(path.join(
  ROOT,
  "apps/skills-catalog/src/server"
));

test("Tier 1 - F19.1: HTTP server /api/hooks endpoints support list, toggle, register, and trigger", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gov-api-e2e-"));
  const catDir = path.join(tempDir, "cat");
  const regDir = path.join(tempDir, "reg");
  await fs.mkdir(catDir, { recursive: true });
  await fs.mkdir(regDir, { recursive: true });

  const server = createCatalogServer({
    catalogRoot: catDir,
    registryRoot: regDir,
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /api/hooks
    const listRes = await fetch(`${baseUrl}/api/hooks?project_path=${encodeURIComponent(tempDir)}`);
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.ok(Array.isArray(listBody.hooks));

    // 2. POST /api/hooks/toggle
    const toggleRes = await fetch(`${baseUrl}/api/hooks/toggle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_path: tempDir,
        hook_id: "secret-leak-guard",
        enabled: false,
      }),
    });
    assert.equal(toggleRes.status, 200);
    const toggleBody = await toggleRes.json();
    assert.equal(toggleBody.enabled, false);

    // 3. POST /api/hooks/trigger
    const triggerRes = await fetch(`${baseUrl}/api/hooks/trigger`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_path: tempDir,
        event: "pre_tool_use",
        payload: { tool: "run_command", CommandLine: "echo safe" },
      }),
    });
    assert.equal(triggerRes.status, 200);
    const triggerBody = await triggerRes.json();
    assert.equal(triggerBody.allow, true);
  } finally {
    server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
