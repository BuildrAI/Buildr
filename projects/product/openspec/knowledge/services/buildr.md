# Buildr Service

## 职责

Buildr Service 是 Product Project 的可执行应用实现，负责 CLI、Workspace/Project/Service domain、Local App、runtime adapters、受管资产与 Component 生命周期、capability graph、验证编排、package 和发布。

## 接口与入口

- CLI：`projects/product/buildr`（开发 checkout）及 npm `buildr` 命令。
- Local App：loopback HTTP 与浏览器界面；Workspace 是全局目录，Project、Service、Change 使用稳定详情路由。
- Package：`services/buildr/package/manifest.yml` 定义发布边界、workspace/project baseline、builtins、contracts、bindings 和 Components。

## 数据与依赖

- Workspace/Project/Service、Rules、Skills、Commands 和 Components 使用 YAML manifests/registries。
- OpenSpec 依赖 `@fission-ai/openspec` 1.6.0；Buildr 补充跨 Change conflict evidence、文件事实驱动的确定性收敛事务和 runtime contributions。历史 baseline/阶段 sidecar 只作兼容诊断。
- Local App Change read model 从 Project canonical planning root 只读索引 active/archive artifacts；Brief 是 Buildr companion，不改变 OpenSpec schema。
- Task environment 使用本机 environment receipt、repository membership/identity、allowed roots、明确 target/workdir 与 receipt-bound CLI/runtime projection 建立 execution binding。CLI binding 同时保存源码身份和结构化绝对 invocation；自举 workspace 的 invocation 指向 task checkout 内已有 Node-aware bridge，普通消费 workspace 使用已声明的 external-product Node/entry，不假设产品位于 Workspace 固定目录。Agent 和标准消费者只追加子命令参数，不再根据 cwd 或 `cliSource` 拼入口。
- 普通 Rule/Skill 内容修改不要求新 session、reload、re-enter 或 activation evidence；发布资产已投射到 Agent runtime。`worktree adopt` 仅在任务修改 runtime 的发现、加载或激活机制，且专项验收明确要求真实 Agent host activation proof 时保存同时匹配 session root 与 handle 的 `agent-attested` evidence，Buildr 不内省或自动 handoff Agent host。

## 运行与验证

Service 使用 Node.js ESM，开发依赖通过 lockfile 与 `npm ci` 收敛。开发 checkout 的 `projects/product/buildr` 会优先使用显式 `BUILDR_NODE`，否则从 PATH 和 Agent runtime 相邻的 bundled 位置选择 Node 20+；找不到兼容 runtime 时会提示最低版本以及 override/PATH 恢复动作。npm 安装入口继续由 package `engines.node` 约束。

验证分为静态/package、unit、fast integration、active/archive lifecycle、browser integration 与完整 Candidate，并输出 identity-bound timing evidence。Project 可在 `verification.yml` 登记 `isolated`、`namespaced`、`coordinated`、`external` 四类验证资源并由能力引用；多个 task verification 进程通过 Git common-dir 下的 Workspace 共享容量槽协调 `coordinated` 资源，租约以 task/run/token 归属、heartbeat、expiry 和原子接管保护，等待、恢复与精确释放进入 timing evidence。该机制只协调验证执行，不调度 Agent 或任务。

Product Candidate 额外执行 `concurrent-task-acceptance` 组合验收：在单一临时多仓 Workspace 创建两个真实 task environment，从不同 cwd 实际执行 receipt-bound CLI invocation，以就绪屏障并发启动随机端口 Local App 预览和可并行验证 worker，并核对共享容量等待与释放、`target-race` 正式恢复、异常子进程诊断、产品化归属清理和 retained doctor。该步骤使用本地临时 Git 与进程，不访问外部系统；任一组合阶段或清理证据缺失都会使 Candidate 失败，不能由字段形状、底层原语或单项测试通过推断整体验收通过。

Task Finish 是薄 Skill 加持久化执行引擎：`task finish actions|inspect|advance|resume|run|recover` 为每个逻辑任务保存独立 run、步骤状态、fingerprint、effects、evidence、失效依赖和 retry policy。语义冲突与状态无法证明只在输入 fingerprint 改变后恢复，重要集成冲突还接受绑定 block identity 的解决授权，formal assurance 失败只接受 repair authorization 与 typed recovery；普通 resume 或调用方 evidence 不能覆盖这些产品停止边界。计时分别保存 product execution、候选绑定的 verifier-reported execution、checkpoint wait 与 orchestration gap。版本化 action registry 覆盖全部标准 steps；OpenSpec `contract-convergence` 只执行一次 environment-local `buildr openspec converge`，消费 `passed|blocked|recovery-unprovable`，不理解 planner/validate/apply/confirm/archive 内部阶段。事务模块拆为 pure planner、projected validator、canonical applier、observer、receipt 与 orchestrator；正常路径只写 `.buildr/convergence-receipt.json`，以每个正式文件的 before/expected digest 恢复。`buildr openspec audit` 只读输出 before/expected/actual digest 与逐文件分类。delta 或 executable 变化会基于当前事实重新规划/验证，canonical 既不等于 before 也不等于 expected 时 fail closed。旧 baseline/check/sync-plan/sync-apply 只保留带结构化弃用信息的兼容入口，并受零当前消费者门禁约束。checkpoint 子命令通过轻量 bootstrap 读写 run、终结归属 attempt并精确释放 lease，即使完整 OpenSpec domain 无法加载也能记录阻塞。verification、Git、worktree、asset-review 与 current-knowledge 的政策仍由各自 selected provider 拥有。

integration-push 后的 `retained-convergence` 使用 retained Workspace root、retained checkout 的绝对 CLI、Agent 和完整 changed paths 生成确定性计划：始终运行 retained doctor，只有 Rules、Skills、Components、Commands、workspace targets 或相关 manifests 受影响时才 sync 并再次 doctor；CLI 与 Local App impact 只交给后续 `runtime-install` provider。缺少 authority 时零执行，未知路径进入 evidence 但不自动扩大副作用；失败只使本步骤、runtime-install 与 cleanup 下游恢复，不重复 Candidate、integration 或 push。

task environment 合并后，主 Workspace runtime 仍从 retained checkout sync/doctor；未合并 task checkout 不更新主 runtime，adoption receipt 随 environment 安全清理。

## 局部术语

本 Service 当前不重定义 Project glossary。CLI、runtime adapter、Component、provider、consumer 和 binding 继续使用 [Project canonical terminology](../glossary.md) 及相关 specs 的精确定义。
