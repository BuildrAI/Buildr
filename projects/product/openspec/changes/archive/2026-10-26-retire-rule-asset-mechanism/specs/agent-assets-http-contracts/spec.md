## MODIFIED Requirements

### Requirement: Agent Assets management operations have one contract catalog
Skills, Commands, Components, Builtin and runtime projection management HTTP operations MUST be registered with stable operation ids and module-owned Draft 2020-12 request, success-response and error schemas. The catalog MUST distinguish read operations from mutations and MUST not transfer canonical asset ownership to generated DTOs. Retired Rule asset operations MUST NOT be exposed.

#### Scenario: Asset inventory is typed
- **WHEN** a client requests the Agent Assets inventory for a registered Workspace
- **THEN** the response identifies asset kind, id, state and ownership/projection facts using the registered success schema
- **AND** the inventory MUST NOT expose entries derived from a retired Rule manifest

#### Scenario: Retired Rule operations are absent
- **WHEN** a client requests the legacy Rule add or remove operation
- **THEN** the contract catalog MUST NOT route it to a Rule manifest writer
- **AND** the operation MUST return a stable unsupported or retired disposition without creating or modifying any file

#### Scenario: Unsupported asset operation is explicit
- **WHEN** a client requests a runtime render/sync operation not implemented by this Child
- **THEN** the operation returns a stable not-applicable/deferred disposition and does not execute a CLI subprocess or bypass the existing runtime governance
