## Why

程序接入凭据创建后，名称、允许访问的工作空间与操作权限在详情中只能只读查看；调整授权范围只能撤销后重建，凭据文件与接入信息随之变化，程序侧需要重新交接。用户明确要求已有凭据能像「新建接入程序」一样修改参数。

## What Changes

- 新增网页会话管理操作 `POST /api/v1/app/programmatic-access/:id/update`：按已观察修订修改有效凭据的名称、工作空间、操作权限与 full-access 开关；凭据 ID 与令牌保持不变；已撤销凭据不可修改。
- 前端凭据卡片新增「编辑」入口，复用新建表单的编辑模式（预填当前值），保存后列表、详情与接入信息同步刷新。
- 参数校验与新建一致（名称非空且不超过 100、工作空间已登记且非空、权限必须含读取）。
- 程序端 Bearer 契约、操作目录与 OpenAPI 不变（管理路由不属于程序端文档），无破坏性变更。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `programmatic-access-onboarding`：新增「凭据参数可编辑」要求，覆盖管理端更新操作、版本与撤销保护、编辑表单复用。

## Impact

- buildr 服务：`services/buildr/src/modules/agent-service/persistence/programmatic-credentials.ts`、`interfaces/http/programmatic-http.ts`。
- buildr-web：`features/agent-conversations/api/programmatic-access-api.ts`、`ProgrammaticAccessCreateModal.tsx`、`ProgrammaticCredentialCard.tsx`、`ProgrammaticAccessSettings.tsx`。
- 测试：`services/buildr/test/integration/programmatic-agent-http.test.ts`、`services/buildr-web/test/programmatic-access-*.test.mjs`。
- 存储结构不变（复用 metadata JSON 字段）；令牌文件与哈希不变。
