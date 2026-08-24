# Workspace Control Plane 模块边界收敛

## Why

第一轮 Service 架构迁移后，Workspace、Package Assets、Workspace Operations 与 Project/Service 声明相关能力仍有全局 Application/Domain 残留，导致 Bootstrap 组装、跨模块调用和后续 Task Execution 依赖边界不够清晰。现在先收敛控制面 owner，才能让后续 Task/Verification Child 通过稳定窄入口协作，同时保持现有工作区治理、投影、同步、Doctor 与环境准备行为不变。

## What Changes

- 将 Workspace/Project/Service registry、onboarding、mutation journal/recovery 与声明 intake 的编排归入 `workspace` owner。
- 将 Builtin/Component/Skill/Command package maintenance 与 runtime projection 相关编排归入 `agent-assets` owner。
- 将产品 manifest、随包资源读取、资源路径映射和枚举复制等通用产品资源机制归入 Infrastructure product-resources。
- 保留通用 filesystem、Git、process、atomic write 与 SQLite 等技术机制在 Infrastructure，并由 Bootstrap 负责显式组合。
- 移除旧的 `Package Assets`、`Workspace Operations` 全局模块入口及其直接 Bootstrap 注册，改由明确 owner 的 Application/module 入口承接既有公开 CLI 行为。
- 为后续 Task Execution/Verification 提供稳定、只读且窄的 Workspace/Project Query 入口。
- 不改变 `init`、mutation recovery、`package check/build`、`sync`、`render`、Doctor、Environment Receipt、writer authority、投影安全边界或公开错误/JSON 行为。

## Capabilities

### New Capabilities

- `workspace-control-plane-module-architecture`: 定义 Workspace、Agent Assets 与产品资源 Infrastructure 的模块 owner、协作入口和行为等价约束。

### Modified Capabilities

无。现有 package、workspace、declaration、environment 和 infrastructure 规范的业务要求保持不变，本 Change 只增加结构归属与可验证的架构约束。

## Impact

- 主要影响 `projects/product/services/buildr/src/workspace/`、`src/agent-assets/`、`src/infrastructure/`、Bootstrap 注册与 CLI 组装。
- 需要迁移或删除 `src/application/domains/package-assets.mjs`、`src/application/workspace-operations.mjs` 等旧路径，并更新静态架构检查、单元/组件测试和产品级 package/workspace 验证入口。
- 不新增运行时依赖，不改变 Public JSON Contract、HTTP、Task Application Service 或 Verification Result 的职责范围。
