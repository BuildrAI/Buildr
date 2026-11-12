## Context

管理端现有操作为创建、撤销、重新生成与 full-access 开关，均带已观察修订保护；凭据存于 SQLite metadata JSON，令牌存于 600 私有文件，列表只返回哈希后的元数据。前端新建表单为 `ProgrammaticAccessCreateModal`，详情卡片 `ProgrammaticCredentialCard` 只读展示参数。程序端每次请求重新认证凭据，权限变化即时生效。

## Goals / Non-Goals

目标：已有凭据参数可按新建同样的表单与校验修改；修订与撤销保护一致；令牌与凭据 ID 不变。
非目标：令牌轮换（已有重新生成）、程序端契约变化、批量编辑、撤销恢复。

## Decisions

1. 后端 `ProgrammaticCredentials` 新增 `update(id, revision, raw, registered)`：抽取与 `create` 共用的参数校验（名称/工作空间/权限/allowFullAccess），仅更新 metadata 并换新修订；事务内复核撤销与修订（沿用 `regenerate` 的复核模式），不触碰 digest 与令牌文件。`allowFullAccess` 省略时保持当前值。
2. 路由 `POST /api/v1/app/programmatic-access/:id/update`，走现有 `context.authorizeWrite()` 会话授权；输入键限定为 `expectedRevision` 与四个参数键，非法键 400。
3. 前端表单按项目约定以第二层抽屉承载：`ProgrammaticAccessFormDrawer` 复用共享 `DrawerShell`（与 `MetadataEditDrawer` 等编辑抽屉同一壳层），叠在「智能体与模型」抽屉之上；传入 `editing?: AccessCredential`，打开时预填名称、工作空间、权限与开关；标题「编辑接入程序」/「新建接入程序」，底部「保存修改」/「创建并自动保存」；原 Modal 组件移除，创建模式行为不变。
4. `ProgrammaticCredentialCard` 的管理 Dropdown 增加「编辑参数」项（仅有效凭据），详情权限区保持只读展示，编辑统一走表单，避免两处可写状态。
5. `ProgrammaticAccessSettings` 增加 `editing` 状态与 `update` 调用：成功后以返回凭据替换列表对应项（令牌路径不变），失败沿用现有错误条与「刷新状态」。
6. API 客户端新增 `update(credential, input)`，携带 `expectedRevision`。

## Risks / Trade-offs

- 并发修改：409 冲突由现有错误提示与刷新承接，不静默覆盖。
- 权限收回即时生效：与撤销语义一致，程序端在下次请求时被拒绝；已在执行的工作不受影响（与现有撤销行为一致）。
- 表单双模式增加少量状态：打开时预填、抽屉关闭即销毁（DrawerShell destroyOnClose）避免脏状态残留。
