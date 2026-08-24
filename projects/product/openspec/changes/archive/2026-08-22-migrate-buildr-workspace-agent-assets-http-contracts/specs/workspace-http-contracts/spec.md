## ADDED Requirements

### Requirement: Workspace HTTP operations have executable schemas
Workspace Control Plane HTTP operations MUST be registered with stable operation ids and Draft 2020-12 request, success-response and error schemas. Schemas MUST reject unknown fields, missing required fields and wrong JSON types without coercion, defaults or removal.

#### Scenario: Workspace list validates response
- **WHEN** a client calls `GET /api/v1/workspaces`
- **THEN** the response is validated against the registered Workspace list success schema and contains the existing registry revision and workspace entries

#### Scenario: Unknown Workspace field is rejected
- **WHEN** a client submits a Workspace mutation body containing an undeclared field
- **THEN** the request is rejected with the stable error envelope and the Application writer is not called

### Requirement: Workspace routing preserves safety and application authority
Workspace HTTP adapters MUST preserve workspaceId path scoping, reject filesystem `target`, `path` and `root` query escape hatches, enforce existing Origin/session write authorization, and map validated Interface DTOs explicitly to Workspace Application inputs.

#### Scenario: Path escape is rejected before Application access
- **WHEN** a request includes `target`, `path` or `root` on a workspace-scoped URL
- **THEN** it returns `target_forbidden` and does not resolve or mutate a filesystem path supplied by the client

#### Scenario: Metadata update uses existing writer
- **WHEN** an authorized client updates Workspace, Project or Service metadata with a valid DTO
- **THEN** the adapter maps the DTO to the existing Application method and returns its existing status and response semantics

### Requirement: Workspace Client is the page boundary
The buildr-web Workspace capability Client MUST consume generated DTOs for registry, Workspace, Project and Service reads/writes. Workspace management pages MUST NOT duplicate the same response interfaces or rely on scattered unchecked casts.

#### Scenario: Workspace page consumes typed registry
- **WHEN** the Workspaces page loads or removes a registered workspace
- **THEN** it calls the typed Workspace Client and receives generated DTOs while the low-level fetch transport remains generic

### Requirement: Workspace contracts have direct tests
Each migrated Workspace operation MUST have Contract Tests covering valid request/response, unknown or invalid fields, and the stable error envelope while preserving existing authorization and routing behavior.

#### Scenario: Contract test detects response drift
- **WHEN** a Workspace Application response contains a field not declared by its success schema
- **THEN** the Contract Test fails before the change can converge
