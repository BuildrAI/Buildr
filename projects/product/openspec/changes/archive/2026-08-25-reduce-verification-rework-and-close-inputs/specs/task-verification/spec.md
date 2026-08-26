## ADDED Requirements

### Requirement: Development feedback MUST reuse Formal Verification planning without becoming Result evidence

When development needs broad `Task-affected` feedback for a request that will later become Formal Verification, the workflow MUST create or consume the closed `Verification Plan` first and MUST use the same plan as the formal execution input when the target, declaration and capability identities remain equal. `Task-affected` feedback MUST remain transient and MUST NOT be treated as a Formal Verification Result.

#### Scenario: Plan-first formal execution

- **WHEN** a stable Task target needs broad affected feedback and a matching formal request can be planned
- **THEN** the Agent MUST review the plan before execution and MUST use the matching plan for Formal Verification
- **AND** the workflow MUST NOT start a second broad affected execution for the same request merely because the phase changed from development to formal verification

#### Scenario: Focused feedback is narrower than the formal plan

- **WHEN** development needs early feedback that is intentionally narrower than the formal plan
- **THEN** the check MAY run as transient focused feedback
- **AND** it MUST be clearly marked non-formal and MUST NOT write or satisfy the Formal Verification Result gate

#### Scenario: Feedback is incomplete or fails

- **WHEN** a transient `Task-affected` check fails, is interrupted or has incomplete evidence
- **THEN** the workflow MUST preserve it as diagnostic feedback only
- **AND** it MUST NOT reconcile it into current Result or use it to claim Formal Verification completion

#### Scenario: Formal identity changes

- **WHEN** target, declaration identity or selected capability set changes after a preview
- **THEN** the workflow MUST form the new Formal Verification identity and replan/re-execute as required
- **AND** it MUST NOT reuse the old preview as evidence for the new identity
