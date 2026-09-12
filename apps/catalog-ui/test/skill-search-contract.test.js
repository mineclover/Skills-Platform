import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const { addSkillNote, createCatalogServer, deleteSkillNote, importLocalSource, updateSkillProfile } = require("../../skills-catalog/src");
const { run: runCli } = require("../../skills-catalog/src/cli");
let root;
let registryRoot;
let catalogRoot;
let server;
let baseUrl;
let vite;
let filterWorkspaceSkills;
let SkillWorkspace;
let entries;
let idsByName;

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-search-contract-"));
  registryRoot = path.join(root, "registry");
  catalogRoot = path.join(root, "catalog");
  const profiles = {
    "first-skill": {
      title: "Zulu", summary: "Profile summary sentinel", purpose: "Purpose sentinel",
      use_when: ["Use condition sentinel"], avoid_when: ["Avoid condition sentinel"],
      tags: ["review", "quality"], domains: ["frontend"], provider_constraints: ["codex"],
      invocation_mode: "user_invoked", review_state: "reviewed",
    },
    "codex-mention-only": {
      title: "Alpha", tags: ["codex-helper"], provider_constraints: [],
      invocation_mode: "hybrid", review_state: "unreviewed",
    },
    "third-skill": {
      title: "Beta", tags: ["review"], domains: ["backend"], provider_constraints: ["antigravity"],
      invocation_mode: "model_invoked", review_state: "deprecated",
    },
  };
  for (const name of Object.keys(profiles)) {
    const source = path.join(root, "source", name);
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "SKILL.md"), `---\nname: ${name}\ndescription: ${name === "codex-mention-only" ? "Mentions Codex without provider evidence" : `Immutable ${name} description`}\n---\n# Skill\n`);
  }
  const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  idsByName = Object.fromEntries(imported.skills.map((skill) => [skill.skill_name, skill.lineage_id]));
  for (const skill of imported.skills) {
    await updateSkillProfile({ catalogRoot, registryRoot, lineageId: skill.lineage_id, patch: profiles[skill.skill_name] });
  }
  await addSkillNote({ catalogRoot, registryRoot, lineageId: idsByName["first-skill"], body: "Active note sentinel" });
  const deleted = await addSkillNote({ catalogRoot, registryRoot, lineageId: idsByName["third-skill"], body: "Deleted note sentinel" });
  await deleteSkillNote({ catalogRoot, noteId: deleted.id });
  server = createCatalogServer({ catalogRoot, registryRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${baseUrl}/api/skills`);
  assert.equal(response.status, 200);
  entries = (await response.json()).skills;
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
  });
  ({ filterWorkspaceSkills } = await vite.ssrLoadModule("/src/skill-search.ts"));
  ({ SkillWorkspace } = await vite.ssrLoadModule("/src/components/SkillWorkspace.tsx"));
});

after(async () => {
  await vite?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (root) await fs.rm(root, { recursive: true, force: true });
});

const scenarios = [
  { name: "title order", filters: {}, expected: ["codex-mention-only", "third-skill", "first-skill"] },
  { name: "provider constraints without provider mentions", filters: { providerId: "codex" }, expected: ["first-skill"] },
  { name: "provider constraints for Antigravity", filters: { providerId: "antigravity" }, expected: ["third-skill"] },
  { name: "unknown provider", filters: { providerId: "unknown" }, expected: [] },
  { name: "partial provider does not match", filters: { providerId: "code" }, expected: [] },
  { name: "query remains independent from provider eligibility", filters: { query: "codex" }, expected: ["codex-mention-only"] },
  ...["profile summary", "purpose sentinel", "use condition", "avoid condition", "frontend", "active note", "immutable first-skill", "user_invoked"].map((query) => ({
    name: `query includes ${query}`, filters: { query: `  ${query.toUpperCase()}  ` }, expected: ["first-skill"],
  })),
  { name: "deleted notes excluded", filters: { query: "deleted note" }, expected: [] },
  { name: "delivery path is not indexed metadata", filters: { query: ".agents/skills" }, expected: [] },
  { name: "tags combine with AND", filters: { tags: ["review", "quality"] }, expected: ["first-skill"] },
  { name: "domains exact match", filters: { domains: ["backend"] }, expected: ["third-skill"] },
  { name: "tag is not a substring", filters: { tags: ["codex"] }, expected: [] },
  { name: "provider invocation review and query combine", filters: { providerId: "codex", invocationMode: "user_invoked", reviewState: "reviewed", query: "review" }, expected: ["first-skill"] },
  { name: "unknown artifact filter", filters: { artifactType: "hook" }, expected: [] },
];

for (const { name, filters, expected } of scenarios) {
  test(`UI, HTTP API, and CLI agree: ${name}`, async () => {
    const params = new URLSearchParams();
    const cli = ["skill", "search", filters.query ?? "", "--registry", registryRoot, "--catalog", catalogRoot];
    for (const [key, apiName, cliName] of [
      ["query", "query", null], ["providerId", "provider", "provider"],
      ["reviewState", "review_state", "review-state"], ["artifactType", "artifact_type", "type"],
      ["invocationMode", "invocation_mode", "invoker"], ["tags", "tag", "tag"], ["domains", "domain", "domain"],
    ]) {
      const values = filters[key] === undefined ? [] : (Array.isArray(filters[key]) ? filters[key] : [filters[key]]);
      for (const value of values) {
        params.append(apiName, value);
        if (cliName) cli.push(`--${cliName}`, value);
      }
    }
    const response = await fetch(`${baseUrl}/api/skills?${params}`);
    assert.equal(response.status, 200);
    const apiResults = (await response.json()).skills;
    const cliResults = await runCli(cli);
    const uiResults = filterWorkspaceSkills([...entries].reverse(), {
      searchQuery: filters.query,
      providerFilter: filters.providerId,
      invocationFilter: filters.invocationMode,
      tags: filters.tags, domains: filters.domains, reviewState: filters.reviewState, artifactType: filters.artifactType,
    });
    const expectedIds = expected.map((name) => idsByName[name]);
    for (const [surface, results] of [["API", apiResults], ["CLI", cliResults], ["UI", uiResults]]) {
      assert.deepEqual(results.map((entry) => entry.lineage.id), expectedIds, `${surface}: ${name}`);
    }
  });
}

test("workspace renders the title-sorted results and advertises the shared search fields", () => {
  const html = renderToStaticMarkup(createElement(SkillWorkspace, {
    skills: [...entries].reverse(), selectedLineageId: null, onSelect() {}, onSave() {},
    onRecordFeedback() {}, onAddNote() {}, saving: false, feedback: [], feedbackSummary: null,
    notes: [], evaluationSummary: null, loadingEvidence: false, recordingFeedback: false, recordingNote: false,
  }));
  const list = html.match(/<div class="managed-skill-list"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(list);
  assert.deepEqual([...list.matchAll(/<strong>([^<]+)<\/strong>/g)].map((match) => match[1]), ["Alpha", "Beta", "Zulu"]);
  assert.match(html, /Search skills by name, metadata, or notes/);
});
