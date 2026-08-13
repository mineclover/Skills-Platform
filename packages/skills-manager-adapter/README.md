# Skills Manager Delivery Adapter

This package is the reference implementation of the catalog-to-delivery
boundary. It consumes a schema-validated `ActivationPlan`, verifies every
canonical artifact digest, previews conflicts, and only materializes symbolic
links or copies after explicit confirmation.

It never chooses a skill set, edits catalog state, or overwrites an unmanaged
delivery path. The existing Skills Manager desktop app can adopt this protocol
without becoming the registry of record.

```bash
node src/cli.js preview ./activation-plan.json
node src/cli.js apply ./activation-plan.json --confirm
```
