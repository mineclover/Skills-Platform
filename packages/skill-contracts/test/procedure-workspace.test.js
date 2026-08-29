const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PROCEDURE_WORKSPACE_SCHEMA_VERSION,
  PROCEDURE_TYPES,
  PROCEDURE_WORKSPACE_STATUSES,
  createProcedureWorkspace,
  validateProcedureWorkspace,
} = require("../src");

test("exports procedure types and status constants", () => {
  assert.equal(PROCEDURE_WORKSPACE_SCHEMA_VERSION, 1);
  assert.equal(PROCEDURE_TYPES.has("PLANNING"), true);
  assert.equal(PROCEDURE_TYPES.has("INNER_LOOP_TDD"), true);
  assert.equal(PROCEDURE_TYPES.has("SECURITY_AUDIT"), true);
  assert.equal(PROCEDURE_TYPES.has("RELEASE_GATE"), true);
  assert.equal(PROCEDURE_TYPES.size, 4);

  const expectedStatuses = [
    "pending",
    "active",
    "in_verification",
    "verified",
    "merged",
    "failed",
    "discarded",
    "pruned",
  ];
  assert.equal(PROCEDURE_WORKSPACE_STATUSES.size, 8);
  for (const status of expectedStatuses) {
    assert.equal(PROCEDURE_WORKSPACE_STATUSES.has(status), true);
  }
});

test("creates a valid default procedure workspace with generated IDs and branch paths", () => {
  const now = new Date("2026-08-29T00:00:00.000Z");
  const ws = createProcedureWorkspace({
    procedure_type: "PLANNING",
    now,
  });

  assert.equal(ws.schema_version, 1);
  assert.ok(ws.workspace_id.startsWith("ws_"));
  assert.equal(ws.procedure_type, "PLANNING");
  assert.equal(ws.git_branch, `worktree/${ws.workspace_id}`);
  assert.equal(ws.git_worktree_path, `.workspaces/${ws.workspace_id}`);
  assert.equal(ws.status, "pending");
  assert.equal(ws.created_at, "2026-08-29T00:00:00.000Z");
  assert.equal(ws.completed_at, null);
  assert.deepEqual(ws.active_skills, []);
  assert.deepEqual(ws.active_guards, []);
  assert.deepEqual(ws.responsibility_invariants, {
    target_test_file: undefined,
    owned_files: [],
    prohibited_actions: [],
    acceptance_criteria: [],
  });
  assert.deepEqual(ws.metadata, {});

  const validation = validateProcedureWorkspace(ws);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
});

test("creates and validates procedure workspaces for all valid procedure types", () => {
  const types = ["PLANNING", "INNER_LOOP_TDD", "SECURITY_AUDIT", "RELEASE_GATE"];
  for (const procType of types) {
    const ws = createProcedureWorkspace({
      procedure_type: procType,
      workspace_id: `task-${procType.toLowerCase()}`,
    });
    assert.equal(ws.procedure_type, procType);
    assert.equal(ws.workspace_id, `task-${procType.toLowerCase()}`);
    assert.equal(ws.git_branch, `worktree/task-${procType.toLowerCase()}`);
    assert.equal(ws.git_worktree_path, `.workspaces/task-${procType.toLowerCase()}`);

    const validation = validateProcedureWorkspace(ws);
    assert.equal(validation.valid, true, `Validation failed for type ${procType}`);
  }
});

test("creates and validates workspace with explicit custom invariants and skills/guards", () => {
  const ws = createProcedureWorkspace({
    workspace_id: "task-01-auth-jwt",
    procedure_type: "INNER_LOOP_TDD",
    git_branch: "worktree/task-01-auth-jwt",
    git_worktree_path: ".workspaces/task-01-auth-jwt",
    responsibility_invariants: {
      target_test_file: "packages/auth/test/jwt.test.js",
      owned_files: ["packages/auth/src/jwt.js"],
      prohibited_actions: ["modify root package.json", "execute broad test suite"],
      acceptance_criteria: ["JWT signing and verification passes cleanly"],
    },
    active_skills: ["tdd-cycle-runner", "jwt-helper"],
    active_guards: ["test-storm-guard", "secret-leak-guard"],
    status: "active",
    metadata: {
      priority: 1,
      ticket: "SP-104",
    },
  });

  assert.equal(ws.workspace_id, "task-01-auth-jwt");
  assert.equal(ws.procedure_type, "INNER_LOOP_TDD");
  assert.equal(ws.status, "active");
  assert.equal(ws.responsibility_invariants.target_test_file, "packages/auth/test/jwt.test.js");
  assert.deepEqual(ws.responsibility_invariants.owned_files, ["packages/auth/src/jwt.js"]);
  assert.deepEqual(ws.responsibility_invariants.prohibited_actions, [
    "modify root package.json",
    "execute broad test suite",
  ]);
  assert.deepEqual(ws.responsibility_invariants.acceptance_criteria, [
    "JWT signing and verification passes cleanly",
  ]);
  assert.deepEqual(ws.active_skills, ["tdd-cycle-runner", "jwt-helper"]);
  assert.deepEqual(ws.active_guards, ["test-storm-guard", "secret-leak-guard"]);
  assert.deepEqual(ws.metadata, { priority: 1, ticket: "SP-104" });

  const validation = validateProcedureWorkspace(ws);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
});

test("validates all supported workspace lifecycle statuses", () => {
  const statuses = [
    "pending",
    "active",
    "in_verification",
    "verified",
    "merged",
    "failed",
    "discarded",
    "pruned",
  ];

  for (const st of statuses) {
    const ws = createProcedureWorkspace({
      workspace_id: `task-${st}`,
      procedure_type: "RELEASE_GATE",
      status: st,
      completed_at: st === "merged" || st === "discarded" || st === "pruned" ? new Date().toISOString() : null,
    });
    assert.equal(ws.status, st);
    const validation = validateProcedureWorkspace(ws);
    assert.equal(validation.valid, true, `Validation failed for status ${st}`);
  }
});

test("rejects invalid top-level structures", () => {
  assert.equal(validateProcedureWorkspace(null).valid, false);
  assert.equal(validateProcedureWorkspace(undefined).valid, false);
  assert.equal(validateProcedureWorkspace("invalid").valid, false);
  assert.equal(validateProcedureWorkspace(123).valid, false);
  assert.equal(validateProcedureWorkspace([]).valid, false);
});

test("rejects invalid schema_version", () => {
  const base = createProcedureWorkspace({ procedure_type: "PLANNING" });
  const invalid = { ...base, schema_version: 2 };
  const res = validateProcedureWorkspace(invalid);
  assert.equal(res.valid, false);
  assert.ok(res.issues.some((i) => i.field === "schema_version"));
});

test("rejects missing or empty required string fields", () => {
  const base = createProcedureWorkspace({ procedure_type: "PLANNING" });

  const testCases = [
    { field: "workspace_id", value: "" },
    { field: "workspace_id", value: "   " },
    { field: "workspace_id", value: 123 },
    { field: "git_branch", value: "" },
    { field: "git_worktree_path", value: "" },
    { field: "created_at", value: "" },
  ];

  for (const { field, value } of testCases) {
    const invalid = { ...base, [field]: value };
    const res = validateProcedureWorkspace(invalid);
    assert.equal(res.valid, false, `Expected failure for field ${field} with value ${value}`);
    assert.ok(res.issues.some((i) => i.field === field));
  }
});

test("rejects invalid procedure_type", () => {
  const base = createProcedureWorkspace({ procedure_type: "PLANNING" });
  const invalidTypes = ["INVALID_TYPE", "planning", "EXECUTION", "", null, 42];

  for (const invType of invalidTypes) {
    const invalid = { ...base, procedure_type: invType };
    const res = validateProcedureWorkspace(invalid);
    assert.equal(res.valid, false);
    assert.ok(res.issues.some((i) => i.field === "procedure_type"));
  }
});

test("rejects invalid workspace status", () => {
  const base = createProcedureWorkspace({ procedure_type: "PLANNING" });
  const invalidStatuses = ["INVALID_STATUS", "running", "done", "", null, 123];

  for (const invStatus of invalidStatuses) {
    const invalid = { ...base, status: invStatus };
    const res = validateProcedureWorkspace(invalid);
    assert.equal(res.valid, false);
    assert.ok(res.issues.some((i) => i.field === "status"));
  }
});

test("rejects invalid completed_at values", () => {
  const base = createProcedureWorkspace({ procedure_type: "PLANNING" });

  const invalid1 = { ...base, completed_at: "" };
  const res1 = validateProcedureWorkspace(invalid1);
  assert.equal(res1.valid, false);
  assert.ok(res1.issues.some((i) => i.field === "completed_at"));

  const invalid2 = { ...base, completed_at: 12345 };
  const res2 = validateProcedureWorkspace(invalid2);
  assert.equal(res2.valid, false);
  assert.ok(res2.issues.some((i) => i.field === "completed_at"));

  // null and undefined and valid ISO strings should pass
  assert.equal(validateProcedureWorkspace({ ...base, completed_at: null }).valid, true);
  assert.equal(validateProcedureWorkspace({ ...base, completed_at: undefined }).valid, true);
  assert.equal(
    validateProcedureWorkspace({ ...base, completed_at: "2026-08-29T12:00:00.000Z" }).valid,
    true
  );
});

test("rejects invalid responsibility_invariants structure", () => {
  const base = createProcedureWorkspace({ procedure_type: "PLANNING" });

  const invalid1 = { ...base, responsibility_invariants: "not-an-object" };
  const res1 = validateProcedureWorkspace(invalid1);
  assert.equal(res1.valid, false);
  assert.ok(res1.issues.some((i) => i.field === "responsibility_invariants"));

  const invalid2 = {
    ...base,
    responsibility_invariants: {
      target_test_file: "", // empty string
      owned_files: "not-an-array",
      prohibited_actions: null,
      acceptance_criteria: 42,
    },
  };
  const res2 = validateProcedureWorkspace(invalid2);
  assert.equal(res2.valid, false);
  assert.ok(res2.issues.some((i) => i.field === "responsibility_invariants.target_test_file"));
  assert.ok(res2.issues.some((i) => i.field === "responsibility_invariants.owned_files"));
  assert.ok(res2.issues.some((i) => i.field === "responsibility_invariants.prohibited_actions"));
  assert.ok(res2.issues.some((i) => i.field === "responsibility_invariants.acceptance_criteria"));
});

test("rejects invalid active_skills, active_guards, and metadata", () => {
  const base = createProcedureWorkspace({ procedure_type: "PLANNING" });

  const resSkills = validateProcedureWorkspace({ ...base, active_skills: "not-array" });
  assert.equal(resSkills.valid, false);
  assert.ok(resSkills.issues.some((i) => i.field === "active_skills"));

  const resGuards = validateProcedureWorkspace({ ...base, active_guards: "not-array" });
  assert.equal(resGuards.valid, false);
  assert.ok(resGuards.issues.some((i) => i.field === "active_guards"));

  const resMeta = validateProcedureWorkspace({ ...base, metadata: "not-object" });
  assert.equal(resMeta.valid, false);
  assert.ok(resMeta.issues.some((i) => i.field === "metadata"));

  const resMetaArray = validateProcedureWorkspace({ ...base, metadata: ["not", "dict"] });
  assert.equal(resMetaArray.valid, false);
  assert.ok(resMetaArray.issues.some((i) => i.field === "metadata"));
});

test("createProcedureWorkspace throws descriptive Error when validation fails", () => {
  assert.throws(
    () => {
      createProcedureWorkspace({
        procedure_type: "UNSUPPORTED_TYPE",
      });
    },
    (err) => {
      assert.equal(err.message, "Procedure workspace is invalid");
      assert.ok(Array.isArray(err.issues));
      assert.ok(err.issues.some((i) => i.field === "procedure_type"));
      return true;
    }
  );
});
