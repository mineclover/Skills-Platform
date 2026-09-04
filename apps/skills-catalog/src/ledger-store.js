let ledgerStore;
try {
  ledgerStore = require("@skills-platform/ledger-store");
} catch {
  ledgerStore = require("../../packages/ledger-store");
}

module.exports = ledgerStore;
