const path = require("node:path");
const { physicalPath, withFileLock } = require("./file-locks");

// Catalog delivery transports share these locks, including when their callers
// use different Catalogs or symlink aliases for the same provider root. The
// catalog.json mutation lock is intentionally independent of provider I/O.
async function withActivationDeliveryLock(plan, operation) {
  const roots = [...new Set(await Promise.all((plan.operations ?? [])
    .map((item) => physicalPath(path.dirname(item.delivery_path)))))].sort();
  const acquire = (index) => index === roots.length
    ? operation()
    : withFileLock(roots[index], () => acquire(index + 1));
  return acquire(0);
}

module.exports = { withActivationDeliveryLock };
