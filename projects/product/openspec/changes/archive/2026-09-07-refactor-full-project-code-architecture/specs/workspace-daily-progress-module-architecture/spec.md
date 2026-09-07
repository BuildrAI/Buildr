## MODIFIED Requirements

### Requirement: Project Daily Progress 必须归入 Workspace 模块
Buildr MUST将 Project Daily Progress 的 Domain、Application、业务 Persistence、CLI 与 HTTP Adapter 归入 `src/modules/workspace/` 对应技术层，并 MUST由 `src/modules/workspace/module.ts` 私有组装唯一 Store/Application、公开命名 capability 和 Interface contributions。迁移完成后，旧 `src/workspace`、全局业务技术层与 Bootstrap compatibility composition MUST NOT保留第二份实现、转发入口或业务注册。

#### Scenario: 架构 verifier 检查 Daily Progress 纵向切片
- **WHEN** verifier 扫描 Daily Progress 的 Domain、Application、Persistence、CLI、HTTP 与注册入口
- **THEN** 每项实现 MUST只存在于 `src/modules/workspace/` 的对应技术层
- **AND** `src/modules/workspace/module.ts` MUST是其唯一业务组装入口
- **AND** 公共 CLI Host 与 HTTP Host MUST只合并 Workspace module contributions，不得直接实现 Daily Progress 业务路由或注册旧 Application
