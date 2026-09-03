# workspace-daily-progress-module-architecture Specification

## Purpose

定义 Project Daily Progress 纵向切片在 Workspace 模块中的唯一归属、组装与行为保持边界。

## Requirements

### Requirement: Project Daily Progress 必须归入 Workspace 模块
Buildr MUST 将 Project Daily Progress 的 Domain、Application、业务 Persistence、CLI 与 HTTP Adapter 归入 `src/workspace/` 对应技术层，并 MUST 由 `src/workspace/module.ts` 私有组装唯一 Store/Application、公开命名 capability 和 interface contributions。迁移完成后，全局 `src/domain`、`src/application`、`src/infrastructure`、`src/interfaces` 与 Bootstrap compatibility composition MUST NOT 保留第二份实现、转发入口或业务注册。

#### Scenario: 架构 verifier 检查 Daily Progress 纵向切片
- **WHEN** verifier 扫描 Daily Progress 的 Domain、Application、Persistence、CLI、HTTP 与注册入口
- **THEN** 每项实现 MUST 只存在于 `src/workspace/` 的对应技术层
- **AND** `src/workspace/module.ts` MUST 是其唯一业务组装入口
- **AND** 公共 CLI Host 与 HTTP Host MUST 只合并 Workspace module contributions，不得直接实现 Daily Progress 业务路由或注册旧 Application

### Requirement: Daily Progress 模块迁移必须保持外部契约与 authority
Workspace module 中的 Daily Progress capability MUST 继续复用已登记 Project 读取和 Task Record 只读能力，并 MUST 保持现有 ignored YAML Store 为唯一 writer。迁移 MUST NOT 改变公开 CLI、HTTP、JSON、YAML schema、Task 引用校验、日期语义、错误映射、原子覆盖、只读查询或 writer authority。

#### Scenario: 对比迁移前后代表性调用
- **WHEN** 相同 Workspace、Project、日期和 closed payload 分别经过迁移后的 CLI 或 HTTP Adapter
- **THEN** 返回 schema identity、状态、字段与错误语义 MUST 与迁移前一致
- **AND** 成功写入 MUST 仍只原子更新 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`
- **AND** inspect、list 与 HTTP GET MUST 仍不扫描 Git、不写 Task SQLite 或创建第二份存储
