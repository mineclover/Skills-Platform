# Reference Pack Schema

## Authority vocabulary

Use these values unless the project defines a stricter model:

```text
current_user
frozen_baseline
approved_decision
verified_runtime
current_proposal
historical_note
```

Use these source states:

```text
current
supplemental
superseded
partial
inaccessible
```

## Fact kinds

```text
goal
non_goal
requirement
decision
contract
invariant
flow
acceptance
risk
open_issue
todo
evidence
```

## Fact statuses

```text
accepted
implemented
proposed
open
deferred
superseded
rejected
```

## Dispositions

```text
retained
merged
merged_into:<ID>
superseded
archived
omitted_disclosed
```

## Primary-domain values

Core owners:

```text
product-requirements
system-architecture
data-state
interfaces
runtime-workflows
quality-operations
testing-acceptance
delivery-roadmap
```

Specialist overlays appear only in `domain_tags`:

```text
ui-editor
browser-devtools
ai-agent-systems
graphics-3d-motion
knowledge-publishing
```

## Canonical ID families

```text
G-*      goal
NG-*     non-goal
REQ-*    requirement
DEC-*    decision
CTR-*    contract
INV-*    invariant
FLOW-*   flow
AC-*     acceptance criterion
RISK-*   risk
OPEN-*   open decision/conflict
TODO-*   implementation item
```

Source IDs use `SRC-*`. Do not create IDs for every sentence.
