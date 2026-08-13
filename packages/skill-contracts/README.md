# Skill Contracts

This package will define versioned registry, `ActivationPlan`, and
`ActivationReport` schemas shared by the catalog and delivery adapters.

Every plan must use immutable source-revision and content-digest identities;
provider paths are delivery targets, not canonical source identities.

The initial contract implementation validates schema version, target scope,
distribution method, and every immutable operation reference. The catalog uses
it to emit plans; a future Skills Manager adapter will use it before previewing
or materializing delivery bindings.
