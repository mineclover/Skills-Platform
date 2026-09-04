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
    hookProjectRoots: [tempDir],
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

    // 4. A project-contained script hook remains registerable.
    const safeScript = path.join(tempDir, ".skills-platform", "hooks", "safe-api-hook.js");
    await fs.mkdir(path.dirname(safeScript), { recursive: true });
    await fs.writeFile(safeScript, "process.stdout.write(JSON.stringify({allow:true}));\n", "utf8");
    const safeRegistration = await fetch(`${baseUrl}/api/hooks/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_path: tempDir,
        sync: false,
        hook: {
          id: "safe-api-hook",
          name: "Safe API hook",
          event: "custom:safe",
          enabled: true,
          handler: { type: "script", target: ".skills-platform/hooks/safe-api-hook.js" },
        },
      }),
    });
    assert.equal(safeRegistration.status, 201);

    // 5. Browser origins outside localhost cannot reach the bridge.
    const crossOrigin = await fetch(`${baseUrl}/api/hooks?project_path=${encodeURIComponent(tempDir)}`, {
      headers: { origin: "https://attacker.example" },
    });
    assert.equal(crossOrigin.status, 403);

    // 6. HTTP registration cannot introduce shell commands, even in an
    // authorized project. Trusted command hooks remain a local CLI concern.
    const commandRegistration = await fetch(`${baseUrl}/api/hooks/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_path: tempDir,
        hook: {
          id: "remote-command",
          name: "Remote command",
          event: "pre_tool_use",
          enabled: true,
          handler: { type: "command", command: "echo should-not-run" },
        },
      }),
    });
    assert.equal(commandRegistration.status, 403);

    // 7. Arbitrary writable paths are outside the hook API trust boundary.
    const unauthorizedPath = await fetch(`${baseUrl}/api/hooks?project_path=${encodeURIComponent(path.dirname(tempDir))}`);
    assert.equal(unauthorizedPath.status, 403);
  } finally {
    server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
