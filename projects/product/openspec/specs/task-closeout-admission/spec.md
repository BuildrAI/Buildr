# task-closeout-admission Specification

## Purpose

提供跨 Task 生命周期事实的只读收尾准入投影，统一对账 OpenSpec、Owner、Environment、目标身份、Execution Record 与资源等待，并输出四状态行动边界。

## Requirements

### Requirement: Buildr MUST provide a response-only closeout admission projection
Buildr MUST在正式 Task 的只读 Task Entry Snapshot 中提供可选 `closeoutAdmission`，并从 current Task Record、scoped OpenSpec Change、selected Owner route、Task Environment、Task Development target、Execution Record 与已有 Finish/resource waiting facts 派生。该投影 MUST不创建或修改任何 Task、Environment、Development、Verification、Candidate、Execution Record、Finish 或其他持久事实。

#### Scenario: active Task facts are available
- **WHEN** Agent reads `task next` for an active Task whose matching Environment and current lifecycle facts can be read
- **THEN** response MUST include `closeoutAdmission` with a four-state status, checks, blockers/effects and next action facts
- **AND** the read MUST produce zero effects

#### Scenario: provider read is unavailable
- **WHEN** one required owner cannot provide its current read fact
- **THEN** admission MUST report the responsible owner, stable diagnostic code and an actionable next action
- **AND** MUST NOT report `ready-for-finish` or invent a replacement authority

### Requirement: Admission MUST expose exactly four action states
The projection MUST use only `ready-for-finish`, `repair-before-finish`, `waiting-on-execution` or `blocked-by-user-decision` for an applicable active Task. It MUST include portable `status`, ordered checks, zero or more blockers and a bounded next action containing owner and invocation/summary.

#### Scenario: deterministic integrity or identity mismatch
- **WHEN** OpenSpec Change, Owner route, Environment identity, Content Target, Candidate/Handoff or other required authority is missing, stale, unavailable or mismatched in a way that could cause wrong-object writes or false completion
- **THEN** admission MUST return `repair-before-finish` or `blocked-by-user-decision` with the exact axis, owner, code and next action
- **AND** heavy Candidate/Finish execution MUST be treated as not admitted

#### Scenario: matching execution or shared resource is already active
- **WHEN** a matching Execution Record is open/active, or an existing Finish/resource diagnostic says the same target is waiting for execution or capacity
- **THEN** admission MUST return `waiting-on-execution` with the existing record/resource identity when portable and the read/wait next action
- **AND** MUST NOT authorize a duplicate execution or create a second record

#### Scenario: all deterministic checks pass
- **WHEN** required Change/Owner/Environment/target facts are current, no matching execution/resource wait exists, and the Task's current next is a valid Candidate/Finish boundary
- **THEN** admission MUST return `ready-for-finish`
- **AND** MUST describe this as permission to proceed, not as a Candidate, Verification, Finish or Task completion result

### Requirement: Admission MUST preserve Agent choice and narrow the hard-stop boundary
Buildr MUST treat the projection as facts and guidance. It MUST NOT choose repair, retry, skip, risk acceptance or Finish strategy. Only deterministic identity/integrity mismatch or an explicit user-decision boundary MAY prevent the heavy path; unrelated development, read-only investigation and bounded informal checks MUST remain available.

#### Scenario: Agent chooses another legal action
- **WHEN** admission returns `ready-for-finish` or a non-terminal recommendation and Agent selects another action accepted by that action's owner contract
- **THEN** Buildr MUST NOT write a gate, change Task status or reject the unrelated action solely because admission was not followed

#### Scenario: deterministic blocker is repaired
- **WHEN** Agent repairs the reported owner fact and rereads the same Task Entry Snapshot
- **THEN** admission MUST be recomputed from current owner facts
- **AND** the previous admission status MUST NOT be reused as a persistent decision

### Requirement: Admission MUST return bounded portable recovery guidance
Every non-ready admission MUST include one primary owner and one next action or invocation that can be used to inspect, repair or wait on the owning authority. The projection MUST omit local absolute paths, raw argv, secrets, leases, tokens, full diagnostics, stdout/stderr and professional evidence bodies.

#### Scenario: repair guidance
- **WHEN** admission returns `repair-before-finish`
- **THEN** response MUST identify the failing axis and responsible owner and MUST provide the owner-recognized next action
- **AND** response MUST keep effects empty

#### Scenario: waiting guidance
- **WHEN** admission returns `waiting-on-execution`
- **THEN** response MUST identify the existing run/record/resource when portable and MUST direct the Agent to read or wait on that authority
- **AND** response MUST NOT include a retry or duplicate-start command
