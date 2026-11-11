## Context
程序接入是认证适配层，对话语义全部复用网页同一 Application。full-access 在执行层已可用：执行器声明 `permissionModes`，Application 在 prepare 时按连接能力校验（`agent_permission_unavailable`），执行器按模式映射原生权限。程序入口此前出于安全把模式钉死 default。本变更在凭据授权前提下放开，不新增执行层能力。

## Goals / Non-Goals
- 目标：程序入口受控接受 full-access；发现反映连接真实能力；凭据可开关全部授权；文档同步。
- 非目标：不改执行层与审批语义；不实现第二期事件回推/列表/续聊本身；不改变网页会话认证边界；不做发布。

## Decisions
- **凭据开关默认开启**：`allowFullAccess` 新建凭据与旧记录归一化均默认 true，与网页新对话默认 full-access 一致。GrokBot 因此默认开启，无需在源码硬编码凭据 id 或做运行时数据手术。开关关闭后 full-access 请求 403，作为安全阀。取舍：默认开启使既有凭据（含千问办公）也可请求 full-access，但仍需调用方显式传 `permissionMode=full-access`，不会自动提权；人可随时关闭。
- **发现与凭据门禁分离**：发现透传连接 `capabilities.permissionModes`（连接支持什么）；凭据 `allowFullAccess` 在请求时门禁（能否请求 full-access）。二者职责不同，发现不按凭据过滤模式。
- **通用准入**：full-access 门禁按请求体 `permissionMode==='full-access'` 判断，不绑定操作 id；省略默认值按输入 schema 是否含 `permissionMode` 通用钉 default。第二期 `messages` 续聊接口（schema 含 permissionMode）落地后自动覆盖，避免再次改准入。
- **管理 API**：新增 `POST /api/v1/app/programmatic-access/:id/full-access`，body `{expectedRevision, allowFullAccess}`，仅网页会话；按已观察修订切换并 bump revision，复用现有撤销/重生成校验风格。

## Risks / Trade-offs
- 与 programmatic-access-phase-2 并发改动相同文件：集成时按 dev 实时状态核对冲突；通用准入降低语义冲突。
- 默认开启的安全取舍已在 Decisions 说明；关闭即 403，保留人工控制。
- 旧记录无字段：读取归一化为 true，写入时落字段；不破坏既有令牌与摘要。

## Migration Plan
无 schema 迁移：`allowFullAccess` 存于凭据 metadata JSON，缺失按 true 解释。GrokBot 旧记录读取即视为开启。部署后无需数据手术。

## Open Questions
无。