const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createPlan,
  getPlan,
  listPlans,
  deletePlan,
  updatePlanContract,
  updatePlanContext,
  updatePlanObligations,
  transitionObligation,
  recordPlanVerification,
  issuePlanCertificate,
  calculatePlanGap,
  getReadyObligations,
  getEventHistory,
  startCatalogServer,
} = require("../src");

test("Ledger Store: Plan Lifecycle (Create, Update C/B/P, Transition, Events)", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-ledger-test-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  // 1. Create Plan
  const plan = await createPlan({
    planId: "plan-test-auth",
    title: "Auth Refactor Plan",
    rootDir: root,
  });

  assert.equal(plan.manifest.plan_id, "plan-test-auth");
  assert.equal(plan.manifest.current_phase, "P01_CONTRACT_COMPILER");
  assert.equal(plan.manifest.is_complete, false);

  // 2. Update Contract (Phase 1)
  const updatedPlan = await updatePlanContract(
    "plan-test-auth",
    {
      contract_id: "contract-auth-v1",
      version: 1,
      goal: { statement: "Implement Redis token store" },
      deliverables: [{ id: "D1", path: "src/auth/redis.ts" }],
      acceptance_checks: [
        { id: "AC1", statement: "Redis token store saves session", required: true },
        { id: "AC2", statement: "Unit tests pass", required: true },
      ],
      non_goals: ["JWT migration"],
    },
    { rootDir: root }
  );

  assert.equal(updatedPlan.contract.contract_id, "contract-auth-v1");
  assert.equal(updatedPlan.contract.acceptance_checks.length, 2);

  // 3. Update Obligations (Phase 3)
  const obligations = [
    {
      id: "O-01",
      topic_id: "topic.crypto",
      statement: "AES-256 helper",
      status: "ready",
      depends_on: [],
      acceptance_check_refs: ["AC1"],
    },
    {
      id: "O-02",
      topic_id: "topic.redis",
      statement: "Redis session adapter",
      status: "pending",
      depends_on: ["O-01"],
      acceptance_check_refs: ["AC1", "AC2"],
    },
  ];

  await updatePlanObligations("plan-test-auth", obligations, { rootDir: root });

  // 4. Dependency resolution: getReadyObligations
  let ready = await getReadyObligations("plan-test-auth", root);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, "O-01");

  // 5. Transition O-01 to active -> proposed_done
  await transitionObligation("plan-test-auth", "O-01", "active", { rootDir: root });
  await transitionObligation("plan-test-auth", "O-01", "proposed_done", { rootDir: root });

  // 6. Record verification for O-01 (Phase 7)
  await recordPlanVerification(
    "plan-test-auth",
    {
      obligation_id: "O-01",
      evaluator_ref: "evaluator://crypto-test",
      result: "pass",
      assertions: [{ id: "AC1", result: "pass" }],
    },
    { rootDir: root }
  );

  // O-01 is now verified, so O-02 should now become ready!
  ready = await getReadyObligations("plan-test-auth", root);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, "O-02");

  // Check Gap before completing O-02
  let gap = await calculatePlanGap("plan-test-auth", root);
  assert.equal(gap.is_complete, false);
  assert.equal(gap.missing_checks.length, 1);
  assert.equal(gap.missing_checks[0].id, "AC2");

  // Complete O-02
  await transitionObligation("plan-test-auth", "O-02", "active", { rootDir: root });
  await recordPlanVerification(
    "plan-test-auth",
    {
      obligation_id: "O-02",
      evaluator_ref: "evaluator://redis-test",
      result: "pass",
      assertions: [{ id: "AC2", result: "pass" }],
    },
    { rootDir: root }
  );

  // Check Gap after completing all
  gap = await calculatePlanGap("plan-test-auth", root);
  assert.equal(gap.is_complete, true);
  assert.equal(gap.missing_checks.length, 0);

  // 7. Issue Certificate (Phase 9)
  const certPlan = await issuePlanCertificate(
    "plan-test-auth",
    {
      contract_id: "contract-auth-v1",
      result: "completed",
      baseline_ref: "git://commit-123",
      verified_obligations: ["O-01", "O-02"],
    },
    { rootDir: root }
  );

  assert.equal(certPlan.manifest.is_complete, true);
  assert.equal(certPlan.manifest.status, "completed");

  // 8. Event history
  const events = await getEventHistory("plan-test-auth", root);
  assert.ok(events.length >= 6);
  assert.equal(events[0].action, "PLAN_CREATED");
  assert.equal(events[events.length - 1].action, "COMPLETION_CERTIFICATE_ISSUED");

  // 9. List and Delete
  const list = await listPlans({ rootDir: root });
  assert.equal(list.length, 1);

  const del = await deletePlan("plan-test-auth", root);
  assert.equal(del.deleted, true);

  const emptyList = await listPlans({ rootDir: root });
  assert.equal(emptyList.length, 0);
});

test("Ledger Store: REST API endpoints", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-ledger-api-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.mkdir(registryRoot, { recursive: true });

  await fs.writeFile(path.join(catalogRoot, "catalog.json"), JSON.stringify({ schema_version: 1, presets: [], projects: [], activation_history: [] }), "utf8");
  await fs.writeFile(path.join(registryRoot, "registry.json"), JSON.stringify({ schema_version: 1, sources: [], revisions: [], skills: [] }), "utf8");

  const server = await startCatalogServer({ catalogRoot, registryRoot, port: 0 });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  context.after(() => new Promise((resolve) => server.close(resolve)));

  // 1. POST /api/ledgers (Create)
  const createRes = await fetch(`${baseUrl}/api/ledgers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_id: "plan-api-101", title: "API Test Plan" }),
  });
  assert.equal(createRes.status, 201);
  const createdPlan = await createRes.json();
  assert.equal(createdPlan.manifest.plan_id, "plan-api-101");

  // 2. GET /api/ledgers (List)
  const listRes = await fetch(`${baseUrl}/api/ledgers`);
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.plans.length, 1);

  // 3. GET /api/ledgers/:id (Get)
  const getRes = await fetch(`${baseUrl}/api/ledgers/plan-api-101`);
  assert.equal(getRes.status, 200);
  const fetchedPlan = await getRes.json();
  assert.equal(fetchedPlan.manifest.title, "API Test Plan");

  // 4. GET /api/ledgers/:id/gap
  const gapRes = await fetch(`${baseUrl}/api/ledgers/plan-api-101/gap`);
  assert.equal(gapRes.status, 200);
  const gapData = await gapRes.json();
  assert.equal(gapData.plan_id, "plan-api-101");

  // 5. GET /api/ledgers/:id/events
  const eventsRes = await fetch(`${baseUrl}/api/ledgers/plan-api-101/events`);
  assert.equal(eventsRes.status, 200);
  const eventsData = await eventsRes.json();
  assert.ok(Array.isArray(eventsData.events));
  assert.equal(eventsData.events.length, 1);

  // 6. DELETE /api/ledgers/:id
  const delRes = await fetch(`${baseUrl}/api/ledgers/plan-api-101`, { method: "DELETE" });
  assert.equal(delRes.status, 200);
});
