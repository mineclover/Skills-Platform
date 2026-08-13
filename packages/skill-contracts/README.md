# Skill Contracts

This package will define versioned registry, `ActivationPlan`, and
`ActivationReport` schemas shared by the catalog and delivery adapters.

Every plan must use immutable source-revision and content-digest identities;
provider paths are delivery targets, not canonical source identities.
