## Why
程序接入发现入口把所有连接的 `capabilities.permissionModes` 硬编码为 `["default"]`，准入层显式拒绝 `permissionMode=full-access` 并钉死 default，OpenAPI 也将该字段固定为 `const:'default'`。GrokBot 等外部程序通过 API 新建对话、发送、续聊时无法选择全部授权，执行卡在审批。执行层（各执行器与 Application）本身已完整支持 default/full-access，缺的是程序入口的受控放开。

## What Changes
- 程序接入 start、send、prepare-send 及后续单步续聊接受 `permissionMode=full-access`，行为与网页“全部授权”一致；start/send 省略仍默认 default，单步 `/messages` 省略继承最近轮次，无最近模式时 default。
- 凭据新增“允许全部授权执行”开关 `allowFullAccess`（默认开启），可在网页创建时选择、在凭据卡片切换；关闭时请求 full-access 返回 403。
- 发现入口透传连接真实 `capabilities.permissionModes`，支持全部授权的连接列出 `["default","full-access"]`。
- 同步 /help、/operations、各操作 documentationUrl、OpenAPI 与 example.py；contractVersion 随内容变化。
- 仍拒绝任意 cwd 与越权 taskLinks；不开放网页管理/账号接口给 Bearer。非破坏性：default 行为与既有恢复/幂等语义不变。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `programmatic-agent-access`: 本变更仅维护“可恢复的公共对话操作”的受控 full-access；凭据开关和发现条款已交接 `split-buildr-harness-product` 唯一维护。

## Impact
buildr 的 agent-service 程序接入 HTTP 准入/发现、凭据持久化与管理 API、文档生成及集成测试；buildr-web 的程序接入凭据创建/卡片开关与 API 客户端。不改 buildr-harness 执行层（已支持）。与独立任务 programmatic-access-phase-2 触及相同文件，本变更以按 schema 的通用准入兼容其单步续聊接口落地。任务说明见 [任务说明](@task/programmatic-full-access)。

## 规范责任交接（2026-11-16）

两个 `programmatic-agent-access` 需求（“独立程序凭据与最小授权”“可发现的当前能力”）已由 `split-buildr-harness-product` 唯一承接并在该变更中同步。交接以现有实现和最新主规范为依据，保留原先的执行归属、安全控制、凭据开关及真实能力发现承诺，按已确认的 Harness / Development 边界扩展；本变更不再重复写入这些条款，不删除主规范需求，也不撤销既有交付。本变更仍负责“可恢复的公共对话操作”；其中省略权限模式以当前“单步续聊”主规范及实现为准，start/send 默认 default，`/messages` 继承最近轮次，无最近模式时 default。
