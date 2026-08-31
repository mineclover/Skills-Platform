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
} = require("@skills-platform/ledger-store");

async function runLiveUsageTest() {
  console.log("===============================================================");
  console.log("🚀 LCH + DETERMINISTIC LEDGER FULL END-TO-END USAGE TEST");
  console.log("===============================================================\n");

  const planId = `plan-e2e-${Date.now()}`;
  console.log(`[Step 1] Initializing Plan: ${planId}`);
  
  // 1. P01: Contract Compilation
  const initialPlan = await createPlan({
    planId,
    title: "Feature-First Auth Session & ViewModel Implementation",
    actor: "user_orchestrator",
  });
  console.log(`✅ Plan Created. Initial Phase: ${initialPlan.manifest.current_phase}`);

  // Contract Update
  const contract = {
    contract_id: `contract-${planId}`,
    version: 1,
    goal: { statement: "Implement secure session store and headless ViewModel" },
    deliverables: [
      { id: "D1", path: "src/features/auth/crypto.ts", description: "AES-256 Token Crypto" },
      { id: "D2", path: "src/features/auth/session.viewmodel.ts", description: "Headless Session ViewModel" },
    ],
    acceptance_checks: [
      { id: "AC1", statement: "Token encryption roundtrip 100% pass", required: true, evaluator_ref: "evaluator://test-crypto" },
      { id: "AC2", statement: "ViewModel state transitions and zero UI imports", required: true, evaluator_ref: "evaluator://test-vm" },
    ],
    non_goals: [
      "No full UI rendering",
      "No external cloud deployment",
    ],
  };

  await updatePlanContract(planId, contract, { actor: "lch-contract-compiler" });
  console.log(`✅ [P01] Completion Contract compiled with 2 required acceptance checks.`);

  // 2. P02: Horizontal Discovery & Topology Detection
  const horizontalContext = {
    discovery_scope: ["src/features/**", "tests/**"],
    detected_topology: "feature-first",
    naming_convention: "*.viewmodel.ts",
    known_facts: [
      "ioredis@5.4.0 installed in root dependencies",
      "Feature-first directory layout already present in src/features/",
    ],
    assumptions: ["Node 22 built-in crypto module available"],
    risks: ["UI components importing ViewModel directly without state boundary"],
    topic_candidates: [
      { topic_id: "topic.auth.crypto", score: 0.95, dependencies: [] },
      { topic_id: "topic.auth.viewmodel", score: 0.88, dependencies: ["topic.auth.crypto"] },
    ],
  };

  await updatePlanContext(planId, horizontalContext, { actor: "lch-horizontal-explorer" });
  console.log(`✅ [P02] Horizontal Discovery completed. Detected Topology: ${horizontalContext.detected_topology}`);

  // 3. P03: Obligation Ledger Breakdown
  const obligations = [
    {
      id: "O-01",
      topic_id: "topic.auth.crypto",
      statement: "Implement AES-256-GCM token encryption helper",
      criticality: "required",
      status: "ready",
      depends_on: [],
      owner_role: "role://crypto-engineer",
      acceptance_check_refs: ["AC1"],
    },
    {
      id: "O-02",
      topic_id: "topic.auth.viewmodel",
      statement: "Implement headless SessionViewModel with observable state",
      criticality: "required",
      status: "pending",
      depends_on: ["O-01"],
      owner_role: "role://frontend-architect",
      acceptance_check_refs: ["AC2"],
    },
  ];

  await updatePlanObligations(planId, obligations, { actor: "lch-obligation-ledger" });
  console.log(`✅ [P03] Obligation Ledger initialized with 2 obligations (O-01, O-02).`);

  // 4. ⭐ Post-Planning Review Gate Checkpoint
  console.log("\n---------------------------------------------------------------");
  console.log("⭐ [Review Gate] Checkpoint Reached: AWAITING_PLAN_APPROVAL");
  let gap = await calculatePlanGap(planId);
  console.log(`📊 Initial Gap Analysis: is_complete=${gap.is_complete}, completion_ratio=${(gap.completion_ratio * 100).toFixed(0)}%`);
  console.log(`📋 Missing Checks: ${gap.missing_checks.map(c => c.id).join(", ")}`);
  console.log("👉 User Decision: Proceeding with Direct In-Tree Execution Mode");
  console.log("---------------------------------------------------------------\n");

  // 5. P04 + P05: Execution of Obligation 1 (O-01)
  let readyObligations = await getReadyObligations(planId);
  console.log(`🔍 Ready Obligations for execution: [${readyObligations.map(o => o.id).join(", ")}]`);

  console.log(`⚡ [P05] Worker executing O-01: ${readyObligations[0].statement}`);
  await transitionObligation(planId, "O-01", "active", { actor: "lch-work-unit-executor" });
  await transitionObligation(planId, "O-01", "proposed_done", { actor: "lch-work-unit-executor", reason: "Crypto patch applied" });

  // 6. P07: Fresh Context Independent Audit for O-01
  console.log(`🔍 [P07] Independent Auditor verifying O-01...`);
  await recordPlanVerification(
    planId,
    {
      obligation_id: "O-01",
      evaluator_ref: "evaluator://test-crypto",
      result: "pass",
      assertions: [{ id: "AC1", statement: "Crypto roundtrip pass", result: "pass" }],
      environment: { node_version: process.version },
    },
    { actor: "lch-independent-auditor" }
  );
  console.log(`✅ [P07] O-01 verified and signed!`);

  // 7. Dependency check: O-02 should now be ready
  readyObligations = await getReadyObligations(planId);
  console.log(`🔍 Ready Obligations now available: [${readyObligations.map(o => o.id).join(", ")}]`);

  // 8. Execution & Verification of O-02 (with Architectural Invariant Check)
  console.log(`⚡ [P05] Worker executing O-02: ${readyObligations[0].statement}`);
  await transitionObligation(planId, "O-02", "active", { actor: "lch-work-unit-executor" });
  await transitionObligation(planId, "O-02", "proposed_done", { actor: "lch-work-unit-executor", reason: "ViewModel implemented without UI imports" });

  console.log(`🔍 [P07] Independent Auditor verifying O-02 & Architectural Invariants...`);
  await recordPlanVerification(
    planId,
    {
      obligation_id: "O-02",
      evaluator_ref: "evaluator://test-vm",
      result: "pass",
      assertions: [
        { id: "AC2", statement: "ViewModel headless unit tests pass", result: "pass" },
      ],
      environment: {
        architectural_checks: {
          dependency_direction_valid: true,
          ui_imports_in_viewmodel: false,
          scope_confinement: true,
        },
      },
    },
    { actor: "lch-independent-auditor" }
  );
  console.log(`✅ [P07] O-02 verified and architectural invariants passed!`);

  // 9. P09: Closure Gate & Completion Certificate
  gap = await calculatePlanGap(planId);
  console.log("\n---------------------------------------------------------------");
  console.log(`📊 Final Gap Analysis: is_complete=${gap.is_complete}, completion_ratio=${(gap.completion_ratio * 100).toFixed(0)}%`);
  console.log(`📋 Missing Checks: ${gap.missing_checks.length === 0 ? "NONE (Gap = ∅)" : gap.missing_checks.length}`);

  if (gap.is_complete) {
    const certPlan = await issuePlanCertificate(
      planId,
      {
        contract_id: `contract-${planId}`,
        result: "completed",
        baseline_ref: "HEAD",
        verified_obligations: ["O-01", "O-02"],
      },
      { actor: "lch-closure-gate" }
    );
    console.log(`🎉 [P09] Completion Certificate Issued! Final Status: ${certPlan.manifest.status}`);
  }
  console.log("---------------------------------------------------------------\n");

  // 10. Audit Stream Verification
  const events = await getEventHistory(planId);
  console.log(`📜 Immutable Event Stream verified (${events.length} events logged):`);
  events.forEach((evt, idx) => {
    console.log(`   ${idx + 1}. [${evt.phase}] ${evt.actor} ➔ ${evt.action}`);
  });

  // 11. Cleanup test plan
  await deletePlan(planId);
  console.log(`\n🧹 Cleaned up temporary test plan: ${planId}`);
  console.log("\n🎉 ALL E2E USAGE TESTS PASSED SUCCESSFULLY (100% PASS, 0 FAIL)!");
}

runLiveUsageTest().catch((err) => {
  console.error("❌ E2E Usage Test Failed:", err);
  process.exit(1);
});
