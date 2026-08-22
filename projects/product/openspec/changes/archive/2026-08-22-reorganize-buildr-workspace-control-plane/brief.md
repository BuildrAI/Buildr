# Workspace Control Plane 模块边界收敛

## 一句话摘要

把 Workspace、Agent Assets 与产品资源技术能力从全局残留收敛为唯一、可查询、可验证的模块 owner，同时保持现有 Buildr 工作区治理行为不变。

## 背景与问题

第一轮迁移已经建立 `workspace/` 与 `agent-assets/`，但 `src/application/domains/package-assets.mjs` 和 `src/application/workspace-operations.mjs` 仍承担生产职责并由 Bootstrap 直接注册。它们使 Package Assets、Workspace Operations 与产品资源解析的 owner 不透明，也让后续 Task Execution 只能依赖全局 runtime 方法。

## 目标与非目标

目标是完成 Workspace Control Plane 的 owner 迁移、窄 Query 入口、Bootstrap 组合收敛、旧路径清理及相应结构/行为验证。非目标包括 Task/Verification、HTTP、Release Version、Internal Workflow Routes、Public JSON Contract 与完整 HTTP contract system。

## 受影响角色与流程

受影响的是维护 Buildr workspace、package、runtime projection、Project/Service declaration 和 Doctor 的 Agent/开发者。主要流程为 `init`、`package check/build`、`sync`、`render`、mutation recovery、Project/Service registry 查询与后续 Task 查询。

## 关键变化

- Workspace owner 负责 workspace/project/service registry、onboarding、mutation recovery 与 declaration intake 编排。
- Agent Assets owner 负责 package maintenance 与 runtime projection。
- Infrastructure product-resources 负责 manifest/resource path/enumeration 技术机制。
- Bootstrap 不再直接注册旧全局模块。

## 影响、风险与兼容性

代码路径和架构台账会变化；公开 CLI、HTTP、JSON、SQLite、Doctor、Environment 和安全边界保持兼容。主要风险是遗漏注册点、相对资源路径漂移和 facade 形成双 writer，分别由 inventory、回归测试和旧路径静态检查缓解。

## 验收摘要

OpenSpec strict、convergence preflight、架构 contract、package/workspace/Doctor/affected tests 全部通过；旧路径无生产引用，后续 Task 可通过窄 Workspace/Project Query 读取所需事实。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/workspace-control-plane-module-architecture/spec.md`
- `tasks.md`
