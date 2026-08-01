# Buildr Service

## 职责

Buildr Service 是 Product Project 的可执行应用实现，负责 CLI、Workspace/Project/Service/Task Record domain、Local App、runtime adapters、受管资产与 Component 生命周期、capability graph、验证编排、package 和发布。

## 接口与入口

- CLI：`projects/product/buildr`（开发 checkout）及 npm `buildr` 命令。
- Local App：loopback HTTP 与浏览器界面；Workspace 是全局目录，Project、Service、Task Record、Change 使用稳定详情路由，Task Record 提供受控管理动作。
- Package：`services/buildr/package/manifest.yml` 定义发布边界、workspace/project baseline、builtins、contracts、bindings 和 Components。

## 数据与依赖

- Workspace/Project/Service、Rules、Skills、Commands 和 Components 使用 YAML manifests/registries。
- Task Record 使用 canonical `.buildr/tasks/<task-id>/task.yml` 与 closed `buildr.task-record/v1` schema；repository 只拥有该文件，按 Git topology 拒绝 linked-worktree authority，并保留同目录其他专业模块文件。Task Record 只保存最小顶层事实，不保存 Task Environment 或其他专业模块字段。
- OpenSpec 依赖 `@fission-ai/openspec` 1.6.0；Buildr 补充跨 Change conflict evidence、文件事实驱动的确定性收敛事务和 runtime contributions。历史 baseline/阶段 sidecar 只作兼容诊断。
- Local App Task API 先把已登记 `workspaceId` 解析为 canonical root，再调用 Task Record Application；mutation 复用 same-origin、session、JSON、body limit、字段白名单和路径拒绝边界，并用响应级 `recordDigest` 拒绝陈旧页面。Change read model 继续从 Project canonical planning root 只读索引 active/archive artifacts；Brief 是 Buildr companion，不改变 OpenSpec schema。
- Task environment 使用本机 environment receipt、repository membership/identity、allowed roots、明确 target/workdir 与 receipt-bound CLI/runtime projection 建立 execution binding。CLI binding 同时保存源码身份和结构化绝对 invocation；自举 workspace 的 invocation 指向 task checkout 内已有 Node-aware bridge，普通消费 workspace 使用已声明的 external-product Node/entry，不假设产品位于 Workspace 固定目录。Agent 和标准消费者只追加子命令参数，不再根据 cwd 或 `cliSource` 拼入口。
- 普通 Rule/Skill 内容修改不要求新 session、reload、re-enter 或 activation evidence；发布资产已投射到 Agent runtime。`worktree adopt` 仅在任务修改 runtime 的发现、加载或激活机制，且专项验收明确要求真实 Agent host activation proof 时保存同时匹配 session root 与 handle 的 `agent-attested` evidence，Buildr 不内省或自动 handoff Agent host。

Workspace Node identity 进入 task environment receipt/context 与 `executionReady`，并绑定 verification evidence、Finish frozen candidate、resume token 与 reuse 判断。Agent runtime 只能消费该 identity，不能选择或保存 Node version；验证 executor 为 node、npm、测试和子进程统一注入受管环境，freeze、verify、resume 或 deliver 前发现漂移时终止。

## 运行与验证

Task Record 的 Domain/Application/filesystem repository 构成单一 writer；独立 CLI interface 公开 `task create|inspect|update|complete|abandon`，Local App 提供列表、详情、创建、编辑和明确终态确认，两者不直接编辑 YAML。随包 `task-manager` Skill 提供并默认绑定 `buildr.task-record/v1`，`task-triage` 在正式持久交付首次写入前 optional 消费；Task Environment、Development、Review、Verification、Git、Finish、Board 和 Retrospective 保留各自 authority。候选 Product checkout 可渲染自身 task worktree runtime，但产品会阻止它写入同一 Git common-dir 下的 retained 或 peer checkout。

Service 使用 Node.js ESM，开发依赖通过 lockfile 与 `npm ci` 收敛。Workspace 在 `.buildr/workspace.yml` 维护精确 `runtime.node.version`；`init` 采用当前受支持 CLI Node 并准备本机受管 runtime，`sync` 按声明恢复且不改版本，`doctor` 只读核对声明、Node/npm/CLI/验证环境并建议 `sync`。开发与安装入口的普通命令固定使用该 runtime；仅 `init`、`doctor`、`sync` 可在 runtime 缺失时使用兼容 bootstrap Node。npm package 的 `engines.node` 继续只表达产品兼容范围。

验证分为静态/package、unit、fast integration、active/archive lifecycle、browser integration 与完整 Candidate，并输出 identity-bound timing evidence。`buildr verification run --project <code> --level affected|candidate` 是普通 Workspace 和 Task Finish provider 共用的正式执行入口，随 npm `src/` runtime 发布，不依赖 checkout-only tests。Project 可在 `verification.yml` 登记 `isolated`、`namespaced`、`coordinated`、`external` 四类验证资源并由能力引用；多个 task verification 进程通过 Git common-dir 下的 Workspace 共享容量槽协调 `coordinated` 资源，租约以 task/environment/run/token 归属、heartbeat、expiry 和原子接管保护，等待、恢复与精确释放进入 `buildr.verification-run/v1` evidence。该机制只协调验证执行，不调度 Agent 或任务。

Product Candidate 额外执行 `concurrent-task-acceptance` 组合验收：在单一临时多仓 Workspace 创建两个真实 task environment，从不同 cwd 实际执行 receipt-bound CLI invocation 与正式 `verification run`，以就绪屏障并发启动随机端口 Local App 预览和可并行验证 worker，并核对共享容量等待与释放、非空 evidence identity、错误 preview owner 拒绝、运行中 runtime 阻止 worktree cleanup、`target-race` 正式恢复、异常子进程诊断、最终产品化归属清理和 retained doctor。该步骤使用本地临时 Git 与进程，不访问外部系统；任一组合阶段或清理证据缺失都会使 Candidate 失败，不能由字段形状、底层原语或单项测试通过推断整体验收通过。

Task Finish 是 `buildr.task-finish/v1` 的固定产品执行器。CLI 只公开 `task finish run|inspect`；首次 run 必须提供 Project，task identity 来自 receipt，提供 `--change` 时创建 `candidateKind: change`，省略时创建 `candidateKind: code-only`。两类候选都顺序执行 `preflight → prepare → verify → deliver → cleanup`。preflight 一次聚合 CLI probe、verification policy、Git/target 与 retained readiness；Change 候选还检查 Change tasks/knowledge 和 OpenSpec strict/pure plan，code-only 将这些专属检查稳定记录为 `not-applicable`，不会执行 OpenSpec 命令或推断虚假 Change。

prepare 只为 Change 候选调用 environment-local `openspec converge`，随后两类候选都执行 runtime sync、candidate commit、target fetch/rebase 与 fixed-point sync。冻结 identity 包含 task、candidate kind、可空 Change、HEAD/tree/target observation/changed paths 与 Workspace Node identity。verify 只复用 identity 与 assurance 完全匹配的通过证据，否则对冻结候选调用一次 `verification run`。任何产品缺陷、语义冲突或验证失败都以 `upstream-candidate-defect` 终止并返回 `task-development`；修复、审查返工和重新验证不属于 Finish，也不能通过 repair authorization 或 typed recovery 留在同一 run。

deliver 使用 target lease 与远端 ref observation，只允许 fast-forward 和普通 push；随后按 changed paths 执行 retained doctor、必要 runtime sync，以及使用 receipt-bound Node 的 CLI/Local App bundled runtime 安装与 version check。cleanup 从 retained checkout 写 durable completion、清理 transient verification evidence并调用 worktree cleanup。只有 target race、network、retained convergence/install 和 task-owned cleanup 等不改变候选语义的暂态条件可用产品生成的 resume token 恢复，且不重跑已通过阶段。

结果与 durable completion receipt 持久化 task、candidate kind、可空 Change、Workspace Node identity、五阶段输入/输出 identity、具体 primary failure、command cwd/exit/duration/有界输出 digest、verification/delivery/completion 与 CLI/Agent/recovery/formal 次数。正常路径只有一次 canonical CLI invocation、零 Agent/provider completion、零手写 recovery manifest、正式验证不超过一次。客户端直接使用唯一 canonical `runs`、`completed` 与 lease namespace，不创建版本化运行目录；旧 run shape 不可恢复。

retained canonical Workspace 中明确的 metadata-only 候选不进入产品执行器，因为无关 dirty state 无法形成隔离的 frozen candidate。Task Finish Skill 只有在任务 paths、当前验证 identity、目标 branch/remote 与 retained context 都可证明时，才把精确 commit 与 push 分别交接给 optional selected `buildr.git-single-operation/v1` provider；provider 只能 stage 任务 paths并保留无关改动，返回逐项 Git evidence 与 `completionMode: git-single-operation-handoff`。任一事实或 provider readiness 不可证明时正式 blocked，不使用 `git add -A`、stash、回滚、虚假 Change 或手写 Git 回退。

task environment 合并后，主 Workspace runtime 仍从 retained checkout sync/doctor；未合并 task checkout 不更新主 runtime，adoption receipt 随 environment 安全清理。

## 局部术语

本 Service 当前不重定义 Project glossary。CLI、runtime adapter、Component、provider、consumer 和 binding 继续使用 [Project canonical terminology](../glossary.md) 及相关 specs 的精确定义。
