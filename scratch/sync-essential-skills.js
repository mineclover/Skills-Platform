function main() {
  // Retired: this legacy helper deleted every directory that was not present
  // in its hard-coded map and created bindings without adapter ownership
  // records. Project skill state is now managed through the tracked authoring
  // recipe plus Catalog preview/apply. Keep this command non-mutating so an old
  // automation cannot remove Catalog-managed skills.
  process.stderr.write([
    "sync-essential-skills.js is retired and made no changes.",
    "Use skills-platform-authoring-recipe.json and the project package management guide.",
    "Preview Catalog delivery before applying any binding changes.",
    "",
  ].join("\n"));
  process.exitCode = 1;
}

main();
