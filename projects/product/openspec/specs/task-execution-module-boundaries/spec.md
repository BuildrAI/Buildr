# task-execution-module-boundaries Specification

## Purpose

收敛 Task Execution、Task Verification、Project Verification 与 Git Worktree provider 的静态 owner，保证目录迁移不改变既有生命周期、验证、执行记录、CLI/HTTP/JSON 契约及基础设施语义。

## Requirements

### Requirement: Task Execution 与 Verification 必须有清晰的静态 owner
Task Record、Review、Verification、父任务协调（Task Parent Coordination）、Worktree 与 Preview MUST保持独立 owner；复盘分析是纯 Skill，本机文档读取归 Task Record。生产模块图 MUST不包含 Task Overview、Task Environment、Task Development、Task Execution Record、旧 Finish 或 Retrospective Application。

#### Scenario: 检查生产依赖图
- **WHEN** static validation 扫描生产模块
- **THEN** MUST只发现当前仍存在的 Task Record、Review、Verification、父任务协调、Worktree 与 Preview owner
- **AND** MUST不存在退役模块 descriptor、route 或 compatibility port

#### Scenario: Bootstrap组装Task模块
- **WHEN** Bootstrap 组装 Task 能力
- **THEN** MUST只安装 Task Record、Review、Verification、Worktree 与父任务协调等当前模块
- **AND** MUST不安装独立 Task Overview 或内部 workflow router

#### Scenario: Doctor 生成 diagnostics
- **WHEN** Doctor 收集 Task diagnostics
- **THEN** MUST只调用当前 Task Record 与专业 read model
- **AND** MUST不调用任何退役 Application

#### Scenario: Task Verification读取测试地图
- **WHEN** Task Verification 读取 Project 测试地图
- **THEN** MUST直接使用 Verification declaration owner
- **AND** MUST不生成其他 Task 专业状态

#### Scenario: Verification 解析 declaration
- **WHEN** Verification 解析 Project 声明
- **THEN** MUST不生成 Overview、Environment、Development、Execution Record 或旧 Finish 状态

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
目录、文件、import 与类型迁移 SHALL保留未被本次 delta 明确修改的 CLI、HTTP、JSON envelope、Task/Review/Verification Result、SQLite transaction、安全边界与副作用。明确修改的并发摘要、读取诊断、Web 默认值和帮助行为 MUST以对应 capability delta 为准。保留能力的 public DTO MUST继续由唯一 schema source 生成。

#### Scenario: 迁移后运行公开入口
- **WHEN** 使用未被本次 delta 修改的既有 CLI、HTTP 或 Task Application 请求
- **THEN** 返回 envelope、错误码、持久化结果和副作用 MUST保持等价
- **AND** 被本次 delta 修改的入口 MUST只出现已声明差异

#### Scenario: 静态边界检查
- **WHEN** architecture boundary tests 扫描 Task 源码
- **THEN** MUST无退役 owner 实现、无第二 composition path、无 `@ts-nocheck`
- **AND** HTTP DTO MUST与唯一生成源一致
