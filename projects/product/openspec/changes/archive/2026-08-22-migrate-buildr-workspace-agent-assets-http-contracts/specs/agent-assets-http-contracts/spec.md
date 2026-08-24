## ADDED Requirements

### Requirement: Agent Assets management operations have one contract catalog
Rules, Skills, Commands, Components, Builtin and runtime projection management HTTP operations MUST be registered with stable operation ids and module-owned Draft 2020-12 request, success-response and error schemas. The catalog MUST distinguish read operations from mutations and MUST not transfer canonical asset ownership to generated DTOs.

#### Scenario: Asset inventory is typed
- **WHEN** a client requests the Agent Assets inventory for a registered Workspace
- **THEN** the response identifies asset kind, id, state and ownership/projection facts using the registered success schema

#### Scenario: Unsupported asset operation is explicit
- **WHEN** a client requests a runtime render/sync operation not implemented by this Child
- **THEN** the operation returns a stable not-applicable/deferred disposition and does not execute a CLI subprocess or bypass the existing runtime governance

### Requirement: Agent Assets mutations preserve writer and ownership rules
Agent Assets mutation operations MUST validate closed request DTOs, require the existing write authorization, map to the corresponding Application command, and preserve component ownership, required Builtin protections, mutation fences and runtime projection rules.

#### Scenario: Invalid mutation has no side effect
- **WHEN** a mutation body omits a required identity or includes an unknown field
- **THEN** the request fails validation and no manifest, asset file, registry or projection file is changed

#### Scenario: Owned asset cannot be bypassed
- **WHEN** a client attempts to remove or replace an asset owned by a managed Component or required Builtin
- **THEN** the existing Application ownership error is returned through the stable error envelope and the writer performs no partial update

### Requirement: Agent Assets Client consumes generated DTOs
Buildr Web MUST expose an Agent Assets capability Client backed by generated DTOs for inventory and supported mutations. Pages and management panels MUST not re-declare the same asset response shape.

#### Scenario: Agent Assets panel uses typed inventory
- **WHEN** an Agent Assets management panel loads a Workspace inventory
- **THEN** it calls the capability Client and renders generated DTO fields without treating the low-level transport result as an ad-hoc payload

### Requirement: Agent Assets contract coverage is auditable
Contract Tests MUST cover each supported Agent Assets operation's request, success response and error schema, and MUST report deferred operations separately from migrated operations without making deferred coverage a false runtime success.

#### Scenario: Generated drift is caught
- **WHEN** a generated Agent Assets DTO no longer matches its source schema
- **THEN** the affected Service build or Contract Test fails with a drift diagnostic
