# task-execution-module-boundaries Specification

## Purpose

收敛 Task Execution、Task Verification、Project Verification 与 Git Worktree provider 的静态 owner，保证目录迁移不改变既有生命周期、验证、执行记录、CLI/HTTP/JSON 契约及基础设施语义。

## Requirements

### Requirement: Task Execution 与 Verification 必须有清晰的静态 owner
Task Record、Review、Verification、Worktree与Preview MUST保持独立owner；复盘分析是纯Skill，本机文档读取归Task Record。生产模块图 MUST不包含Task Environment或Retrospective Application。

#### Scenario: 检查生产依赖图
- **WHEN** static validation扫描生产模块
- **THEN** MUST不存在Environment或Retrospective descriptor

#### Scenario: Bootstrap组装Task模块
- **WHEN** Bootstrap组装Task能力
- **THEN** MUST只安装Task Record、Review、Verification、Worktree、Overview和Parent等当前模块

#### Scenario: Doctor 生成 diagnostics
- **WHEN** Doctor收集Task diagnostics
- **THEN** MUST不调用Environment或Retrospective Application

#### Scenario: Task Verification读取测试地图
- **WHEN** Task Verification读取Project测试地图
- **THEN** MUST直接使用Verification declaration owner

#### Scenario: Verification 解析 declaration
- **WHEN** Verification解析Project声明
- **THEN** MUST不生成Environment或Retrospective状态

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
