const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PROCEDURE_WORKSPACE_SCHEMA_VERSION,
  PROCEDURE_TYPES,
  PROCEDURE_WORKSPACE_STATUSES,
  createProcedureWorkspace,
  validateProcedureWorkspace,
} = require("../src");

// ---------------------------------------------------------------------------
// 1. Prototype Pollution & Inherited Property Resilience
// ---------------------------------------------------------------------------
test("CHALLENGE 1.1: Object.create(null) dictionary without prototype passes validation when properly shaped", () => {
  const ws = Object.create(null);
  ws.schema_version = 1;
  ws.workspace_id = "ws_null_proto";
  ws.procedure_type = "PLANNING";
  ws.git_branch = "worktree/ws_null_proto";
  ws.git_worktree_path = ".workspaces/ws_null_proto";
  ws.responsibility_invariants = Object.create(null);
  ws.responsibility_invariants.owned_files = [];
  ws.responsibility_invariants.prohibited_actions = [];
  ws.responsibility_invariants.acceptance_criteria = [];
  ws.active_skills = [];
  ws.active_guards = [];
  ws.status = "pending";
  ws.created_at = "2026-08-29T00:00:00.000Z";
  ws.completed_at = null;
  ws.metadata = Object.create(null);

  const result = validateProcedureWorkspace(ws);
  assert.equal(result.valid, true, `Expected valid but got issues: ${JSON.stringify(result.issues)}`);
  assert.equal(result.issues.length, 0);
});

test("CHALLENGE 1.2: Prototype pollution attempts do not crash or compromise validation", () => {
  const base = createProcedureWorkspace({ procedure_type: "INNER_LOOP_TDD" });

  const polluted = JSON.parse(JSON.stringify(base));
  polluted.__proto__ = { admin: true, bypass: true };
  polluted.constructor = { prototype: { compromised: true } };

  const result = validateProcedureWorkspace(polluted);
  assert.equal(result.valid, true);

  // Polluting prototype on an invalid object must not cause false positives
  const invalidObj = Object.create({
    schema_version: 1,
    workspace_id: "inherited_id",
    procedure_type: "PLANNING",
    git_branch: "worktree/inherited",
    git_worktree_path: ".workspaces/inherited",
    status: "pending",
    created_at: "2026-08-29T00:00:00.000Z",
    active_skills: [],
    active_guards: [],
    responsibility_invariants: {
      owned_files: [],
      prohibited_actions: [],
      acceptance_criteria: [],
    },
  });

  const resultInherited = validateProcedureWorkspace(invalidObj);
  assert.equal(typeof resultInherited.valid, "boolean");
});

// ---------------------------------------------------------------------------
// 2. Non-Object & Primitive Exhaustive Challenge
// ---------------------------------------------------------------------------
test("CHALLENGE 2.1: validateProcedureWorkspace rejects all non-object and malformed types safely", () => {
  const invalidPrims = [
    null,
    undefined,
    0,
    1,
    -1,
    NaN,
    Infinity,
    -Infinity,
    "",
    "string",
    "{}",
    true,
    false,
    Symbol("test"),
    () => {},
    BigInt(999),
    [],
    [1, 2, 3],
    [{ schema_version: 1 }],
    new Date(),
    /regex/,
    new Map(),
    new Set(),
    Buffer.from("malicious"),
    new Error("unexpected"),
  ];

  for (const prim of invalidPrims) {
    let result;
    assert.doesNotThrow(() => {
      result = validateProcedureWorkspace(prim);
    }, `validateProcedureWorkspace threw on input: ${String(prim)}`);

    assert.equal(result.valid, false, `Expected invalid for primitive ${String(prim)}`);
    assert.ok(Array.isArray(result.issues));
    assert.ok(result.issues.length > 0);
  }
});

// ---------------------------------------------------------------------------
// 3. Enumerations & Value Domain Boundary Stress
// ---------------------------------------------------------------------------
test("CHALLENGE 3.1: All valid ProcedureTypes are accepted and all invalid variants rejected", () => {
  const validTypes = ["PLANNING", "INNER_LOOP_TDD", "SECURITY_AUDIT", "RELEASE_GATE"];
  assert.equal(PROCEDURE_TYPES.size, 4);

  for (const t of validTypes) {
    const ws = createProcedureWorkspace({ procedure_type: t });
    assert.equal(ws.procedure_type, t);
    const res = validateProcedureWorkspace(ws);
    assert.equal(res.valid, true);
  }

  const invalidTypes = [
    "planning",
    "inner_loop_tdd",
    "security_audit",
    "release_gate",
    "PLANNING ",
    " PLANNING",
    "INNER-LOOP-TDD",
    "TDD",
    "PLAN",
    "SECURITY",
    "RELEASE",
    "PRODUCTION",
    "HOTFIX",
    "__proto__",
    "toString",
    "valueOf",
    "constructor",
    "",
    "   ",
    null,
    undefined,
    123,
    true,
    {},
    [],
  ];

  for (const inv of invalidTypes) {
    const ws = {
      schema_version: 1,
      workspace_id: "ws_test",
      procedure_type: inv,
      git_branch: "worktree/ws_test",
      git_worktree_path: ".workspaces/ws_test",
      responsibility_invariants: {
        owned_files: [],
        prohibited_actions: [],
        acceptance_criteria: [],
      },
      active_skills: [],
      active_guards: [],
      status: "pending",
      created_at: "2026-08-29T00:00:00.000Z",
    };
    const res = validateProcedureWorkspace(ws);
    assert.equal(res.valid, false, `Expected invalid for procedure_type: ${inv}`);
    assert.ok(res.issues.some((i) => i.field === "procedure_type"));
  }
});

test("CHALLENGE 3.2: All valid ProcedureWorkspaceStatuses are accepted and all invalid variants rejected", () => {
  const validStatuses = [
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

  for (const st of validStatuses) {
    const ws = createProcedureWorkspace({ procedure_type: "PLANNING", status: st });
    assert.equal(ws.status, st);
    const res = validateProcedureWorkspace(ws);
    assert.equal(res.valid, true);
  }

  const invalidStatuses = [
    "PENDING",
    "ACTIVE",
    "IN_VERIFICATION",
    "VERIFIED",
    "MERGED",
    "FAILED",
    "DISCARDED",
    "PRUNED",
    "running",
    "done",
    "success",
    "aborted",
    "closed",
    "open",
    "in_progress",
    " pending",
    "pending ",
    "",
    " ",
    null,
    undefined,
    false,
    1,
    {},
  ];

  for (const inv of invalidStatuses) {
    const ws = {
      schema_version: 1,
      workspace_id: "ws_test",
      procedure_type: "PLANNING",
      git_branch: "worktree/ws_test",
      git_worktree_path: ".workspaces/ws_test",
      responsibility_invariants: {
        owned_files: [],
        prohibited_actions: [],
        acceptance_criteria: [],
      },
      active_skills: [],
      active_guards: [],
      status: inv,
      created_at: "2026-08-29T00:00:00.000Z",
    };
    const res = validateProcedureWorkspace(ws);
    assert.equal(res.valid, false, `Expected invalid for status: ${inv}`);
    assert.ok(res.issues.some((i) => i.field === "status"));
  }
});

// ---------------------------------------------------------------------------
// 4. Invariant Sub-Structure Deep Edge Cases
// ---------------------------------------------------------------------------
test("CHALLENGE 4.1: Deep malformed variants of responsibility_invariants are safely rejected", () => {
  const base = createProcedureWorkspace({ procedure_type: "SECURITY_AUDIT" });

  const invalidInvariants = [
    null,
    undefined,
    "invariants",
    123,
    true,
    [],
    [1, 2, 3],
    { owned_files: "not-an-array", prohibited_actions: [], acceptance_criteria: [] },
    { owned_files: [], prohibited_actions: "not-an-array", acceptance_criteria: [] },
    { owned_files: [], prohibited_actions: [], acceptance_criteria: "not-an-array" },
    { owned_files: null, prohibited_actions: [], acceptance_criteria: [] },
    { owned_files: [], prohibited_actions: null, acceptance_criteria: [] },
    { owned_files: [], prohibited_actions: [], acceptance_criteria: null },
    { target_test_file: "", owned_files: [], prohibited_actions: [], acceptance_criteria: [] },
    { target_test_file: "   ", owned_files: [], prohibited_actions: [], acceptance_criteria: [] },
    { target_test_file: 12345, owned_files: [], prohibited_actions: [], acceptance_criteria: [] },
    { target_test_file: {}, owned_files: [], prohibited_actions: [], acceptance_criteria: [] },
    { target_test_file: [], owned_files: [], prohibited_actions: [], acceptance_criteria: [] },
  ];

  for (const inv of invalidInvariants) {
    const invalidWs = { ...base, responsibility_invariants: inv };
    const res = validateProcedureWorkspace(invalidWs);
    assert.equal(res.valid, false, `Expected invalid for invariant: ${JSON.stringify(inv)}`);
    assert.ok(res.issues.some((i) => i.field.startsWith("responsibility_invariants")));
  }
});

test("CHALLENGE 4.2: Valid invariant variations (target_test_file present vs absent vs null) pass", () => {
  const base = createProcedureWorkspace({ procedure_type: "PLANNING" });

  // target_test_file absent / undefined
  assert.equal(validateProcedureWorkspace({
    ...base,
    responsibility_invariants: {
      owned_files: [],
      prohibited_actions: [],
      acceptance_criteria: [],
    },
  }).valid, true);

  // target_test_file null
  assert.equal(validateProcedureWorkspace({
    ...base,
    responsibility_invariants: {
      target_test_file: null,
      owned_files: ["src/file.js"],
      prohibited_actions: ["no root edits"],
      acceptance_criteria: ["tests pass"],
    },
  }).valid, true);

  // target_test_file valid string
  assert.equal(validateProcedureWorkspace({
    ...base,
    responsibility_invariants: {
      target_test_file: "tests/suite.test.js",
      owned_files: ["src/file.js"],
      prohibited_actions: ["no root edits"],
      acceptance_criteria: ["tests pass"],
    },
  }).valid, true);
});

// ---------------------------------------------------------------------------
// 5. String Whitespace, Boundary & Special Character Resilience
// ---------------------------------------------------------------------------
test("CHALLENGE 5.1: Whitespace-only string fields are strictly rejected", () => {
  const base = createProcedureWorkspace({ procedure_type: "RELEASE_GATE" });
  const stringFields = ["workspace_id", "git_branch", "git_worktree_path", "created_at"];
  const whitespaceValues = ["", " ", "   ", "\t", "\n", "\r\n", "  \t\n "];

  for (const field of stringFields) {
    for (const wsVal of whitespaceValues) {
      const invalid = { ...base, [field]: wsVal };
      const res = validateProcedureWorkspace(invalid);
      assert.equal(res.valid, false, `Expected field ${field} to reject whitespace value "${wsVal}"`);
      assert.ok(res.issues.some((i) => i.field === field));
    }
  }
});

test("CHALLENGE 5.2: Special characters, unicode, and extreme paths are handled gracefully", () => {
  const specialId = "ws_🔥_unicode_#123_@scope/package-branch";
  const specialBranch = "worktree/feature/SP-101/auth_v2.0";
  const specialPath = ".workspaces/feature-SP-101 (test)/nested/path";

  const ws = createProcedureWorkspace({
    procedure_type: "INNER_LOOP_TDD",
    workspace_id: specialId,
    git_branch: specialBranch,
    git_worktree_path: specialPath,
    active_skills: ["skill:with-special:chars/1.0", "日本語スキル"],
    active_guards: ["guard#1", "guard#2"],
    metadata: {
      description: "Handling special characters & unicode gracefully",
      unicode: "こんにちは世界 🚀",
      nested: { deeply: { value: 42 } },
    },
  });

  assert.equal(ws.workspace_id, specialId);
  assert.equal(ws.git_branch, specialBranch);
  assert.equal(ws.git_worktree_path, specialPath);

  const res = validateProcedureWorkspace(ws);
  assert.equal(res.valid, true, `Validation failed on special characters: ${JSON.stringify(res.issues)}`);
});

// ---------------------------------------------------------------------------
// 6. completed_at and metadata edge cases
// ---------------------------------------------------------------------------
test("CHALLENGE 6.1: completed_at handles undefined, null, ISO timestamp, and rejects invalid types", () => {
  const base = createProcedureWorkspace({ procedure_type: "PLANNING" });

  assert.equal(validateProcedureWorkspace({ ...base, completed_at: undefined }).valid, true);
  assert.equal(validateProcedureWorkspace({ ...base, completed_at: null }).valid, true);
  assert.equal(validateProcedureWorkspace({ ...base, completed_at: "2026-08-29T12:34:56.789Z" }).valid, true);

  const invalidCompletedAt = ["", "   ", "\t", 12345678, true, false, {}, [], () => {}];
  for (const inv of invalidCompletedAt) {
    const res = validateProcedureWorkspace({ ...base, completed_at: inv });
    assert.equal(res.valid, false, `Expected completed_at to reject: ${inv}`);
    assert.ok(res.issues.some((i) => i.field === "completed_at"));
  }
});

test("CHALLENGE 6.2: metadata handles undefined, null, object, and rejects non-objects / arrays", () => {
  const base = createProcedureWorkspace({ procedure_type: "PLANNING" });

  assert.equal(validateProcedureWorkspace({ ...base, metadata: undefined }).valid, true);
  assert.equal(validateProcedureWorkspace({ ...base, metadata: null }).valid, true);
  assert.equal(validateProcedureWorkspace({ ...base, metadata: {} }).valid, true);
  assert.equal(validateProcedureWorkspace({ ...base, metadata: { count: 1, tag: "test" } }).valid, true);

  const invalidMetadata = ["string", 1234, true, false, [], [1, 2], "{}"];
  for (const inv of invalidMetadata) {
    const res = validateProcedureWorkspace({ ...base, metadata: inv });
    assert.equal(res.valid, false, `Expected metadata to reject: ${inv}`);
    assert.ok(res.issues.some((i) => i.field === "metadata"));
  }
});

// ---------------------------------------------------------------------------
// 7. createProcedureWorkspace factory invariants & mutation resistance
// ---------------------------------------------------------------------------
test("CHALLENGE 7.1: createProcedureWorkspace generates unique IDs and prevents prototype leakage", () => {
  const ids = new Set();
  for (let i = 0; i < 500; i++) {
    const ws = createProcedureWorkspace({ procedure_type: "PLANNING" });
    assert.ok(ws.workspace_id.startsWith("ws_"));
    assert.equal(ids.has(ws.workspace_id), false, `Collision detected on workspace ID: ${ws.workspace_id}`);
    ids.add(ws.workspace_id);
    assert.equal(ws.git_branch, `worktree/${ws.workspace_id}`);
    assert.equal(ws.git_worktree_path, `.workspaces/${ws.workspace_id}`);
    assert.equal(ws.status, "pending");
  }
  assert.equal(ids.size, 500);
});

test("CHALLENGE 7.2: createProcedureWorkspace throws descriptive validation errors with issues list", () => {
  const invalidInvocations = [
    { procedure_type: "INVALID" },
    { procedure_type: "PLANNING", workspace_id: "  " },
    { procedure_type: "PLANNING", git_branch: "" },
    { procedure_type: "PLANNING", git_worktree_path: "" },
    { procedure_type: "PLANNING", status: "NOT_A_STATUS" },
    { procedure_type: "PLANNING", active_skills: "invalid" },
    { procedure_type: "PLANNING", active_guards: "invalid" },
    { procedure_type: "PLANNING", metadata: "invalid" },
  ];

  for (const opts of invalidInvocations) {
    assert.throws(
      () => createProcedureWorkspace(opts),
      (err) => {
        assert.equal(err.message, "Procedure workspace is invalid");
        assert.ok(Array.isArray(err.issues));
        assert.ok(err.issues.length > 0);
        return true;
      },
      `Expected createProcedureWorkspace to throw on ${JSON.stringify(opts)}`
    );
  }
});

// ---------------------------------------------------------------------------
// 8. Single-Fault Injection Fuzzing & High-Throughput Stress (2,000 permutations)
// ---------------------------------------------------------------------------
test("CHALLENGE 8.1: Single-fault injection testing detects corruption in every single schema field", () => {
  const fieldsToCorrupt = [
    { key: "schema_version", badValues: [0, 2, -1, "1", null, undefined, {}] },
    { key: "workspace_id", badValues: ["", "   ", "\t\n", null, undefined, 123, {}, []] },
    { key: "procedure_type", badValues: ["PLAN", "planning", "INVALID", "", null, undefined, 42] },
    { key: "git_branch", badValues: ["", "  ", null, undefined, 123, false] },
    { key: "git_worktree_path", badValues: ["", "   ", null, undefined, 123] },
    { key: "status", badValues: ["PENDING", "running", "done", "", null, undefined, 123] },
    { key: "created_at", badValues: ["", "   ", "\t", null, undefined, 12345] },
    { key: "completed_at", badValues: ["", "   ", 12345, {}, []] },
    { key: "responsibility_invariants", badValues: [null, undefined, "not-object", [], 123] },
    { key: "active_skills", badValues: ["not-array", null, undefined, 123, {}] },
    { key: "active_guards", badValues: ["not-array", null, undefined, 123, {}] },
    { key: "metadata", badValues: ["not-object", [], 123, true] },
  ];

  for (const { key, badValues } of fieldsToCorrupt) {
    for (const badVal of badValues) {
      const base = createProcedureWorkspace({ procedure_type: "PLANNING" });
      base[key] = badVal;
      const result = validateProcedureWorkspace(base);
      assert.equal(
        result.valid,
        false,
        `Expected validation failure when corrupting ${key} with ${JSON.stringify(badVal)}`
      );
      assert.ok(
        result.issues.some((i) => i.field.startsWith(key)),
        `Expected issue report for field ${key}, but got: ${JSON.stringify(result.issues)}`
      );
    }
  }
});

test("CHALLENGE 8.2: Combinatorial fuzzing across 2,000 permutations executes cleanly with zero unhandled exceptions", () => {
  const validTypes = ["PLANNING", "INNER_LOOP_TDD", "SECURITY_AUDIT", "RELEASE_GATE"];
  const validStatuses = ["pending", "active", "in_verification", "verified", "merged", "failed", "discarded", "pruned"];

  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < 2000; i++) {
    const isIntentionallyValid = i % 2 === 0;
    let candidate;

    if (isIntentionallyValid) {
      const procType = validTypes[i % validTypes.length];
      const st = validStatuses[i % validStatuses.length];
      candidate = {
        schema_version: 1,
        workspace_id: `ws_fuzz_${i}`,
        procedure_type: procType,
        git_branch: `worktree/ws_fuzz_${i}`,
        git_worktree_path: `.workspaces/ws_fuzz_${i}`,
        status: st,
        created_at: new Date(1700000000000 + i * 1000).toISOString(),
        completed_at: i % 4 === 0 ? new Date().toISOString() : null,
        responsibility_invariants: {
          target_test_file: i % 3 === 0 ? `test/fuzz_${i}.test.js` : undefined,
          owned_files: [`src/fuzz_${i}.js`],
          prohibited_actions: ["no broad tests"],
          acceptance_criteria: ["fuzz pass"],
        },
        active_skills: [`skill-${i}`],
        active_guards: [`guard-${i}`],
        metadata: { iter: i },
      };
    } else {
      // Intentionally corrupt a random field
      const procType = validTypes[i % validTypes.length];
      const base = createProcedureWorkspace({ procedure_type: procType });
      const corruptMode = i % 8;
      switch (corruptMode) {
        case 0: base.schema_version = 999; break;
        case 1: base.workspace_id = "   "; break;
        case 2: base.procedure_type = "UNKNOWN_PROCEDURE"; break;
        case 3: base.git_branch = ""; break;
        case 4: base.status = "invalid_status"; break;
        case 5: base.responsibility_invariants = null; break;
        case 6: base.active_skills = "not_an_array"; break;
        case 7: base.metadata = ["not_an_object"]; break;
      }
      candidate = base;
    }

    let result;
    assert.doesNotThrow(() => {
      result = validateProcedureWorkspace(candidate);
    }, `validateProcedureWorkspace threw on iteration ${i}`);

    assert.equal(typeof result.valid, "boolean");
    assert.ok(Array.isArray(result.issues));

    if (isIntentionallyValid) {
      assert.equal(result.valid, true, `Iteration ${i} was expected to be valid but failed: ${JSON.stringify(result.issues)}`);
      assert.equal(result.issues.length, 0);
      validCount++;
    } else {
      assert.equal(result.valid, false, `Iteration ${i} was expected to fail validation`);
      assert.ok(result.issues.length > 0);
      invalidCount++;
    }
  }

  assert.equal(validCount, 1000);
  assert.equal(invalidCount, 1000);
});
