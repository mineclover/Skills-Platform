try {
  module.exports = require("@skills-platform/ledger-store");
} catch {
  module.exports = require("../../packages/ledger-store");
}
