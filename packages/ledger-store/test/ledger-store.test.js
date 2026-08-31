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
  updatePlanObligations,
  transitionObligation,
  recordPlanVerification,
  issuePlanCertificate,
  calculatePlanGap,
  getReadyObligations,
  getEventHistory,
} = require("../src");

test("Standalone @skills-platform/ledger-store: Full lifecycle and gap analysis", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ledger-pkg-test-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  // 1. Create
  const plan = await createPlan({ planId: "plan-pkg-001", title: "Standalone Package Plan", rootDir: root });
  assert.equal(plan.manifest.plan_id, "plan-pkg-001");

  // 2. Contract
  await updatePlanContract(
    "plan-pkg-001",
    {
      contract_id: "contract-pkg-001",
      version: 1,
      goal: { statement: "Goal" },
      deliverables: [],
      acceptance_checks: [{ id: "AC1", statement: "Check 1", required: true }],
      non_goals: [],
    },
    { rootDir: root }
  );

  // 3. Obligations
  await updatePlanObligations(
    "plan-pkg-001",
    [{ id: "O-1", statement: "Task 1", status: "ready", depends_on: [] }],
    { rootDir: root }
  );

  let ready = await getReadyObligations("plan-pkg-001", root);
  assert.equal(ready.length, 1);

  // 4. Verify & Gap
  await recordPlanVerification(
    "plan-pkg-001",
    { obligation_id: "O-1", result: "pass", assertions: [{ id: "AC1", result: "pass" }] },
    { rootDir: root }
  );

  const gap = await calculatePlanGap("plan-pkg-001", root);
  assert.equal(gap.is_complete, true);

  // 5. Events
  const events = await getEventHistory("plan-pkg-001", root);
  assert.ok(events.length >= 3);
});
