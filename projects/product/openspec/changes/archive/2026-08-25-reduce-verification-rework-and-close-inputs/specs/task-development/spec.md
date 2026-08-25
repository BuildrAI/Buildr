## ADDED Requirements

### Requirement: Task Development MUST provide current closed mutation input discovery

Task Development MUST provide a response-only `discover` action for `observe` and `policy`. The action MUST derive a versioned closed `inputJson` from current Task, ready Environment, Development Receipt and Task Verification declaration facts, and MUST NOT write a Development Receipt, applicability observation, Task Record or other professional Result.

#### Scenario: Discover observe input from current Receipt

- **WHEN** an active Task has a matching ready Environment and current Development Receipt
- **AND** the Agent requests `discover` for `observe`
- **THEN** the response MUST return `buildr.task-development-current-input/v1` and a closed `inputJson` containing the Receipt's complete Change dispositions and planning target identity
- **AND** the response MUST include the source Receipt identity and MUST report no write effect

#### Scenario: Discover policy input from current declarations

- **WHEN** an active Task has current Project verification declarations readable through Task Verification
- **AND** the saved policy is absent or its declaration identities are stale
- **THEN** the response MUST return every declaration capability usable for `task-delivery` with its default requiredness, a typed Project coverage gap when no such capability exists, and an empty `overrides` array
- **AND** the returned input MUST satisfy the existing `policy` mutation contract without embedding declaration authority fields

#### Scenario: Reuse an already current policy decision

- **WHEN** the saved policy declaration identities are current
- **THEN** discovery MUST preserve its capabilities, coverage gaps and explicit overrides in `inputJson`
- **AND** discovery MUST NOT silently replace a prior explicit policy decision with declaration defaults

#### Scenario: Discovery cannot prove current facts

- **WHEN** Task, Environment, Receipt or declaration facts are missing, stale or invalid
- **THEN** discovery MUST return a typed blocked diagnostic or fail closed
- **AND** it MUST NOT synthesize a static example as a substitute for current input or write any lifecycle fact
