## MODIFIED Requirements

### Requirement: Task Execution 与 Verification 必须有清晰的静态 owner

Task Record、Review、Verification、Retrospective、Worktree与Preview MUST保持独立owner；生产模块图 MUST不包含Task Environment Application、Persistence、CLI、HTTP或声明provider。Agent直接组合这些能力，不建立统一执行流程模块。

#### Scenario: 检查生产依赖图
- **WHEN** architecture/static validation扫描生产模块和import graph
- **THEN** MUST不存在Task Environment模块或反向依赖

#### Scenario: Bootstrap组装Task模块
- **WHEN** Bootstrap组装Task产品能力
- **THEN** MUST只安装Task Record、Review、Verification、Retrospective、Worktree和Parent等当前模块

#### Scenario: Doctor 生成 diagnostics
- **WHEN** Doctor收集Task相关diagnostics
- **THEN** MUST不调用Environment Application或读取Receipt

#### Scenario: Task Verification读取测试地图
- **WHEN** Task Verification读取Project测试地图
- **THEN** MUST直接使用Verification declaration owner

#### Scenario: Verification 解析 declaration
- **WHEN** Verification解析Project声明
- **THEN** MUST不生成Environment supplemental Plan或ready结论

### Requirement: Task Environment 与 Worktree provider 必须保持窄基础设施边界

Git Worktree provider MUST独立负责checkout、branch、evidence和删除安全。Task Environment模块 MUST不存在；Worktree MUST不接管Preparation、Runtime、Preview、Review、Verification、Task结果或Release状态。

#### Scenario: Worktree provider被调用
- **WHEN** Agent创建、检查或清理Task Worktree
- **THEN** provider MUST只验证Git位置和具体删除不变量

#### Scenario: Environment 创建或清理 worktree
- **WHEN** 旧Environment创建或清理入口被调用
- **THEN** 产品 MUST拒绝不存在的入口且不得转发到Worktree

#### Scenario: provider 被直接调用
- **WHEN** Agent直接调用Worktree provider
- **THEN** provider MUST不要求Environment状态或Receipt
