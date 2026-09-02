# task-execution-module-boundaries Specification

## Purpose

收敛 Task Execution、Task Verification、Project Verification 与 Git Worktree provider 的静态 owner，保证目录迁移不改变既有生命周期、验证、执行记录、CLI/HTTP/JSON 契约及基础设施语义。

## Requirements

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

### Requirement: 结构迁移不得改变公开契约与运行语义
目录、文件和 import 迁移 SHALL 保留既有 CLI、HTTP、JSON envelope、Task/Verification Result、SQLite transaction、锁、安全边界、执行副作用、cleanup 顺序与 capability identity；本 Change MUST NOT 引入完整 JSON Schema、Ajv、DTO 生成或 Typed API Client。

#### Scenario: 迁移后运行公开入口
- **WHEN** 使用既有 CLI/HTTP/内部 Task application 入口执行相同请求
- **THEN** 返回 envelope、错误码、持久化结果和副作用 MUST 与迁移前保持等价

#### Scenario: 静态边界检查
- **WHEN** architecture boundary tests 扫描源代码
- **THEN** MUST 无 Verification→Doctor parser 反向依赖、无旧 owner 的实现残留，且 MUST 保留唯一 module/bootstrap composition path

### Requirement: Internal Workflow Route 必须分离清单、分发与业务执行
Task 模块 MUST以 contract catalog 作为内部进程级 route 清单，以 internal interface router 按 route id 分发到 runner，并 MUST将真实业务用例保留在 Task Application Service。Bootstrap MUST只通过 Task module 公开入口调用 router，不得拥有或复制 route 清单与分发实现。

#### Scenario: Doctor 读取 route inventory
- **WHEN** Doctor 或静态验证检查 required internal workflow routes
- **THEN** 它 MUST读取 Task contract catalog 的只读 inventory
- **AND** catalog MUST只登记 route metadata，不执行 Task 用例

#### Scenario: Bootstrap 分发内部 route
- **WHEN** CLI 收到 `buildr __internal <route>`
- **THEN** Bootstrap MUST调用 Task module 公开 internal workflow 入口
- **AND** router MUST按 catalog route id 选择 runner
- **AND** runner MUST调用既有 Task Application Service 执行业务

#### Scenario: 未知 route
- **WHEN** router 收到 catalog 未登记的 route id
- **THEN** router MUST返回未匹配结果并保持既有 CLI fallback 行为

#### Scenario: 检查旧顶层 route owner
- **WHEN** 架构验证扫描生产源码
- **THEN** 顶层 `src/application/internal-workflow-route-inventory.mjs` 与 `src/interfaces/internal/formal-workflow-routes.mjs` MUST不存在且无引用
