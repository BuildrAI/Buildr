# workspace-http-contracts Specification

## Purpose

Workspace Control Plane 登记、Workspace/Project/Service 查询与元数据管理 HTTP 契约。

## Requirements

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

### Requirement: 目录写入操作接受关系字段
`POST /api/v1/asset-catalog/services` 的服务草稿 MUST 接受可选 `projectIds`（编码或标识集合）；`POST /api/v1/asset-catalog/repositories` 与 `PUT /api/v1/asset-catalog/:kind/:id` MUST 接受可选 `serviceIds`；服务更新 MUST 接受可选 `code` 与 `projectIds`，项目更新 MUST 接受可选 `code`、`serviceIds` 与 `newServices`（服务草稿数组，仅项目更新有效）。全部字段为可选补充，缺失时行为与既有契约一致；未知字段、错误类型或引用不存在的对象 MUST 按既有拒绝语义处理。

#### Scenario: 新增字段随草稿提交
- **WHEN** 客户端提交携带 `serviceIds` 的代码库创建请求
- **THEN** 请求通过契约校验并由应用写入服务引用，未知字段仍被拒绝

#### Scenario: 引用不存在对象
- **WHEN** 任一关系字段引用不存在的标识
- **THEN** 请求被拒绝且不产生部分写入
