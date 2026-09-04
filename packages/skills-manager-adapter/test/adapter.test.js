const assert = require("node:assert/strict");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { createActivationPlan, digestDirectory } = require("@skills-platform/contracts");
const adapter = require("../src");
const {
  COPY_OWNERSHIP_FILE,
} = adapter;
const {
  acquireCodexConfigFileLock,
  codexConfigLockPath,
  inspectCodexSkillConfigContent,
  reconcileCodexSkillConfigContent,
  resolveCodexConfigPath,
} = require("../src/codex-skill-config");

const LINK_OWNERSHIP_SUFFIX = ".skills-platform-link-ownership.json";

function isolatedCodexConfigPath(plan) {
  const projectPath = plan.target?.project_path;
  const base = projectPath
    ? path.resolve(projectPath)
    : path.dirname(path.resolve(plan.operations[0].delivery_path));
  return path.join(base, ".codex-test-home", "config.toml");
}

function withIsolatedCodexConfig(plan, options = {}) {
  return { codexConfigPath: isolatedCodexConfigPath(plan), ...options };
}

function previewActivationPlan(plan, options = {}) {
  return adapter.previewActivationPlan(plan, withIsolatedCodexConfig(plan, options));
}

function applyActivationPlan(plan, options = {}) {
  return adapter.applyActivationPlan(plan, withIsolatedCodexConfig(plan, options));
}

function applyActivationPlanEvents(plan, options = {}) {
  return adapter.applyActivationPlanEvents(plan, withIsolatedCodexConfig(plan, options));
}

function materialize(previewOperation, options = {}) {
  const planShape = {
    target: previewOperation.delivery_guard?.target,
    operations: [previewOperation.operation],
  };
  return adapter.materialize(previewOperation, withIsolatedCodexConfig(planShape, options));
}

async function fixture(context, desiredState = "enabled", { method = "symlink", target } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-manager-adapter-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const registryRoot = path.join(root, "registry");
  const canonicalPath = path.join(registryRoot, "revisions", "revision_demo", "artifacts", "demo");
  const projectPath = path.join(root, "project");
  const deliveryPath = path.join(projectPath, ".agents", "skills", "demo");
  const codexConfigPath = path.join(projectPath, ".codex-test-home", "config.toml");
  await fs.mkdir(canonicalPath, { recursive: true });
  await fs.writeFile(path.join(canonicalPath, "SKILL.md"), "---\nname: demo\ndescription: Demo.\n---\n");
  const plan = createActivationPlan({
    mode: desiredState === "disabled" ? "pristine" : "apply",
    target: {
      provider_id: "codex",
      scope: "project",
      project_id: "demo",
      project_path: projectPath,
      ...(target ?? {}),
    },
    distribution: { method },
    operations: [{
      registry_skill_id: "skill_demo",
      skill_name: "demo",
      source_revision_id: "revision_demo",
      content_digest: await digestDirectory(canonicalPath),
      canonical_path: canonicalPath,
      delivery_path: deliveryPath,
      desired_state: desiredState,
    }],
  });
  return { canonicalPath, codexConfigPath, deliveryPath, plan, projectPath, registryRoot, root };
}

async function writeRegistryIndex(registryRoot, entries) {
  await fs.writeFile(path.join(registryRoot, "registry.json"), `${JSON.stringify({
    schema_version: 2,
    skills: entries.map(({ operation, lineageId }) => ({
      id: operation.registry_skill_id,
      skill_name: operation.skill_name,
      source_revision_id: operation.source_revision_id,
      content_digest: operation.content_digest,
      lineage_id: lineageId,
      canonical_relative_path: path.relative(registryRoot, operation.canonical_path).replaceAll("\\", "/"),
    })),
  }, null, 2)}\n`, "utf8");
}

test("previews and materializes a verified symbolic link only after confirmation", async (context) => {
  const { canonicalPath, deliveryPath, plan } = await fixture(context);
  const preview = await previewActivationPlan(plan);
  assert.equal(preview.valid, true);
  assert.equal(preview.operations[0].status, "create");
  await assert.rejects(() => applyActivationPlan(plan), /Explicit confirmation/);

  const report = await applyActivationPlan(plan, { confirm: true });
  assert.equal(report.status, "completed");
  assert.equal(report.summary.applied, 1);
  assert.equal((await fs.lstat(deliveryPath)).isSymbolicLink(), true);
  assert.equal(path.resolve(await fs.realpath(deliveryPath)), path.resolve(await fs.realpath(canonicalPath)));
  assert.equal((await previewActivationPlan(plan)).operations[0].status, "noop");
});

test("re-enables an installed Codex skill through one deduplicated skills.config entry", async (context) => {
  const { codexConfigPath, deliveryPath, plan } = await fixture(context);
  await applyActivationPlan(plan, { confirm: true });
  const manifestPath = path.join(deliveryPath, "SKILL.md");
  await fs.mkdir(path.dirname(codexConfigPath), { recursive: true });
  const original = [
    "# keep this user comment",
    "model = \"gpt-test\"",
    "",
    "[[skills.config]]",
    `path = ${JSON.stringify(manifestPath)} # keep path comment`,
    "enabled = false # keep enabled comment",
    "note = \"keep this field\"",
    "",
    "[[skills.config]]",
    `path = ${JSON.stringify(manifestPath)}`,
    "enabled = false",
    "",
    "[mcp_servers.demo]",
    "url = \"https://example.test/mcp\"",
    "",
  ].join("\n");
  await fs.writeFile(codexConfigPath, original, "utf8");

  const preview = await previewActivationPlan(plan);
  assert.equal(preview.operations[0].status, "noop");
  assert.equal(preview.operations[0].codex_config.action, "enable");
  assert.equal(preview.operations[0].restart_required, true);

  const report = await applyActivationPlan(plan, { confirm: true });
  assert.equal(report.status, "completed");
  assert.equal(report.summary.applied, 1);
  assert.equal(report.operations[0].codex_config.changed, true);
  assert.equal(report.operations[0].codex_config.enabled, true);
  assert.equal(report.operations[0].restart_required, true);
  assert.equal((await fs.lstat(deliveryPath)).isSymbolicLink(), true);

  const updated = await fs.readFile(codexConfigPath, "utf8");
  assert.match(updated, /# keep this user comment/);
  assert.match(updated, /note = "keep this field"/);
  assert.match(updated, /# keep path comment/);
  assert.match(updated, /# keep enabled comment/);
  assert.match(updated, /\[mcp_servers\.demo\]/);
  const inspected = inspectCodexSkillConfigContent(updated, manifestPath);
  assert.equal(inspected.entry_count, 1);
  assert.equal(inspected.deterministic, true);
  assert.equal(inspected.enabled, true);
});

test("Codex disable keeps unlink semantics and records an absolute disabled SKILL.md path", async (context) => {
  const { codexConfigPath, deliveryPath, plan } = await fixture(context);
  await applyActivationPlan(plan, { confirm: true });
  const disabledPlan = createActivationPlan({
    mode: "pristine",
    target: plan.target,
    operations: [{ ...plan.operations[0], desired_state: "disabled" }],
  });

  const report = await applyActivationPlan(disabledPlan, { confirm: true });
  assert.equal(report.status, "completed");
  await assert.rejects(() => fs.lstat(deliveryPath), { code: "ENOENT" });
  const content = await fs.readFile(codexConfigPath, "utf8");
  const manifestPath = path.resolve(deliveryPath, "SKILL.md");
  assert.equal(inspectCodexSkillConfigContent(content, manifestPath).enabled, false);
  assert.ok(content.includes(`path = ${JSON.stringify(manifestPath)}`));
});

test("Codex config serialization escapes Windows paths and preserves unrelated TOML", () => {
  const windowsManifest = "C:\\Users\\Demo User\\repo\\.agents\\skills\\demo\\SKILL.md";
  const original = "# header\r\nmodel = \"gpt-test\"\r\n";
  const reconciled = reconcileCodexSkillConfigContent(original, windowsManifest, false);

  assert.equal(reconciled.changed, true);
  assert.match(reconciled.content, /# header\r\nmodel = "gpt-test"/);
  assert.match(reconciled.content, /path = "C:\\\\Users\\\\Demo User\\\\repo/);
  assert.equal(inspectCodexSkillConfigContent(reconciled.content, windowsManifest).enabled, false);

  const hashPath = path.resolve("/tmp", "repo#one", ".agents", "skills", "demo", "SKILL.md");
  const withInlineComment = `[[skills.config]]\npath = ${JSON.stringify(hashPath)} # keep\nenabled = false\n`;
  assert.equal(inspectCodexSkillConfigContent(withInlineComment, hashPath).enabled, false);
});

test("Codex config path accepts only trusted adapter overrides, not activation target fields", () => {
  const trustedPath = path.resolve("/tmp", "trusted-codex-config.toml");
  const untrustedTarget = {
    provider_id: "codex",
    codex_config_path: path.resolve("/tmp", "untrusted-target.toml"),
    codex_home: path.resolve("/tmp", "untrusted-home"),
  };
  const resolved = resolveCodexConfigPath(
    untrustedTarget,
    { codexConfigPath: trustedPath },
  );
  assert.equal(resolved, trustedPath);
  assert.equal(resolveCodexConfigPath(untrustedTarget), null);
});

test("Codex config reconciliation uses a cross-process lock with bounded waiting", async (context) => {
  const { codexConfigPath, deliveryPath } = await fixture(context);
  const manifestPath = path.join(deliveryPath, "SKILL.md");
  const release = await acquireCodexConfigFileLock(codexConfigPath);
  const modulePath = require.resolve("../src/codex-skill-config");
  const childSource = `
const { reconcileCodexSkillConfig } = require(process.argv[1]);
reconcileCodexSkillConfig({
  configPath: process.argv[2],
  skillPath: process.argv[3],
  enabled: false,
  lockTimeoutMs: 120,
}).then(() => process.exit(0)).catch((error) => {
  process.stderr.write(String(error.code || "ERROR") + ":" + error.message);
  process.exit(2);
});
`;

  const blocked = spawnSync(
    process.execPath,
    ["-e", childSource, modulePath, codexConfigPath, manifestPath],
    { encoding: "utf8", timeout: 5_000 },
  );
  assert.equal(blocked.status, 2, blocked.stderr);
  assert.match(blocked.stderr, /ERR_CODEX_CONFIG_LOCK_TIMEOUT/);

  await release();
  await assert.rejects(() => fs.stat(codexConfigLockPath(codexConfigPath)), { code: "ENOENT" });

  const succeeded = spawnSync(
    process.execPath,
    ["-e", childSource, modulePath, codexConfigPath, manifestPath],
    { encoding: "utf8", timeout: 5_000 },
  );
  assert.equal(succeeded.status, 0, succeeded.stderr);
  const content = await fs.readFile(codexConfigPath, "utf8");
  assert.equal(inspectCodexSkillConfigContent(content, manifestPath).enabled, false);
});

test("removes only a managed delivery link for the pristine plan", async (context) => {
  const enabled = await fixture(context);
  await applyActivationPlan(enabled.plan, { confirm: true });
  const disabledPlan = createActivationPlan({
    mode: "pristine",
    target: enabled.plan.target,
    operations: [{ ...enabled.plan.operations[0], desired_state: "disabled" }],
  });

  const preview = await previewActivationPlan(disabledPlan);
  assert.equal(preview.operations[0].status, "remove");
  await applyActivationPlan(disabledPlan, { confirm: true });
  await assert.rejects(() => fs.lstat(enabled.deliveryPath), { code: "ENOENT" });
  await assert.rejects(() => fs.lstat(`${enabled.deliveryPath}${LINK_OWNERSHIP_SUFFIX}`), { code: "ENOENT" });
});

test("never overwrites an unmanaged directory at a delivery path", async (context) => {
  const { deliveryPath, plan } = await fixture(context);
  await fs.mkdir(deliveryPath, { recursive: true });
  const preview = await previewActivationPlan(plan);
  assert.equal(preview.valid, false);
  assert.equal(preview.operations[0].status, "conflict");
  await assert.rejects(() => applyActivationPlan(plan, { confirm: true }), /cannot be applied/);
});

test("exported materialize rejects conflict, invalid, and unknown preview statuses", async (context) => {
  const conflicted = await fixture(context);
  await fs.mkdir(conflicted.deliveryPath, { recursive: true });
  const conflictPreview = await previewActivationPlan(conflicted.plan);
  assert.equal(conflictPreview.operations[0].status, "conflict");
  await assert.rejects(() => materialize(conflictPreview.operations[0]), /cannot materialize a conflict/);
  assert.equal((await fs.lstat(conflicted.deliveryPath)).isDirectory(), true);

  const invalid = await fixture(context);
  await fs.rm(invalid.canonicalPath, { recursive: true });
  const invalidPreview = await previewActivationPlan(invalid.plan);
  assert.equal(invalidPreview.operations[0].status, "invalid");
  await assert.rejects(() => materialize(invalidPreview.operations[0]), /cannot materialize an invalid/);
  await assert.rejects(() => fs.lstat(invalid.deliveryPath), { code: "ENOENT" });

  const valid = await fixture(context);
  const validPreview = await previewActivationPlan(valid.plan);
  await assert.rejects(
    () => materialize({ ...validPreview.operations[0], status: "unexpected" }),
    /unknown preview status/,
  );
  await assert.rejects(() => fs.lstat(valid.deliveryPath), { code: "ENOENT" });
});

test("refuses to disable a symlink or copy owned by a different skill identity", async (context) => {
  for (const method of ["symlink", "copy"]) {
    const item = await fixture(context, "enabled", { method });
    await applyActivationPlan(item.plan, { confirm: true });
    const foreignPlan = createActivationPlan({
      mode: "pristine",
      target: item.plan.target,
      distribution: { method },
      operations: [{
        ...item.plan.operations[0],
        registry_skill_id: "skill_foreign",
        skill_name: "foreign",
        desired_state: "disabled",
      }],
    });

    const preview = await previewActivationPlan(foreignPlan);
    assert.equal(preview.valid, false, method);
    assert.equal(preview.operations[0].status, "conflict", method);
    await assert.rejects(() => applyActivationPlan(foreignPlan, { confirm: true }), /cannot be applied/);
    assert.ok(await fs.lstat(item.deliveryPath));
  }
});

test("legacy symlinks require registry-proven lineage before replace or disable", async (context) => {
  const item = await fixture(context);
  const foreignCanonical = path.join(item.registryRoot, "revisions", "revision_foreign", "artifacts", "foreign");
  const previousCanonical = path.join(item.registryRoot, "revisions", "revision_previous", "artifacts", "demo");
  await fs.mkdir(foreignCanonical, { recursive: true });
  await fs.mkdir(previousCanonical, { recursive: true });
  await fs.writeFile(path.join(foreignCanonical, "SKILL.md"), "---\nname: foreign\ndescription: Foreign.\n---\n", "utf8");
  await fs.writeFile(path.join(previousCanonical, "SKILL.md"), "---\nname: demo\ndescription: Previous.\n---\n", "utf8");
  const foreignOperation = {
    registry_skill_id: "skill_foreign",
    skill_name: "foreign",
    source_revision_id: "revision_foreign",
    content_digest: await digestDirectory(foreignCanonical),
    canonical_path: foreignCanonical,
    delivery_path: item.deliveryPath,
    desired_state: "enabled",
  };
  const previousOperation = {
    ...item.plan.operations[0],
    registry_skill_id: "skill_demo_previous",
    source_revision_id: "revision_previous",
    content_digest: await digestDirectory(previousCanonical),
    canonical_path: previousCanonical,
  };
  await writeRegistryIndex(item.registryRoot, [
    { operation: item.plan.operations[0], lineageId: "lineage_demo" },
    { operation: previousOperation, lineageId: "lineage_demo" },
    { operation: foreignOperation, lineageId: "lineage_foreign" },
  ]);
  await fs.mkdir(path.dirname(item.deliveryPath), { recursive: true });
  await fs.symlink(foreignCanonical, item.deliveryPath, process.platform === "win32" ? "junction" : "dir");
  const foreignPreview = await previewActivationPlan(item.plan);
  assert.equal(foreignPreview.valid, false);
  assert.equal(foreignPreview.operations[0].status, "conflict");

  await fs.unlink(item.deliveryPath);
  await fs.symlink(previousCanonical, item.deliveryPath, process.platform === "win32" ? "junction" : "dir");
  const previousPreview = await previewActivationPlan(item.plan);
  assert.equal(previousPreview.valid, true);
  assert.equal(previousPreview.operations[0].status, "replace");
  const disabledPlan = createActivationPlan({
    mode: "pristine",
    target: item.plan.target,
    operations: [{ ...item.plan.operations[0], desired_state: "disabled" }],
  });
  const disabledPreview = await previewActivationPlan(disabledPlan);
  assert.equal(disabledPreview.valid, true);
  assert.equal(disabledPreview.operations[0].status, "remove");
});

test("fails closed for a legacy symlink when neither ownership nor registry identity is available", async (context) => {
  const item = await fixture(context);
  await fs.mkdir(path.dirname(item.deliveryPath), { recursive: true });
  await fs.symlink(item.canonicalPath, item.deliveryPath, process.platform === "win32" ? "junction" : "dir");

  const preview = await previewActivationPlan(item.plan);
  assert.equal(preview.valid, false);
  assert.equal(preview.operations[0].status, "conflict");
  await assert.rejects(() => applyActivationPlan(item.plan, { confirm: true }), /cannot be applied/);
  assert.equal((await fs.lstat(item.deliveryPath)).isSymbolicLink(), true);
});

test("streams preview, per-operation progress, and the persisted final report", async (context) => {
  const { plan } = await fixture(context);
  const events = [];
  for await (const event of applyActivationPlanEvents(plan, { confirm: true })) events.push(event);

  assert.deepEqual(events.map((event) => event.type), ["preview", "operation", "complete"]);
  assert.equal(events[1].processed_count, 1);
  assert.equal(events[1].total_count, 1);
  assert.equal(events[2].report.summary.applied, 1);
  assert.equal(events[2].report.status, "completed");
});

test("removes a dangling managed link without requiring the missing canonical revision", async (context) => {
  const enabled = await fixture(context);
  await applyActivationPlan(enabled.plan, { confirm: true });
  await fs.rm(enabled.canonicalPath, { recursive: true });
  const disabledPlan = createActivationPlan({
    mode: "pristine",
    target: enabled.plan.target,
    operations: [{ ...enabled.plan.operations[0], desired_state: "disabled" }],
  });

  const preview = await previewActivationPlan(disabledPlan);
  assert.equal(preview.valid, true);
  assert.equal(preview.operations[0].status, "remove");
  const report = await applyActivationPlan(disabledPlan, { confirm: true });
  assert.equal(report.status, "completed");
  await assert.rejects(() => fs.lstat(enabled.deliveryPath), { code: "ENOENT" });
});

test("keeps an absent disabled binding as a filesystem noop while recording Codex disablement", async (context) => {
  const disabled = await fixture(context, "disabled");
  await fs.rm(disabled.canonicalPath, { recursive: true });

  const preview = await previewActivationPlan(disabled.plan);
  assert.equal(preview.valid, true);
  assert.equal(preview.operations[0].status, "noop");
  const report = await applyActivationPlan(disabled.plan, { confirm: true });
  assert.equal(report.status, "completed");
  assert.equal(report.summary.applied, 1);
  assert.equal(report.operations[0].codex_config.changed, true);
  assert.equal(
    inspectCodexSkillConfigContent(
      await fs.readFile(disabled.codexConfigPath, "utf8"),
      path.join(disabled.deliveryPath, "SKILL.md"),
    ).enabled,
    false,
  );
});

test("materializes owned copies idempotently and disables them after the canonical revision disappears", async (context) => {
  const copied = await fixture(context, "enabled", { method: "copy" });
  const first = await applyActivationPlan(copied.plan, { confirm: true });
  assert.equal(first.status, "completed");
  assert.equal((await fs.lstat(copied.deliveryPath)).isDirectory(), true);
  assert.equal((await fs.lstat(path.join(copied.deliveryPath, COPY_OWNERSHIP_FILE))).isFile(), true);
  assert.match(await fs.readFile(path.join(copied.deliveryPath, "SKILL.md"), "utf8"), /name: demo/);

  const second = await applyActivationPlan(copied.plan, { confirm: true });
  assert.equal(second.summary.applied, 0);
  assert.equal(second.summary.skipped, 1);

  await fs.rm(copied.canonicalPath, { recursive: true });
  const disabledPlan = createActivationPlan({
    mode: "pristine",
    target: copied.plan.target,
    distribution: { method: "copy" },
    operations: [{ ...copied.plan.operations[0], desired_state: "disabled" }],
  });
  assert.equal((await previewActivationPlan(disabledPlan)).operations[0].status, "remove");
  const removed = await applyActivationPlan(disabledPlan, { confirm: true });
  assert.equal(removed.status, "completed");
  await assert.rejects(() => fs.lstat(copied.deliveryPath), { code: "ENOENT" });
});

test("does not remove an owned copy whose delivered payload was modified", async (context) => {
  const copied = await fixture(context, "enabled", { method: "copy" });
  await applyActivationPlan(copied.plan, { confirm: true });
  await fs.writeFile(path.join(copied.deliveryPath, "local-note.txt"), "user change\n", "utf8");
  const disabledPlan = createActivationPlan({
    mode: "pristine",
    target: copied.plan.target,
    distribution: { method: "copy" },
    operations: [{ ...copied.plan.operations[0], desired_state: "disabled" }],
  });

  const preview = await previewActivationPlan(disabledPlan);
  assert.equal(preview.valid, false);
  assert.equal(preview.operations[0].status, "conflict");
  await assert.rejects(() => applyActivationPlan(disabledPlan, { confirm: true }), /cannot be applied/);
  assert.equal(await fs.readFile(path.join(copied.deliveryPath, "local-note.txt"), "utf8"), "user change\n");
});

test("detects user data added under digest-ignored directories before removing an owned copy", async (context) => {
  const copied = await fixture(context, "enabled", { method: "copy" });
  await applyActivationPlan(copied.plan, { confirm: true });
  const userData = path.join(copied.deliveryPath, "node_modules", "USER-DATA.txt");
  await fs.mkdir(path.dirname(userData), { recursive: true });
  await fs.writeFile(userData, "preserve me\n", "utf8");
  const disabledPlan = createActivationPlan({
    mode: "pristine",
    target: copied.plan.target,
    distribution: { method: "copy" },
    operations: [{ ...copied.plan.operations[0], desired_state: "disabled" }],
  });

  const preview = await previewActivationPlan(disabledPlan);
  assert.equal(preview.valid, false);
  assert.equal(preview.operations[0].status, "conflict");
  await assert.rejects(() => applyActivationPlan(disabledPlan, { confirm: true }), /cannot be applied/);
  assert.equal(await fs.readFile(userData, "utf8"), "preserve me\n");
});

test("recognizes an owned copy after the registry and project are relocated", async (context) => {
  const copied = await fixture(context, "enabled", { method: "copy" });
  await applyActivationPlan(copied.plan, { confirm: true });
  const movedRegistry = path.join(copied.root, "moved-registry");
  const movedProject = path.join(copied.root, "moved-project");
  await fs.rename(path.join(copied.root, "registry"), movedRegistry);
  await fs.rename(copied.projectPath, movedProject);
  const movedCanonical = path.join(movedRegistry, "revisions", "revision_demo", "artifacts", "demo");
  const movedDelivery = path.join(movedProject, ".agents", "skills", "demo");
  const movedOperation = {
    ...copied.plan.operations[0],
    canonical_path: movedCanonical,
    delivery_path: movedDelivery,
  };
  const movedPlan = createActivationPlan({
    target: {
      ...copied.plan.target,
      project_path: movedProject,
    },
    distribution: { method: "copy" },
    operations: [movedOperation],
  });

  const preview = await previewActivationPlan(movedPlan);
  assert.equal(preview.valid, true);
  assert.equal(preview.operations[0].status, "noop");
  const disabledPlan = createActivationPlan({
    mode: "pristine",
    target: movedPlan.target,
    distribution: { method: "copy" },
    operations: [{ ...movedOperation, desired_state: "disabled" }],
  });
  const report = await applyActivationPlan(disabledPlan, { confirm: true });
  assert.equal(report.status, "completed");
  await assert.rejects(() => fs.lstat(movedDelivery), { code: "ENOENT" });
});

test("rejects a project delivery path outside the project root", async (context) => {
  const item = await fixture(context);
  await fs.mkdir(item.projectPath, { recursive: true });
  const escapedPlan = createActivationPlan({
    target: {
      provider_id: "codex",
      scope: "project",
      project_id: "demo",
      project_path: item.projectPath,
    },
    operations: [{
      ...item.plan.operations[0],
      delivery_path: path.join(item.root, "outside", "demo"),
    }],
  });

  const preview = await previewActivationPlan(escapedPlan);
  assert.equal(preview.valid, false);
  assert.ok(preview.validation_issues.some((issue) => issue.message.includes("target.project_path")));
});

test("rejects ancestor-descendant delivery paths before either path is mutated", async (context) => {
  const item = await fixture(context);
  const secondCanonical = path.join(item.root, "registry", "revisions", "revision_demo", "artifacts", "second");
  await fs.mkdir(secondCanonical, { recursive: true });
  await fs.writeFile(path.join(secondCanonical, "SKILL.md"), "---\nname: second\ndescription: Second.\n---\n", "utf8");
  const outerDelivery = path.join(item.root, "delivery", "outer");
  const nestedDelivery = path.join(outerDelivery, "inner");
  const plan = createActivationPlan({
    target: item.plan.target,
    operations: [
      { ...item.plan.operations[0], delivery_path: outerDelivery },
      {
        registry_skill_id: "skill_second",
        skill_name: "second",
        source_revision_id: "revision_demo",
        content_digest: await digestDirectory(secondCanonical),
        canonical_path: secondCanonical,
        delivery_path: nestedDelivery,
        desired_state: "enabled",
      },
    ],
  });

  const preview = await previewActivationPlan(plan);
  assert.equal(preview.valid, false);
  assert.ok(preview.validation_issues.some((issue) => issue.message.includes("ancestors or descendants")));
  await assert.rejects(() => applyActivationPlan(plan, { confirm: true }), /cannot be applied/);
  await assert.rejects(() => fs.lstat(outerDelivery), { code: "ENOENT" });
});

test("rejects a later global plan whose root is an existing managed symlink", async (context) => {
  const item = await fixture(context);
  const secondCanonical = path.join(item.root, "registry", "revisions", "revision_demo", "artifacts", "second");
  await fs.mkdir(secondCanonical, { recursive: true });
  await fs.writeFile(path.join(secondCanonical, "SKILL.md"), "---\nname: second\ndescription: Second.\n---\n", "utf8");
  const outerDelivery = path.join(item.root, "global-delivery", "outer");
  const firstPlan = createActivationPlan({
    target: { provider_id: "codex", scope: "global" },
    distribution: { method: "symlink", shared_root_confirmation: true },
    operations: [{ ...item.plan.operations[0], delivery_path: outerDelivery }],
  });
  assert.equal((await applyActivationPlan(firstPlan, { confirm: true })).status, "completed");
  const nestedPlan = createActivationPlan({
    target: firstPlan.target,
    distribution: { method: "symlink", shared_root_confirmation: true },
    operations: [{
      registry_skill_id: "skill_second",
      skill_name: "second",
      source_revision_id: "revision_demo",
      content_digest: await digestDirectory(secondCanonical),
      canonical_path: secondCanonical,
      delivery_path: path.join(outerDelivery, "inner"),
      desired_state: "enabled",
    }],
  });

  const preview = await previewActivationPlan(nestedPlan);
  assert.equal(preview.valid, false);
  assert.ok(preview.validation_issues.some((issue) => issue.message.includes("symbolic link")));
  await assert.rejects(() => fs.lstat(path.join(item.canonicalPath, "inner")), { code: "ENOENT" });
});

test("rejects a later project plan nested inside an existing owned copy", async (context) => {
  const item = await fixture(context);
  const secondCanonical = path.join(item.root, "registry", "revisions", "revision_demo", "artifacts", "second");
  await fs.mkdir(secondCanonical, { recursive: true });
  await fs.writeFile(path.join(secondCanonical, "SKILL.md"), "---\nname: second\ndescription: Second.\n---\n", "utf8");
  const outerDelivery = path.join(item.projectPath, "skills", "outer");
  const firstPlan = createActivationPlan({
    target: item.plan.target,
    distribution: { method: "copy" },
    operations: [{ ...item.plan.operations[0], delivery_path: outerDelivery }],
  });
  assert.equal((await applyActivationPlan(firstPlan, { confirm: true })).status, "completed");
  const nestedPlan = createActivationPlan({
    target: firstPlan.target,
    distribution: { method: "copy" },
    operations: [{
      registry_skill_id: "skill_second",
      skill_name: "second",
      source_revision_id: "revision_demo",
      content_digest: await digestDirectory(secondCanonical),
      canonical_path: secondCanonical,
      delivery_path: path.join(outerDelivery, "inner"),
      desired_state: "enabled",
    }],
  });

  const preview = await previewActivationPlan(nestedPlan);
  assert.equal(preview.valid, false);
  assert.ok(preview.validation_issues.some((issue) => issue.message.includes("owned artifact copy")));
  assert.equal((await previewActivationPlan(firstPlan)).operations[0].status, "noop");
});

test("rejects a global delivery path that overlaps the immutable registry", async (context) => {
  const item = await fixture(context);
  const plan = createActivationPlan({
    target: { provider_id: "codex", scope: "global" },
    distribution: { method: "symlink", shared_root_confirmation: true },
    operations: [{
      ...item.plan.operations[0],
      delivery_path: path.join(item.canonicalPath, "nested-delivery"),
    }],
  });

  const preview = await previewActivationPlan(plan);
  assert.equal(preview.valid, false);
  assert.ok(preview.validation_issues.some((issue) => issue.message.includes("registry root")));
  await assert.rejects(() => fs.lstat(path.join(item.canonicalPath, "nested-delivery")), { code: "ENOENT" });
});

test("requires explicit shared-root confirmation for an inferred global delivery root", async (context) => {
  const item = await fixture(context);
  const globalPlan = createActivationPlan({
    target: { provider_id: "codex", scope: "global" },
    operations: item.plan.operations,
  });

  const preview = await previewActivationPlan(globalPlan);
  assert.equal(preview.valid, false);
  assert.ok(preview.validation_issues.some((issue) => issue.field === "distribution.shared_root_confirmation"));
});

test("revalidates before mutation, preserves a raced unmanaged directory, and rolls back earlier operations", async (context) => {
  const item = await fixture(context);
  const secondCanonical = path.join(item.root, "registry", "revisions", "revision_demo", "artifacts", "second");
  const thirdCanonical = path.join(item.root, "registry", "revisions", "revision_demo", "artifacts", "third");
  const secondDelivery = path.join(path.dirname(item.deliveryPath), "second");
  const thirdDelivery = path.join(path.dirname(item.deliveryPath), "third");
  await fs.mkdir(secondCanonical, { recursive: true });
  await fs.mkdir(thirdCanonical, { recursive: true });
  await fs.writeFile(path.join(secondCanonical, "SKILL.md"), "---\nname: second\ndescription: Second.\n---\n", "utf8");
  await fs.writeFile(path.join(thirdCanonical, "SKILL.md"), "---\nname: third\ndescription: Third.\n---\n", "utf8");
  const plan = createActivationPlan({
    target: item.plan.target,
    operations: [
      item.plan.operations[0],
      {
        registry_skill_id: "skill_second",
        skill_name: "second",
        source_revision_id: "revision_demo",
        content_digest: await digestDirectory(secondCanonical),
        canonical_path: secondCanonical,
        delivery_path: secondDelivery,
        desired_state: "enabled",
      },
      {
        registry_skill_id: "skill_third",
        skill_name: "third",
        source_revision_id: "revision_demo",
        content_digest: await digestDirectory(thirdCanonical),
        canonical_path: thirdCanonical,
        delivery_path: thirdDelivery,
        desired_state: "enabled",
      },
    ],
  });
  const manifestPath = path.join(item.deliveryPath, "SKILL.md");
  const originalConfig = `# rollback sentinel\n[[skills.config]]\npath = ${JSON.stringify(manifestPath)}\nenabled = false\n`;
  await fs.mkdir(path.dirname(item.codexConfigPath), { recursive: true });
  await fs.writeFile(item.codexConfigPath, originalConfig, "utf8");

  const report = await applyActivationPlan(plan, {
    confirm: true,
    onProgress(progress) {
      if (progress.processed_count !== 1) return;
      fsSync.mkdirSync(secondDelivery, { recursive: true });
      fsSync.writeFileSync(path.join(secondDelivery, "keep.txt"), "unmanaged\n");
    },
  });

  assert.equal(report.status, "failed");
  assert.equal(report.rolled_back, true);
  assert.equal(report.summary.rolled_back, 1);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.not_attempted, 1);
  assert.equal(report.operations.length, 3);
  assert.equal(report.operations[2].not_attempted, true);
  await assert.rejects(() => fs.lstat(item.deliveryPath), { code: "ENOENT" });
  await assert.rejects(() => fs.lstat(thirdDelivery), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(secondDelivery, "keep.txt"), "utf8"), "unmanaged\n");
  assert.equal(await fs.readFile(item.codexConfigPath, "utf8"), originalConfig);
});

test("restores the previous managed revision when a later operation fails", async (context) => {
  const item = await fixture(context);
  const replacementCanonical = path.join(item.root, "registry", "revisions", "revision_next", "artifacts", "demo");
  const secondCanonical = path.join(item.root, "registry", "revisions", "revision_next", "artifacts", "second");
  const secondDelivery = path.join(path.dirname(item.deliveryPath), "second");
  await fs.mkdir(replacementCanonical, { recursive: true });
  await fs.mkdir(secondCanonical, { recursive: true });
  await fs.writeFile(path.join(replacementCanonical, "SKILL.md"), "---\nname: demo\ndescription: Next.\n---\n", "utf8");
  await fs.writeFile(path.join(secondCanonical, "SKILL.md"), "---\nname: second\ndescription: Second.\n---\n", "utf8");
  const replacementOperation = {
    ...item.plan.operations[0],
    registry_skill_id: "skill_demo_next",
    source_revision_id: "revision_next",
    content_digest: await digestDirectory(replacementCanonical),
    canonical_path: replacementCanonical,
  };
  const secondOperation = {
    registry_skill_id: "skill_second",
    skill_name: "second",
    source_revision_id: "revision_next",
    content_digest: await digestDirectory(secondCanonical),
    canonical_path: secondCanonical,
    delivery_path: secondDelivery,
    desired_state: "enabled",
  };
  await writeRegistryIndex(item.registryRoot, [
    { operation: item.plan.operations[0], lineageId: "lineage_demo" },
    { operation: replacementOperation, lineageId: "lineage_demo" },
    { operation: secondOperation, lineageId: "lineage_second" },
  ]);
  await applyActivationPlan(item.plan, { confirm: true });
  const plan = createActivationPlan({
    target: item.plan.target,
    operations: [replacementOperation, secondOperation],
  });
  assert.equal((await previewActivationPlan(plan)).operations[0].status, "replace");

  const report = await applyActivationPlan(plan, {
    confirm: true,
    onProgress(progress) {
      if (progress.processed_count !== 1) return;
      fsSync.mkdirSync(secondDelivery, { recursive: true });
      fsSync.writeFileSync(path.join(secondDelivery, "keep.txt"), "unmanaged\n");
    },
  });

  assert.equal(report.status, "failed");
  assert.equal(report.rolled_back, true);
  assert.equal(
    path.resolve(await fs.realpath(item.deliveryPath)),
    path.resolve(await fs.realpath(item.canonicalPath)),
  );
  assert.equal(await fs.readFile(path.join(secondDelivery, "keep.txt"), "utf8"), "unmanaged\n");
  const leftovers = (await fs.readdir(path.dirname(item.deliveryPath))).filter((name) => name.includes(".backup-") || name.includes(".stage-"));
  assert.deepEqual(leftovers, []);
});

test("serializes concurrent applies for the same delivery root", async (context) => {
  const item = await fixture(context);
  const [left, right] = await Promise.all([
    applyActivationPlan(item.plan, { confirm: true }),
    applyActivationPlan(item.plan, { confirm: true }),
  ]);

  assert.equal(left.status, "completed");
  assert.equal(right.status, "completed");
  assert.equal(left.summary.applied + right.summary.applied, 1);
  assert.equal(left.summary.skipped + right.summary.skipped, 1);
  assert.equal((await fs.lstat(item.deliveryPath)).isSymbolicLink(), true);
});

test("uses the host filesystem's case semantics when comparing managed link targets", async (context) => {
  const item = await fixture(context);
  await writeRegistryIndex(item.registryRoot, [
    { operation: item.plan.operations[0], lineageId: "lineage_demo" },
  ]);
  await fs.mkdir(path.dirname(item.deliveryPath), { recursive: true });
  const caseVariant = path.join(path.dirname(item.canonicalPath), path.basename(item.canonicalPath).toUpperCase());
  await fs.symlink(caseVariant, item.deliveryPath, process.platform === "win32" ? "junction" : "dir");

  const preview = await previewActivationPlan(item.plan);
  let sameEntry = false;
  try {
    const [canonicalStats, variantStats] = await Promise.all([fs.stat(item.canonicalPath), fs.stat(caseVariant)]);
    sameEntry = canonicalStats.dev === variantStats.dev && canonicalStats.ino === variantStats.ino;
  } catch {}
  assert.equal(preview.valid, true);
  assert.equal(preview.operations[0].status, sameEntry || process.platform === "win32" ? "noop" : "replace");
});

test("resolves a legacy Windows canonical path in the registry identity index on macOS or POSIX", async (context) => {
  const item = await fixture(context);
  await fs.writeFile(path.join(item.registryRoot, "registry.json"), `${JSON.stringify({
    schema_version: 2,
    skills: [{
      id: "skill_demo",
      skill_name: "demo",
      source_revision_id: "revision_demo",
      content_digest: item.plan.operations[0].content_digest,
      lineage_id: "lineage_demo",
      canonical_path: "C:\\legacy\\registry\\revisions\\revision_demo\\artifacts\\demo",
    }],
  }, null, 2)}\n`, "utf8");

  const preview = await previewActivationPlan(item.plan);
  assert.equal(preview.valid, true);
  assert.equal(preview.operations[0].status, "create");
  assert.equal((await applyActivationPlan(item.plan, { confirm: true })).status, "completed");
});

test("rejects a project delivery root that escapes through a symbolic-link ancestor", async (context) => {
  const item = await fixture(context);
  const outside = path.join(item.root, "outside");
  await fs.mkdir(item.projectPath, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  await fs.symlink(outside, path.join(item.projectPath, ".agents"), process.platform === "win32" ? "junction" : "dir");
  const plan = createActivationPlan({
    target: {
      provider_id: "codex",
      scope: "project",
      project_id: "demo",
      project_path: item.projectPath,
    },
    operations: item.plan.operations,
  });

  const preview = await previewActivationPlan(plan);
  assert.equal(preview.valid, false);
  assert.ok(preview.validation_issues.some((issue) => issue.message.includes("symbolic-link ancestor")));
});
