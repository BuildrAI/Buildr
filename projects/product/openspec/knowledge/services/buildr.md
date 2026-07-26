# Buildr Service

## 职责

Buildr Service 是 Product Project 的可执行应用实现，负责 CLI、Workspace/Project/Service domain、Local App、runtime adapters、受管资产与 Component 生命周期、capability graph、验证编排、package 和发布。

## 接口与入口

- CLI：`projects/product/buildr`（开发 checkout）及 npm `buildr` 命令。
- Local App：loopback HTTP 与浏览器界面；Workspace 是全局目录，Project、Service、Change 使用稳定详情路由。
- Package：`services/buildr/package/manifest.yml` 定义发布边界、workspace/project baseline、builtins、contracts、bindings 和 Components。

## 数据与依赖

- Workspace/Project/Service、Rules、Skills、Commands 和 Components 使用 YAML manifests/registries。
- OpenSpec 依赖 `@fission-ai/openspec` 1.6.0；Buildr 只补充跨 Change baseline/conflict evidence 和 runtime contributions。
- Local App Change read model 从 Project canonical planning root 只读索引 active/archive artifacts；Brief 是 Buildr companion，不改变 OpenSpec schema。
- Task environment 使用本机 environment/adoption receipts 绑定 repository plan、checkout-local runtime projection 与 Agent session handoff。`worktree adopt` 校验 environment/runtime identity，并把 host-visible session root/handle 保存为 `agent-attested` evidence；Buildr 不接入 Agent 私有 session，也不把工具 `cwd` 当作 Skills 已加载证明。

## 运行与验证

Service 使用 Node.js ESM，开发依赖通过 lockfile 与 `npm ci` 收敛。开发 checkout 的 `projects/product/buildr` 会优先使用显式 `BUILDR_NODE`，否则从 PATH 和 Agent runtime 相邻的 bundled 位置选择 Node 20+；找不到兼容 runtime 时会提示最低版本以及 override/PATH 恢复动作。npm 安装入口继续由 package `engines.node` 约束。

验证分为静态/package、unit、fast integration、active/archive lifecycle、browser integration 与完整 Candidate，并输出 identity-bound timing evidence。

Task Finish 是三阶段编排 provider：先完成 delivery convergence，再请求 final assurance，最后只允许有独立 diff/evidence 的 closeout-only delivery。它通过隔离 archive rehearsal 提前检查 OpenSpec archive compatibility，通过目标 ref observation 检测 Candidate 后竞态；真实 rebase、冲突修复或 runtime 内容变化会使旧 evidence 失效并触发同级重跑。task-verification provider 对 archive-sensitive 任务选择 Project 声明的 active/archive capability，并用 `supersedesEvidence`、`invalidationReason` 和 `supersessionRelationship` 表达重复验证链。

task environment 合并后，主 Workspace runtime 仍从 retained checkout sync/doctor；未合并 task checkout 不更新主 runtime，adoption receipt 随 environment 安全清理。

## 局部术语

本 Service 当前不重定义 Project glossary。CLI、runtime adapter、Component、provider、consumer 和 binding 继续使用 [Project canonical terminology](../glossary.md) 及相关 specs 的精确定义。
