## ADDED Requirements

### Requirement: Buildr Web HTTP 必须提供全局 Release Awareness 只读接口
Buildr Web Runtime MUST 提供不依赖 Workspace 的全局只读 Release Awareness API，返回与 CLI 相同的 GA/RC snapshot，并 MUST NOT提供从网页执行 npm 更新的 mutation endpoint。

#### Scenario: 全局页面读取版本发布感知
- **WHEN** Buildr Web 客户端请求 `/api/v1/release-awareness`
- **THEN** HTTP interface MUST返回当前安装、stable/candidate 轨道、notices、freshness与next actions
- **AND** MUST NOT要求 workspaceId 或 filesystem target

#### Scenario: Web 查询失败
- **WHEN** Release Awareness 查询不可用
- **THEN** HTTP interface MUST返回可解释的非阻断状态
- **AND** Workspace、Task、Project、Service与文章 API MUST继续可用

#### Scenario: 拒绝网页更新
- **WHEN** 客户端尝试通过 Release Awareness API提交 npm 更新
- **THEN** Buildr Web Runtime MUST不登记对应写路由
- **AND** 用户只能复制命令或把选择交给 Agent
