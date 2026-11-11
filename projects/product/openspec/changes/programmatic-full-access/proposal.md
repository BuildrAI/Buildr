## Why
程序接入发现入口把所有连接的 `capabilities.permissionModes` 硬编码为 `["default"]`，准入层显式拒绝 `permissionMode=full-access` 并钉死 default，OpenAPI 也将该字段固定为 `const:'default'`。GrokBot 等外部程序通过 API 新建对话、发送、续聊时无法选择全部授权，执行卡在审批。执行层（各执行器与 Application）本身已完整支持 default/full-access，缺的是程序入口的受控放开。

## What Changes
- 程序接入 start、send、prepare-send 及后续单步续聊接受 `permissionMode=full-access`，行为与网页“全部授权”一致；省略仍默认 default。
- 凭据新增“允许全部授权执行”开关 `allowFullAccess`（默认开启），可在网页创建时选择、在凭据卡片切换；关闭时请求 full-access 返回 403。
- 发现入口透传连接真实 `capabilities.permissionModes`，支持全部授权的连接列出 `["default","full-access"]`。
- 同步 /help、/operations、各操作 documentationUrl、OpenAPI 与 example.py；contractVersion 随内容变化。
- 仍拒绝任意 cwd 与越权 taskLinks；不开放网页管理/账号接口给 Bearer。非破坏性：default 行为与既有恢复/幂等语义不变。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `programmatic-agent-access`: 凭据增加全部授权开关，发现透传连接权限模式，公共对话操作在凭据授权时接受 full-access。

## Impact
buildr 的 agent-service 程序接入 HTTP 准入/发现、凭据持久化与管理 API、文档生成及集成测试；buildr-web 的程序接入凭据创建/卡片开关与 API 客户端。不改 buildr-agent 执行层（已支持）。与独立任务 programmatic-access-phase-2 触及相同文件，本变更以按 schema 的通用准入兼容其单步续聊接口落地。任务说明见 [任务说明](@task/programmatic-full-access)。