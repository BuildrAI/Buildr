# Agent Assets 平台迁移

## 一句话摘要

把 Buildr 的 Agent 工作资产管理、Component/Builtin 生命周期和 Agent runtime 投射一次迁入独立 `agent-assets` 模块，同时保持现有产品行为、数据与 authority 不变。

## 背景与问题

Rule、Skill、Command、Component、Builtin、Capability Binding 和 runtime projection 共同构成 Agent Assets 平台，但当前实现分散在通用 Application、全局 Infrastructure 和 Bootstrap legacy registrations 中。Workspace Core、Infrastructure 和 Bootstrap 基础完成后，继续分散会让源资产与投射边界、组件原子性和模块 ownership 难以维护。

## 目标

- 建立完整 `src/agent-assets/` 模块和唯一公开组装入口。
- 一次迁移资产 Application、Builtin/package maintenance、runtime adapter、render/sync/projection/receipt。
- 更新所有 imports、测试、发布物消费者和服务架构文档。
- 保持 CLI、HTTP、JSON、manifest、Component transaction、投射冲突与清理语义等价。

## 非目标

- 不改变任何 Agent Assets 产品行为或公开契约。
- 不合并 Workspace 源资产、Builtin source 与 runtime projection writer。
- 不决定产品入口 `buildr` Skill、Workspace Builtin 与 package runtime source 的长期合并关系。
- 不迁移 Change、OpenSpec、Publication、Project Verification 或通用 Infrastructure。

## 受影响用户或角色

Buildr CLI 和 Buildr Web 使用者不感知公开行为变化；主要受益者是维护 Agent Assets、Bootstrap、Doctor、验证与发布物的 Buildr 开发者，他们可以从单一模块入口定位并验证完整资产平台。

## 核心流程

Workspace 源资产继续由 Rule、Skill、Command 和 Component Application 管理；render/sync 根据明确 Agent adapter 生成计划，统一完成冲突预检后写入 Agent 原生目标，并以 matching receipt 管理后续幂等更新和安全清理。Bootstrap 只安装一次 Agent Assets 模块，公共 CLI Host 消费模块 command contributions。

## 关键变化

生产实现进入 `agent-assets/application` 与 `agent-assets/infrastructure/runtime`，Bootstrap 通过 `agent-assets/module.mjs` 安装整个平台；旧 `application/domains`、`application/package-maintenance*`、`application/runtime.mjs` 和 `infrastructure/runtime` 中已迁移实现退出。复杂的 package maintenance 与 runtime Skill projection 保留真实私有子目录。

## 影响、风险与兼容性

本次涉及较多文件移动，主要风险是遗漏动态 import、Application Payload 或测试消费者。迁移采用移动优先策略，并通过全仓旧路径扫描、模块装配、runtime/asset focused tests、Application Payload 与 npm candidate 验证控制风险。不涉及 schema、数据 migration、外部状态或破坏性变更。

## 验收摘要

- Agent Assets 全部计划职责可从新模块定位，Bootstrap 恰好安装一次。
- 旧生产路径没有第二套实现或残留 import。
- Rule、Skill、Command、Component、Builtin、Capability Binding 和 runtime projection 行为等价。
- 服务架构文档展示实际结构和迁移状态。
- OpenSpec strict、结构验证和适用发布物验证通过。

## 技术 Artifacts

- `proposal.md`
- `design.md`
- `specs/agent-assets-module-architecture/spec.md`
- `tasks.md`
