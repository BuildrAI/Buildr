## Context

Agent Assets 的业务入口目前由 `application/domains`、`application/runtime.mjs` 和 `application/package-maintenance*` 注册，runtime adapter、Capability Binding、Skill source assembly、render plan 与 receipt 技术实现则位于全局 `infrastructure/runtime`。这些职责共同维护 Workspace 源资产、Component 集合级事务和 Agent runtime 可重建投射，但在 Bootstrap 中仍以多个 legacy registration 直接装配。

Workspace Core 已迁入 `workspace/`，全局 Infrastructure 也已收敛为不理解业务语义的技术机制。本变更需要把 Agent Assets 的业务语义与专属 runtime 技术适配迁入同一一级模块，同时保持现有行为、数据格式、投射文件和兼容方法不变。

## Goals / Non-Goals

**Goals:**

- 建立完整 `src/agent-assets/` 一级模块，并由唯一 `module.mjs` 向 Bootstrap 提供显式装配入口。
- 一次迁移 Rule、Skill、Command、Component、Builtin、Capability Binding、Runtime Adapter、render、sync、projection 和 receipt 的现有生产职责。
- 保持 Workspace 源资产、Component lifecycle、runtime projection 与产品 Builtin 的不同 authority，不因物理归档合并 writer。
- 删除已迁移职责在通用 `application`、全局 `infrastructure/runtime` 和 `legacy-runtime-module` 中的旧入口。
- 原子更新 imports、测试、Application Payload、Doctor/Verification 消费路径和服务架构文档。

**Non-Goals:**

- 不改变 Rule、Skill、Command、Component、Builtin 或 Capability Binding 的公开产品语义。
- 不重新设计 runtime adapter trait、render plan、receipt、冲突处理或清理算法。
- 不决定产品入口 `buildr` Skill、Workspace Builtin 与 package runtime source 的合并或删除方案。
- 不把 Change、OpenSpec、Publication、Project Verification 或通用文件/进程机制迁入 Agent Assets。
- 不修改 React/Vite 前端源码、公开 HTTP 契约、manifest schema 或 Workspace 数据。

## Decisions

### 1. 以一个 Agent Assets 模块承接完整依赖闭环

Rule、Skill、Command、Component、Builtin 和 projection 共享 manifest 解析、Component ownership、source transaction、runtime source assembly、投射冲突和 receipt 清理边界。本变更将它们作为一个 Child 一次迁移，避免拆分期间出现第二套跨目录 facade。

备选方案是按资产类型拆成多个 Child；该方案会让 Component、Builtin 和 projection 在多个版本间同时依赖旧入口与新入口，增加临时组装和重复验证，因此不采用。

### 2. 模块内部按技术职责组织，保留真实复杂子目录

目标结构为：

```text
agent-assets/
  application/
    rules.mjs
    skills.mjs
    commands.mjs
    components.mjs
    runtime.mjs
    runtime-projection.mjs
    package-maintenance.mjs
    package-maintenance/
  infrastructure/
    runtime/
  interfaces/
    cli/
  module.mjs
```

默认使用扁平技术层；`application/package-maintenance/` 与 `infrastructure/runtime/skills/` 已有多个私有协作者和明确维护边界，继续保留真实复杂子目录。`interfaces/cli/` 持有模块专属 command contributions；不会为了目录对称创建空 Domain、Persistence 或 HTTP Interfaces 层。

### 3. Bootstrap 只安装模块公开入口

`agent-assets/module.mjs` 负责按既有顺序安装 Agent Assets registrations，并向迁移期 runtime 暴露同名兼容方法。`bootstrap/runtime.mjs` 显式安装该模块，`legacy-runtime-module.mjs` 删除对应直接 imports 和 registrations。

备选方案是在 legacy runtime 中继续从新路径逐个 import；这只改变路径而没有建立模块边界，因此不采用。

### 4. 源资产与投射结果继续保持分离 authority

物理代码进入同一模块不改变事实所有权：Rules/Skills/Commands/Components manifests 和内容仍是 Workspace 源资产；`.buildr/agent-runtime` receipt 与 Agent 原生目录仍是本机可重建投射；Commands 仍只声明和检查；Component 仍是组合生命周期 owner；全局 Infrastructure 只提供文件、进程、网络和事务等通用机制。

### 5. 采用移动优先的行为保持策略

生产实现优先以 Git 可追踪的文件移动和 import 更新完成，不在结构迁移中重写大型算法。只有模块公开入口、Bootstrap 装配和架构验证需要新增代码。这样可以把行为差异风险限制在解析路径与装配顺序。

## Risks / Trade-offs

- [Risk] 一次移动约一万行 runtime/asset 实现，遗漏动态路径或发布物消费者会导致候选包失败。→ 使用全仓旧路径扫描、Application Payload/npm candidate 验证和架构测试共同约束。
- [Risk] Registration 顺序变化可能影响 runtime 方法依赖。→ `agent-assets/module.mjs` 保留当前内部注册顺序，并在 Bootstrap 模块测试中断言唯一安装和公开 capability。
- [Risk] Doctor 与其他模块直接 import 旧 runtime 路径。→ 原子更新全部生产、测试、工具和验证 imports，最终禁止旧生产路径残留。
- [Risk] 大 Child 验证成本较高。→ 实现分为资产应用层、runtime infrastructure、Bootstrap/消费者、文档四个阶段，每阶段运行 focused checks，最终执行正式 affected/full 能力。

## Migration Plan

1. 建立 `agent-assets` 模块入口和架构测试，明确保留的兼容方法集合与注册顺序。
2. 移动资产 Application、Builtin/package maintenance 与 runtime projection 实现，更新内部相对 imports。
3. 移动专属 runtime infrastructure 和 Skill projection collaborators，更新全仓消费者。
4. 由 Bootstrap 显式安装 Agent Assets 模块，退出 legacy direct registrations，更新 CLI/HTTP/Doctor/Verification 与发布物消费者。
5. 更新服务架构文档为实际结构与已迁移状态，清理旧路径并完成全量验证。

若迁移失败，回滚整个 Child commit 即可恢复原路径；不涉及数据 migration、双写或外部状态转换。

## Open Questions

无。产品入口 `buildr` Skill、Workspace Builtin 与 package runtime source 的长期合并关系继续由后续独立产品任务决定。
