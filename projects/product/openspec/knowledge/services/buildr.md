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
- Task environment 使用本机 environment receipt、repository membership/identity、allowed roots、明确 target/workdir 与 receipt-bound CLI/runtime projection 建立 execution binding。CLI binding 同时保存源码身份和结构化绝对 invocation；自举 workspace 的 invocation 指向 task checkout 内已有 Node-aware bridge，普通消费 workspace 使用已声明的 external-product Node/entry，不假设产品位于 Workspace 固定目录。Agent 和标准消费者只追加子命令参数，不再根据 cwd 或 `cliSource` 拼入口。
- 普通 Rule/Skill 内容修改不要求新 session、reload、re-enter 或 activation evidence；发布资产已投射到 Agent runtime。`worktree adopt` 仅在任务修改 runtime 的发现、加载或激活机制，且专项验收明确要求真实 Agent host activation proof 时保存同时匹配 session root 与 handle 的 `agent-attested` evidence，Buildr 不内省或自动 handoff Agent host。

## 运行与验证

Service 使用 Node.js ESM，开发依赖通过 lockfile 与 `npm ci` 收敛。开发 checkout 的 `projects/product/buildr` 会优先使用显式 `BUILDR_NODE`，否则从 PATH 和 Agent runtime 相邻的 bundled 位置选择 Node 20+；找不到兼容 runtime 时会提示最低版本以及 override/PATH 恢复动作。npm 安装入口继续由 package `engines.node` 约束。

验证分为静态/package、unit、fast integration、active/archive lifecycle、browser integration 与完整 Candidate，并输出 identity-bound timing evidence。

Task Finish 是薄 Skill 加持久化执行引擎：`task finish actions|inspect|advance|resume|run|recover` 为每个逻辑任务保存独立 run、步骤状态、fingerprint、effects、evidence、失效依赖和 retry policy。版本化 action registry 覆盖全部标准 steps：`product-executable` entry 消费 task environment 已核验的 `cliInvocation`，以绝对 command、固定 args prefix、cwd、动作参数、effects、结果断言和 evidence projection生成计划并由safe executor执行；历史 caller 可暂时显式提供可执行 `cliSource`，但 Registry 不再从 Workspace root 猜默认产品路径。`agent-provider` entry返回 capability/action/evidence handoff而不要求Agent猜命令；只有registry miss、匹配歧义或登记外语义分支返回`agent-reasoning-required`。显式execution plans仅作为兼容或登记外恢复入口，并标记`caller-supplied`。typed recovery一次消费before/after identities与transition proof，原子终结失效attempt/lease并由safe executor推进到formal assurance或真实边界；未知变化fail closed。formal assurance失败返回绑定failure identity的repair decision并停止，普通“收尾”不授权静默修复；只有task/change、failure identity与changed-path scopes全部匹配的版本化repair authorization才能进入re-verification。run-local observation ledger记录Buildr-owned command/stage/recovery的raw bytes与timing，compact failure先呈现primary failed check，再列warnings；completion分别计量initial verification、repair、re-verification、最后有效assurance后的closeout-only及end-to-end wall-clock，并声明可观察coverage。delivery convergence 后才请求 final assurance；失败只恢复 blocked/stale 下游，已成功 push 不因 cleanup 失败而重复。多个 run 不使用 Workspace 全局锁，只对真实共享资源使用短 lease，目标 ref 通过乐观并发 observation 检测竞态。verification registry可为候选owner声明无共享副作用且有预算的路径感知preflight，失败时完整affected/Candidate不启动。OpenSpec convergence执行时解析绝对executable，但持久化receipt只保存portable source reference、version与content identity。verification、Git、worktree、asset-review 与 current-knowledge 的政策仍由各自 selected provider 拥有。

task environment 合并后，主 Workspace runtime 仍从 retained checkout sync/doctor；未合并 task checkout 不更新主 runtime，adoption receipt 随 environment 安全清理。

## 局部术语

本 Service 当前不重定义 Project glossary。CLI、runtime adapter、Component、provider、consumer 和 binding 继续使用 [Project canonical terminology](../glossary.md) 及相关 specs 的精确定义。
