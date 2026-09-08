## MODIFIED Requirements

### Requirement: Task Execution 与 Verification 必须有清晰的静态 owner
`src/modules/task` MUST拥有 Task Record、Review、Task Verification Report、父任务协调、Worktree 与 Task-scoped Change/Preview 读取；`src/modules/project-testing` MUST只拥有 Project `verification.yml` 声明；`src/modules/openspec` MUST拥有通用规范解析、收敛、隔离验证与恢复。复盘分析是纯 Skill，本机复盘文档读取归 Task Record。生产模块图 MUST不包含 Task Overview、Task Environment、Task Development、Task Execution Record、旧 Finish、Retrospective Application 或名为通用 `verification` 的含混业务 owner。

#### Scenario: 检查生产依赖图
- **WHEN** static validation 扫描生产模块
- **THEN** MUST只发现当前仍存在的 Task、Project Testing 与 OpenSpec owner
- **AND** MUST不存在退役模块 descriptor、route、compatibility port 或旧 `src/task|src/verification` 路径

#### Scenario: Bootstrap组装Task模块
- **WHEN** Bootstrap 组装 Task 能力
- **THEN** MUST安装 Task 当前能力并通过具名 capability 注入 Project Testing declaration 与 OpenSpec query
- **AND** MUST不安装独立 Task Overview、内部 workflow router 或共享 runtime method bridge

#### Scenario: Doctor 生成 diagnostics
- **WHEN** Diagnostics 收集 Task 或 Project Testing diagnostics
- **THEN** MUST只调用对应模块的 current Read Model
- **AND** MUST不调用任何退役 Application 或复制 declaration 归一化规则

#### Scenario: Task Verification读取测试地图
- **WHEN** Task Verification 读取 Project 测试地图
- **THEN** MUST直接使用 Project Testing declaration capability
- **AND** MUST不生成其他 Task 专业状态或工程测试运行状态

#### Scenario: Verification 解析 declaration
- **WHEN** Project Testing 解析或更新 Project 声明
- **THEN** MUST不生成 Task Overview、Environment、Development、Execution Record、Verification Report 或旧 Finish 状态

### Requirement: Task Environment 与 Worktree provider 必须保持窄基础设施边界
Git Worktree provider MUST位于 `src/modules/task/infrastructure` 并独立负责 checkout、branch、evidence和删除安全。Task Environment模块 MUST不存在；Worktree MUST不接管Preparation、Runtime、Preview、Review、Verification、Task结果或Release状态。

#### Scenario: Worktree provider被调用
- **WHEN** Agent创建、检查或清理Task Worktree
- **THEN** provider MUST只验证Git位置和具体删除不变量

#### Scenario: Environment 创建或清理 worktree
- **WHEN** 旧Environment创建或清理入口被调用
- **THEN** 产品 MUST拒绝不存在的入口且不得转发到Worktree

#### Scenario: provider 被直接调用
- **WHEN** Agent直接调用Worktree provider
- **THEN** provider MUST不要求Environment状态、Project Testing、OpenSpec或Receipt
