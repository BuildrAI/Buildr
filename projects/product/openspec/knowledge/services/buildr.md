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

验证分为静态/package、unit、fast integration、active/archive lifecycle、browser integration 与完整 Candidate，并输出 identity-bound timing evidence。`buildr verification run --project <code> --level affected|candidate` 是普通 Workspace 和 Task Finish provider 共用的正式执行入口，随 npm `src/` runtime 发布，不依赖 checkout-only tests。Project 可在 `verification.yml` 登记 `isolated`、`namespaced`、`coordinated`、`external` 四类验证资源并由能力引用；多个 task verification 进程通过 Git common-dir 下的 Workspace 共享容量槽协调 `coordinated` 资源，租约以 task/environment/run/token 归属、heartbeat、expiry 和原子接管保护，等待、恢复与精确释放进入 `buildr.verification-run/v1` evidence。该机制只协调验证执行，不调度 Agent 或任务。

Product Candidate 额外执行 `concurrent-task-acceptance` 组合验收：在单一临时多仓 Workspace 创建两个真实 task environment，从不同 cwd 实际执行 receipt-bound CLI invocation 与正式 `verification run`，以就绪屏障并发启动随机端口 Local App 预览和可并行验证 worker，并核对共享容量等待与释放、非空 evidence identity、错误 preview owner 拒绝、运行中 runtime 阻止 worktree cleanup、`target-race` 正式恢复、异常子进程诊断、最终产品化归属清理和 retained doctor。该步骤使用本地临时 Git 与进程，不访问外部系统；任一组合阶段或清理证据缺失都会使 Candidate 失败，不能由字段形状、底层原语或单项测试通过推断整体验收通过。

Task Finish 是薄 Skill 加持久化执行引擎：`task finish actions|inspect|advance|resume|run|recover` 为每个逻辑任务保存独立 run、步骤状态、fingerprint、effects、evidence、失效依赖和 retry policy。语义冲突与状态无法证明只在输入 fingerprint 改变后恢复，重要集成冲突还接受绑定 block identity 的解决授权，formal assurance 失败只接受 repair authorization 与 typed recovery；普通 resume 或调用方 evidence 不能覆盖这些产品停止边界。计时分别保存 product execution、候选绑定的 verifier-reported execution、checkpoint wait 与 orchestration gap。版本化 action registry 覆盖全部标准 steps；OpenSpec `contract-convergence` 只执行一次 environment-local `buildr openspec converge`，消费 `passed|blocked|recovery-unprovable`，不理解 planner/validate/apply/confirm/archive 内部阶段。事务模块拆为 pure planner、projected validator、canonical applier、observer、receipt 与 orchestrator；正常路径只写 `.buildr/convergence-receipt.json`，以每个正式文件的 before/expected digest 恢复。`buildr openspec audit` 只读输出 before/expected/actual digest 与逐文件分类。delta 或 executable 变化会基于当前事实重新规划/验证，canonical 既不等于 before 也不等于 expected 时 fail closed。历史 v2 receipt 顶层缺少 plan identity 时，迁移器先核对旧 receipt/plan 的 delta identity，再要求同步 transitions 提供唯一且与自校验 plan 匹配的 identity；当前 delta 已变化时，它只接受 canonical 逐字保留旧 expected 前缀并从新 Requirement 开始追加的演进，再由 projected strict validation 后按当前事实重新规划。证明缺失、歧义、不匹配、旧内容改写、非 append-only 差异或混合状态保持 `recovery-unprovable`。旧 baseline/check/sync-plan/sync-apply 只保留带结构化弃用信息的兼容入口，并受零当前消费者门禁约束。checkpoint 子命令通过轻量 bootstrap 读写 run、终结归属 attempt并精确释放 lease，即使完整 OpenSpec domain 无法加载也能记录阻塞。verification、Git、worktree、asset-review 与 current-knowledge 的政策仍由各自 selected provider 拥有。

Action registry 还支持受限 `provider-executable`：只有 selected provider 拥有稳定产品 handler、完整结构化输入/effects/result contract 时，safe executor 才连续领取、执行、核验结果并记录 observation。Formal assurance 只接受 task environment 内的 Buildr bridge、已核验 package entry 或由受支持 Node 直接加载该 entry，并在固定位置核对 `verification run`，不能用任意 shell/prefix 冒充 registry handler。首批产品化边界包括正式 `verification run` 与 receipt-bound 默认 CLI 安装；结果字段缺失、runtime identity 漂移、Local App 安装、Git/语义冲突、资产人工决策和最终 environment 删除仍停止并 handoff。

integration-push 后的 `retained-convergence` 使用 retained Workspace root、retained checkout 的绝对 CLI、Agent 和完整 changed paths 生成确定性计划：始终运行 retained doctor，只有 Rules、Skills、Components、Commands、workspace targets 或相关 manifests 受影响时才 sync 并再次 doctor；CLI 与 Local App impact 只交给后续 `runtime-install` provider。缺少 authority 时零执行，未知路径进入 evidence 但不自动扩大副作用；失败只使本步骤、runtime-install 与 cleanup 下游恢复，不重复 Candidate、integration 或 push。

Retained impact 把 Buildr Service 的生产 `src/**/*.mjs`、CLI 入口和安装映射视为默认 CLI 影响，测试、文档与未知路径不自动扩大副作用；Local App 保持独立分类。`runtime-install` 重验 receipt-bound Node executable/major、retained CLI source 与 target identity，用同一 Node 完成安装前核对、安装和 post-install version check，不让 login shell PATH 覆盖已验证 runtime。

当前有效 evidence/effect 只投射步骤最后一次成功 completion identity 引用的记录；身份失效后历史仍可审计，但不会进入 checkpoint 或 completion receipt。Buildr 自动执行的 attempt 以 token-bound command/stage observation 计算 execution duration，claim/complete 间隔中的其余部分单列为 orchestration；外部 formal assurance 的 passed completion 只接受候选身份匹配的 passed `buildr.verification-timing/v1` summary，blocked completion 只接受匹配的 failed/incomplete summary并保持 repair decision required。可信 summary 时长单列为 provider execution、从 orchestration gap 扣除且不进入 unobserved intervals，其他没有产品 observation 的外部 provider 才标为 unobserved。OpenSpec candidate audit 相对目标基线叠加 committed、staged、unstaged 与 untracked 差异，并只接受当前候选中 digest 匹配的受支持 convergence receipt。已解决故障会退出 current diagnostic，完整历史仍由 observation ledger 引用。

task environment 合并后，主 Workspace runtime 仍从 retained checkout sync/doctor；未合并 task checkout 不更新主 runtime，adoption receipt 随 environment 安全清理。

## 局部术语

本 Service 当前不重定义 Project glossary。CLI、runtime adapter、Component、provider、consumer 和 binding 继续使用 [Project canonical terminology](../glossary.md) 及相关 specs 的精确定义。
