# Sample Reference Skill Implementation

Reference implementation demonstrating a perfectly structured skill.

```markdown
---
name: sample-feature-deployer
description: Deploy feature packages to target staging environments and verify health endpoints. Use when deploying microservices, executing rollout checklists, or running staging smoke tests.
---

# Sample Feature Deployer

Step-by-step procedure for deploying feature builds.

## 1. Pre-Deployment Checks
1. Verify build artifacts exist in \`dist/\`.
2. Confirm target environment configuration in \`.env.staging\`.

## 2. Deployment Steps
Execute the automated deploy helper:
\`\`\`bash
node ./scripts/deploy.js --env staging --dry-run
node ./scripts/deploy.js --env staging --confirm
\`\`\`

## 3. Verification & Smoke Test
Run the health probe:
\`\`\`bash
curl -f http://localhost:8080/health
\`\`\`

For troubleshooting connection errors or rollback steps, see [references/rollback-guide.md](./references/rollback-guide.md).
```
