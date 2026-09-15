# agent-assets-http-contracts Specification

## Purpose

Rules、Skills、Commands、Components、Builtin 与 runtime projection 管理 HTTP 契约及其 typed Client 边界。

## Requirements

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

### Requirement: 工作空间技能内容读取必须有界且只读
技能列表、详情和附属文本文件 MUST 通过模块所属的类型化只读接口提供。列表 MUST 读取当前工作空间登记事实；文件 MUST 限于已登记技能的本地源目录。接口 MUST 拒绝目录逃逸、符号链接、特殊文件和超限文件，不联网解析远端来源，不执行脚本、不写入清单或派生入口。

#### Scenario: 阅读本地技能
- **WHEN** 用户请求已登记本地技能详情及其参考文档
- **THEN** 响应 MUST 返回来源、启用和必需事实、源相对路径、附属文件信息及所选文本内容
- **AND** 内容缺失或不支持预览 MUST 局部说明，不伪造正文或同步成功

#### Scenario: 拒绝越界文件
- **WHEN** 文件路径包含越界片段、符号链接或指向技能目录外
- **THEN** 接口 MUST 返回明确错误，不泄露目录外内容且不产生写入

#### Scenario: 未解析远端来源
- **WHEN** 技能仅有远端登记而无本地源目录
- **THEN** 详情 MUST 展示来源与本地内容不可用说明，不自行下载
