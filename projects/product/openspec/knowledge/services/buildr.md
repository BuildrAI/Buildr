# Buildr Service

## 职责

Buildr Service 是 Product Project 的可执行应用实现，负责 CLI、Workspace/Project/Service/Task Record/Task Environment/Task Review/Task Verification domain、Project Testing 指导、Local App、runtime adapters、受管资产与 Component 生命周期、capability graph、验证执行、package 和发布。

## 接口与入口

- CLI：`projects/product/buildr`（开发 checkout）及 npm `buildr` 命令。
- Local App：loopback HTTP 与浏览器界面；Workspace 是全局目录，Project、Service、Task Record、Change 使用稳定详情路由。Task 详情提供独立只读“环境”“审查”“验证”页签及 Task-scoped Change route；Environment mutation 和 Review/Verification Result CRUD 都不进入 UI，专业动作只生成受限 Agent action。
- Package：`services/buildr/package/manifest.yml` 定义发布边界、workspace/project baseline、builtins、contracts、bindings 和 Components。

## 数据与依赖

- Workspace/Project/Service、Rules、Skills、Commands 和 Components 使用 YAML manifests/registries。
- Task Record 使用 canonical `.buildr/tasks/<task-id>/task.yml` 与 closed `buildr.task-record/v1` schema；repository 只拥有该文件，按 Git topology 拒绝 linked-worktree authority，并保留同目录其他专业模块文件。Task Record 只保存最小顶层事实，不保存 Task Environment 或其他专业模块字段。
- Task Review 使用 canonical `.buildr/tasks/<task-id>/reviews/planning.yml|completion.yml` 与统一 closed `buildr.task-review-result/v1` schema。两个 slot 可独立缺失；同类型完整替换、跨类型隔离，持久模型不含 revision、history、current、applicability 或 digest。Task Review Application 是唯一 writer，Task Record 与 Environment repositories 必须保留这些 sibling。
- Task Verification 使用 canonical `.buildr/tasks/<task-id>/verification.yml` 与 closed `buildr.task-verification-result/v1` schema。单一 current slot 绑定 opaque target identity 和由 Application 观察的 Project declaration identities；完整 Result 整值原子替换，读取时派生 `current / stale / unknown`。持久模型不含 execution stdout/stderr、Environment Receipt、revision/history、风险、推进决定或 Candidate generation。Task Verification Application 是唯一 writer/reader，其他 repositories 必须保留该 sibling。
- OpenSpec 依赖 `@fission-ai/openspec` 1.6.0；Buildr 补充跨 Change conflict evidence、文件事实驱动的确定性收敛事务和 runtime contributions。历史 baseline/阶段 sidecar 只作兼容诊断。
- Local App Task API 先把已登记 `workspaceId` 解析为 canonical root，再调用 Task Record Application；mutation 复用 same-origin、session、JSON、body limit、字段白名单和路径拒绝边界，并用响应级 `recordDigest` 拒绝陈旧页面。Environment、Review 与 Verification API 只调用各自 Application `inspect` 并使用 `no-store`；专业 endpoint 不接受任意 root/path，也没有直接 writer endpoint。Change 全局 collection 保持 retained-only，Task 关联详情通过共享 Resolver 从 matching Environment execution root 或 retained Project 读取。
- Environment Receipt 使用 closed `buildr.task-environment-receipt/v2`，只由 Task Environment Application 写入。它按 Task ID 保存 canonical Workspace、Task checkout/provider evidence、scope/execution/validation roots、Receipt 创建时的 controller 指纹、Runtime/CLI/依赖/projection probes、已登记动态资源和 cleanup summary。公开 read model 去除资源 handle、secret 与 controller CLI path；创建指纹不参与 ready、资源 ownership 或 Verification applicability。
- Git worktree provider 只在 Git common-dir 保存 `buildr.git-worktree-evidence/v1`，包含 repository plan、checkout/branch/HEAD/clean/registration 和 Git effects。`worktree create|inspect|cleanup` 不返回 Environment ready、Runtime/CLI/依赖、资源、恢复或总 cleanup 结论。
- 普通 Rule/Skill 内容修改不要求新 session、reload、re-enter 或 activation evidence。候选 CLI/runtime 可以在自身 Task Validation Workspace 验证；只有集成到 retained source 后正式 runtime 才同步生效。bounded Agent capability 必须由 Agent 形成事实，文件投射或 Environment ready 本身不等于验证通过；Result 不复制 Environment Receipt。

Workspace Node identity 进入 Environment Receipt 的 Runtime probe 与 execution binding，并绑定 transient verification execution、Finish frozen target、resume token 与 reuse 判断。Agent runtime 只能消费该 identity，不能选择或保存 Node version；验证 executor 为 node、npm、测试和子进程统一注入受管环境。portable Task Verification Result 只绑定调用方 target 和 Project declarations，不复制 Node/Environment 事实。

## 运行与验证

Task Record、Task Environment、Task Review 与 Task Verification 各自以 Domain/Application/filesystem repository 构成独立 writer，只共享 Task ID 和目录，不共享字段。独立 CLI interface 公开 `task environment prepare|inspect|cleanup`、`task review inspect|record` 与 `task verification inspect|record`；`verification run|cleanup` 只管理 transient execution。随包无状态 `project-testing` 只指导测试设计、开发与编排，不提供 capability contract；`task-environment`、`task-review`、`task-verification` 与窄 `task-worktree` 分别提供 `buildr.task-environment/v1`、`buildr.task-review/v1`、`buildr.task-verification/v3` 和 `buildr.git-worktree-provider/v1`。matching Receipt 的 `inspect` 使用 Receipt controller 做当前机器 probe，安装版 Local App 的 bundle source 因此不必成为 Environment Manager；Git-backed retained Environment Manager 只在 mutation 前检查受信产品输入并排除 `.buildr/`。候选 Product checkout 可只读 inspect、运行自身 CLI/runtime，但产品会阻止它管理自己的 Environment。

Service 使用 Node.js ESM，开发依赖通过 lockfile 与 `npm ci` 收敛。Workspace 在 `.buildr/workspace.yml` 维护精确 `runtime.node.version`；`init` 采用当前受支持 CLI Node 并准备本机受管 runtime，`sync` 按声明恢复且不改版本，`doctor` 只读核对声明、Node/npm/CLI/验证环境并建议 `sync`。开发与安装入口的普通命令固定使用该 runtime；仅 `init`、`doctor`、`sync` 可在 runtime 缺失时使用兼容 bootstrap Node。npm package 的 `engines.node` 继续只表达产品兼容范围。

Project `verification.yml` 使用 closed v2 declaration，只描述少量稳定、可独立选择的已有 capability；测试意图、执行边界、编排场景和目标耗时保留在 Project Testing 或项目 registry。Buildr 的唯一 verification registry 为每个 step 保存 owner、三轴分类、证明范围、目标耗时和主要证据 owner；`fast` profile 是兼容名称下的低成本 Quick，只组合完整 Unit、Component、Static 及 contract/runtime Integration。`test:contract` 的主要意图是 Static Conformance，但因启动真实开发入口、Git 和临时目录，其聚合执行边界按 Integration 记录。完整 CLI、Git、Workspace 生命周期位于 Task-affected/Candidate Integration 或 System，历史 `integration-fast` 保留 selector 但不进入 Quick。上述 static/package、active/archive lifecycle、browser 与 `product.candidate` 仍是 Product-specific capability/runner 实现，不构成通用 assurance 层级。`buildr verification run --project <code> --capability <id> ... --target-identity <identity>` 随 npm `src/` runtime 发布，只执行显式 command capabilities，并输出 provider-owned transient `buildr.verification-execution/v1`，不提供 caller-managed output writer。`effects.authorization: explicit` 与 explicit resource 分别要求精确 capability/resource 授权；被真实 claim 的 `coordinated` 资源才通过 Git common-dir lease 协调。该机制不调度 Agent 或任务，也不写 current Result。

Product `test:candidate` 额外执行 `concurrent-task-acceptance` 组合验收：在单一临时多仓 Workspace 创建两个正式 Task 与真实 Environment，从不同 cwd 按 Task ID 调用 receipt 返回的绝对 CLI invocation，并发执行显式 `verification run` 和随机端口 Preview。验收核对多仓 scope、allowed roots、共享容量等待与释放、非空 execution identity、错误 Task 无法停止对方 Preview、active Task cleanup authorization fail closed、异常子进程诊断、Environment 统一清理和 retained doctor。该步骤使用本地临时 Git 与进程，不访问外部系统。

Task Finish 是 `buildr.task-finish/v1` 的固定产品执行器。CLI 只公开 `task finish run|inspect`；首次 run 必须提供 Project，task identity 来自 receipt，提供 `--change` 时创建 `candidateKind: change`，省略时创建 `candidateKind: code-only`。两类候选都顺序执行 `preflight → prepare → verify → deliver → cleanup`。preflight 一次聚合 CLI probe、verification policy、Git/target 与 retained readiness；retained source clean 按 Workspace Metadata Store 边界排除未 staged 的 `.buildr/**`，但源码/文档 dirty 与 staged metadata 仍阻塞。Change 候选还检查 Change tasks/knowledge 和 OpenSpec strict/pure plan，code-only 将这些专属检查稳定记录为 `not-applicable`，不会执行 OpenSpec 命令或推断虚假 Change。

prepare 只为 Change 路径调用 environment-local `openspec converge`，随后现有 Finish 执行 runtime sync、commit、target fetch/rebase 与 fixed-point sync，形成 opaque frozen target identity；这不是 P0.5 Candidate generation。verify 通过 Task Verification Application inspect current Result：target/declaration current、conclusion passed 且覆盖全部适用 delivery-required capability 时复用；临时 adapter 只按 scope/path 保守选择 implicit command 能力并执行一次，多 Project、Agent、显式授权或语义排除必须已有正式 Result。任何产品缺陷、语义冲突或验证失败都终止当前 Finish；Finish 不在同一 run 修复、不写推进决定或 Task 状态。

deliver 使用 target lease 与远端 ref observation，只允许 fast-forward 和普通 push；随后按 changed paths 执行 retained doctor、必要 runtime sync，以及使用 Environment binding Node 的 CLI/Local App bundled runtime 安装与 version check。cleanup 先写 durable completion、清理 transient verification evidence，再向 Task Environment 提交各 scope delivery identity；可信 retained Environment Manager 按 Task/Workspace/Environment/resource/provider facts 停止动态资源并调用 Git provider cleanup，不比较或改写 controller content fingerprint，Finish 只记录 handoff/result summary。target ref 在 freeze 后前进时，只有持有当前产品生成 token 的 `deliver + task-finish.target-race` run 可以保留 preflight、失效 candidate-dependent prepare 下游状态，并重新 rebase/freeze、验证后交付；network、retained convergence/install 和 task-owned cleanup 等候选未变的暂态条件仍从最早 blocked phase 恢复，不重跑已通过阶段。

结果与 durable completion receipt 持久化 task、现有内部 candidate kind、可空 Change、Workspace Node identity、五阶段输入/输出 identity、具体 primary failure、command observation、Task Verification Result digest/applicability、delivery/completion 与执行次数。正常路径只有一次 canonical CLI invocation、零手写 recovery manifest、临时验证补齐不超过一次。客户端直接使用唯一 canonical `runs`、`completed` 与 lease namespace，不创建第二 Verification store；旧 run shape 不可恢复。

retained canonical Workspace 中明确的 metadata-only 候选不进入产品执行器，因为无关 dirty state 无法形成隔离的 frozen candidate。Task Finish Skill 只有在任务 paths、当前验证 identity、目标 branch/remote 与 retained context 都可证明时，才把精确 commit 与 push 分别交接给 optional selected `buildr.git-single-operation/v1` provider；provider 只能 stage 任务 paths 并保留无关改动，返回逐项 Git evidence 与 `completionMode: git-single-operation-handoff`。任一事实或 provider readiness 不可证明时正式 blocked，不使用 `git add -A`、stash、回滚、虚假 Change 或手写 Git 回退。

Task Environment 候选集成后，主 Workspace runtime 仍从 retained checkout sync/doctor；未合并 task checkout 不更新主 runtime。一次性迁移只把 identity 匹配的活跃旧 receipt 转为 v2 Environment + 窄 Git evidence，清退陈旧 receipt；冲突现场原样保留并阻止 authority 切换，不保留永久旧 reader/writer 路由。

## 局部术语

本 Service 当前不重定义 Project glossary。CLI、runtime adapter、Component、provider、consumer 和 binding 继续使用 [Project canonical terminology](../glossary.md) 及相关 specs 的精确定义。
