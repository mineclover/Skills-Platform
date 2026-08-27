#!/usr/bin/env node
const { run } = require("node:test");
const path = require("node:path");
const fs = require("node:fs/promises");
const { spec } = require("node:test/reporters");

async function findTestFiles(dir, filter = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git") {
        files = files.concat(await findTestFiles(fullPath, filter));
      }
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      if (!filter || fullPath.includes(filter)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  let filter = "";
  let bail = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--filter" || args[i] === "-f") {
      filter = args[++i] || "";
    } else if (args[i] === "--bail" || args[i] === "-b") {
      bail = true;
    } else if (!args[i].startsWith("-")) {
      filter = args[i];
    }
  }

  const baseDir = path.resolve(__dirname);
  const testFiles = await findTestFiles(baseDir, filter);

  if (testFiles.length === 0) {
    console.error(`No test files found matching filter: "${filter}"`);
    process.exit(1);
  }

  console.log(`=======================================================`);
  console.log(`Skills Platform E2E Test Suite Runner`);
  console.log(`Discovered ${testFiles.length} test files`);
  if (filter) console.log(`Filter: ${filter}`);
  console.log(`=======================================================\n`);

  const startTime = Date.now();
  let passedCount = 0;
  let failedCount = 0;
  const failedFiles = [];

  const testStream = run({
    files: testFiles,
    concurrency: 1, // run sequentially for deterministic output
    timeout: 30000,
  });

  testStream.compose(new spec()).pipe(process.stdout);

  testStream.on("test:pass", () => {
    passedCount++;
  });

  testStream.on("test:fail", (data) => {
    failedCount++;
    if (data.file && !failedFiles.includes(data.file)) {
      failedFiles.push(data.file);
    }
  });

  testStream.on("end", () => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n=======================================================`);
    console.log(`E2E TEST RUN SUMMARY`);
    console.log(`Total Test Files: ${testFiles.length}`);
    console.log(`Total Assertions/Cases Passed: ${passedCount}`);
    console.log(`Total Assertions/Cases Failed: ${failedCount}`);
    console.log(`Duration: ${duration}s`);
    console.log(`=======================================================`);

    if (failedCount > 0) {
      console.error(`\nFailed Test Files:`);
      for (const f of failedFiles) {
        console.error(`  ❌ ${path.relative(process.cwd(), f)}`);
      }
      process.exit(1);
    } else {
      console.log(`\n✅ ALL E2E TESTS PASSED SUCCESSFULLY!`);
      process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
