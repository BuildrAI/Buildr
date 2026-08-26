## ADDED Requirements

### Requirement: Agent workflow MUST consume current input discovery and focused consumer coverage

The built-in workflow MUST use Task Development `discover` before composing `observe` or `policy` mutation input when current facts are available, and MUST select only focused consumer regression or diagnostic coverage for shared JSON/schema changes. It MUST NOT turn consumer coverage into a generic hard gate or infer Full Verification from an unknown consumer.

#### Scenario: Development mutation input

- **WHEN** the next owner is Task Development `observe` or `policy`
- **THEN** the Agent MUST request the matching current `inputJson`, review its source identities/diagnostics, and pass it unchanged unless a current authority decision requires an explicit edit
- **AND** an unavailable or blocked discovery MUST be restored by its owning workflow rather than replaced by a hand-written static example

#### Scenario: Shared contract consumer change

- **WHEN** a JSON/schema contract change affects multiple known consumers
- **THEN** the workflow MUST run or select focused regression and diagnostic coverage for those consumers
- **AND** it MUST NOT create a new universal gate, auto-expand unrelated verification, or block unrelated work

#### Scenario: Formal verification handoff

- **WHEN** development feedback and Formal Verification concern the same request
- **THEN** the Agent MUST keep feedback transient, reuse the matching plan/execution identity where valid, and leave Result reconciliation to Task Verification
- **AND** the Agent MUST NOT claim completion from feedback alone
