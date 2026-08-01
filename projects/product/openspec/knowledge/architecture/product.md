# Buildr 产品架构

## 用户与协作角色

人通过自然语言表达目标、提供业务判断、授权和确认重要决策；Agent 消费组织工作资产，形成 Task Context 并推进专业工作；Buildr 不成为另一个 Agent，而是治理长期资产与确定性边界。

## 核心产品模型

```text
Work Information Space
  ├─ Buildr Workspace（范围与发现入口）
  │    └─ governed Work Assets → Shared Work Environment
  └─ 数据库 / API / 网页 / 用户输入 / 工具结果
                 ↓ Agent 发现、检索、判断、选择、组织、压缩
             Task Context
                 ↓ 当前调用的有限投影
             Context Window
```

Buildr 主要建设 Task Context 所依赖的长期资产基础与共享工作环境。位于 Workspace 不等于被 Buildr 治理；Task 使用 Buildr 资产也不表示 Task 本身由 Buildr 接管。

## 领域与能力模块

- Workspace：Organization/root 范围、identity、资产治理和 runtime 投射入口。
- Project：业务事实、OpenSpec、capability/applicability context 和 Service 关系。
- Service：职责与代码/资产边界。
- Work Assets：工作事实与工作方法；Rules、Skills、Commands、Specs 等只是当前示例。
- Change：规范驱动的变更管理；Brief 提供人类入口，标准 artifacts 保持规范 authority。
- Task Record：正式 Task 的最小顶层事实；Task Manager 与 Local App 通过同一产品 Application 管理，closed v1 不保存任何专业阶段内容。
- Task Environment：正式 Task 的本机执行基础与环境 authority；唯一 Environment Receipt 保存实际执行根、ready/blocked probes、动态资源和 cleanup。它可以组合共享根或 Git worktree provider，但不是 Workspace、Agent runtime 或 Task Record。
- Task-scoped Change Reference Resolver：只在明确 Task context 中从 matching Environment candidate 或 retained Project 解析限定 Change；全局 Change 索引保持 retained-only。
- Task workflow：探索、规划、隔离实现、验证、集成和收尾的可组合专业动作。Task Environment、Development、Review、Verification、Git、Finish、Board 与 Retrospective 各自拥有专业事实，通过稳定 Task ID 关联。

## 产品边界

Buildr 负责长期治理、跨 Agent 复用、确定性状态变更、完整性保护、诊断和 evidence；Agent 负责理解、检索、选择、组织、推理和执行。具体 `rg`、SQL、API、语义检索或 MCP 是 Agent 可采用的工具，不是 Buildr Context 模型本身。
