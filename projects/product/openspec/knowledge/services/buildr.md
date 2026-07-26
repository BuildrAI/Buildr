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
- Task environment 使用本机 environment receipt、repository membership/identity、allowed roots、明确 target/workdir 与 receipt-bound CLI/runtime projection 建立 execution binding。自举 workspace 绑定 environment-local 产品 CLI；普通消费 workspace 可以绑定 external-product CLI，但 source kind、path 与 identity 必须和 receipt 一致。Agent 可在从 canonical Workspace 启动的原对话中操作该 environment。
- 普通 Rule/Skill 内容修改不要求新 session、reload、re-enter 或 activation evidence；发布资产已投射到 Agent runtime。`worktree adopt` 仅在任务修改 runtime 的发现、加载或激活机制，且专项验收明确要求真实 Agent host activation proof 时保存同时匹配 session root 与 handle 的 `agent-attested` evidence，Buildr 不内省或自动 handoff Agent host。

## 运行与验证

Service 使用 Node.js ESM，开发依赖通过 lockfile 与 `npm ci` 收敛。开发 checkout 的 `projects/product/buildr` 会优先使用显式 `BUILDR_NODE`，否则从 PATH 和 Agent runtime 相邻的 bundled 位置选择 Node 20+；找不到兼容 runtime 时会提示最低版本以及 override/PATH 恢复动作。npm 安装入口继续由 package `engines.node` 约束。

验证分为静态/package、unit、fast integration、active/archive lifecycle、browser integration 与完整 Candidate，并输出 identity-bound timing evidence。

Task Finish 是薄 Skill 加持久化执行引擎：`task finish inspect|advance|resume|run|recover` 为每个逻辑任务保存独立 run、步骤状态、fingerprint、effects、evidence、失效依赖和 retry policy。typed recovery一次消费before/after identities与transition proof，原子终结失效attempt/lease并由safe executor推进到formal assurance或真实边界；未知变化fail closed。run-local observation ledger记录Buildr-owned command/stage/recovery的raw bytes与timing，compact failure保留结构化child diagnostic，completion明确声明可观察coverage。delivery convergence 后才请求 final assurance；失败只恢复 blocked/stale 下游，已成功 push 不因 cleanup 失败而重复。多个 run 不使用 Workspace 全局锁，只对真实共享资源使用短 lease，目标 ref 通过乐观并发 observation 检测竞态。verification、Git、worktree、asset-review 与 current-knowledge 的政策仍由各自 selected provider 拥有。

task environment 合并后，主 Workspace runtime 仍从 retained checkout sync/doctor；未合并 task checkout 不更新主 runtime，adoption receipt 随 environment 安全清理。

## 局部术语

本 Service 当前不重定义 Project glossary。CLI、runtime adapter、Component、provider、consumer 和 binding 继续使用 [Project canonical terminology](../glossary.md) 及相关 specs 的精确定义。
