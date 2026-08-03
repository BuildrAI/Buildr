# Buildr 技术架构

## 所有权与源码边界

- Product Project root：`projects/product/`，拥有产品治理、OpenSpec、docs、knowledge 与 Service registry。
- Buildr Service root：`projects/product/services/buildr/`，拥有 CLI、Local App、runtime adapters、验证、package 和发布实现。
- 用户 Workspace 中由 Buildr 交付的 Rules/Skills/Components 是安装结果，只能由 Product checkout 的 update/sync 单向物化。

## 运行结构

- CLI 解析 Workspace/Project/Service manifests、Task Record、Task Environment、Task Review 与 Task Verification 请求，执行确定性 source mutation、render、doctor、package 和 Local App lifecycle。`task environment prepare|inspect|cleanup`、`task review inspect|record` 与 `task verification inspect|record` 都只是各自 Application 的薄适配层；`verification run` 只产生 transient execution，`worktree create|inspect|cleanup` 只适配 Git provider。
- Runtime adapter 将受管 Rules、Skills、contributions 和 capability binding evidence 投射到 Agent 原生入口；Project 普通知识和 Service repo 保持源资产，不复制进 runtime。
- Local App 只监听 loopback，以 Workspace registry 为全局目录，通过 application/domain 层读取和受控管理 Project、Service 与 Task Record，并只读展示 Change。Task 详情的“环境”“审查”“验证”页签分别调用 Task Environment、Task Review 与 Task Verification Application `inspect`；Agent action 只生成受限 prompt，不提供专业 Result mutation API。Task-scoped Change route 复用共享 Resolver 并进入 Planning Review，全局 Change generic review 保持 retained-only；接口不接收任意 filesystem path。

## Capability 与 Component

- `skills/manifest.yml` 注册 capability contracts、providers、consumers 和 workspace default bindings。
- Consumer 依赖 capability identity，不依赖 provider Skill id；required/optional 分别产生 blocked/degraded readiness。
- `task-manager` 提供并默认绑定 `buildr.task-record/v1`；`task-triage` 只在正式持久交付分支 optional 消费，provider 不 ready 不影响讨论或只读分支。
- `task-environment` 提供并默认绑定 `buildr.task-environment/v1`；正式 workflow 在持久写入前消费它。`task-worktree` 只提供 `buildr.git-worktree-provider/v1`，Environment 按实际 Git scope 组合该 provider。
- `task-review` 提供并默认绑定唯一 `buildr.task-review/v1`；planning/completion 是动态参数，不注册类型专属 capability 或 provider。`task-asset-review` 的 capability、observation store 和 Task Finish optional dependency 保持独立。
- `task-verification` 提供并默认绑定 `buildr.task-verification/v3`；Project `verification.yml` v2 是测试能力声明，不进入 capability binding manifest。Skill 负责 applicability 与语义提炼，Task Verification Application 独占 current Result writer/reader。
- OpenSpec 1.6.0 作为默认 Component 交付上游 workflow Skills。Buildr 通过 Skill Contributions 在 runtime 组合 contract guard、terminology 和 current knowledge 门禁，不修改上游 Skill source bytes。

## 数据与完整性

Workspace、Project、Service、Rules、Skills、Commands 和 Components 由各自 manifests/registries 维护稳定 identity。Buildr 对路径、symlink、ownership、transaction、integrity 和并发 mutation fail closed；runtime 是可重建投影，不是源资产。

Task Record 由 `domain/task-record` 验证 closed schema，`application/task-record` 持有五个 lifecycle action、引用校验和 read/result model，filesystem repository 只维护 canonical `.buildr/tasks/<task-id>/task.yml`。CLI interface 只解析 action 参数、调用 Application 并适配输出/退出码；Local App HTTP/Web 共用该 Application，interface 不直接解析或写 YAML。Repository 以 Git topology 拒绝 linked-worktree Task Record target，只对 `task.yml` 做同目录原子替换，不对整个 Task 目录做 transaction/rollback，也不改写专业 sibling。Local App mutation 携带读取时的响应级 `recordDigest`；不匹配时 fail closed 并要求刷新，digest 不持久化，也不表示 revision、锁或自动合并。

Environment Receipt 由 `domain/task-environment` closed schema、`application/task-environment` 和 filesystem repository 共同维护，路径为 `.buildr/tasks/<task-id>/environment.json`。Application 是唯一 writer：`prepare` 同时承担首次准备和串行恢复，`inspect` 只读重新 probe，内部 resource port 供 Preview 等已登记 provider 使用，`cleanup` 只接受 Finish handoff 或已持久化 abandon。Task checkout/provider evidence 决定源码版本；Git evidence 位于 Git common-dir，只包含 repository/start point/checkout/branch/HEAD/clean/registration/effects，不与 Environment ready 或 cleanup 竞争 authority。retained Buildr 只是 sourceRoot/adapter 可信且 Git source clean 的 Environment Manager；Receipt controller identity 保留为创建指纹，不参与 ready、资源 ownership 或 Verification applicability。候选 Product checkout 可以只读 inspect 并在自身 Task Validation Workspace 运行/投射，但不能创建、恢复、认领、释放或清理自己的 Environment。

Task Review Result 由 `domain/task-review` closed schema、`application/task-review` 和 filesystem repository 共同维护。唯一 writer 精确拥有 `.buildr/tasks/<task-id>/reviews/planning.yml|completion.yml`，要求 active Task 和明确 target identity，并以同目录临时文件加原子替换保存完整 Result；失败保留旧 slot、另一 slot、Task Record、Environment 与未知 sibling。持久字段不含 revision、current、applicability 或 digest；Application 用调用方提供的当前目标派生 `current / stale / unknown`，并只在公共响应返回 canonical bytes `resultDigest`。Local App 与 CLI 都不直接解析或写 YAML。

Task Verification Result 由 `domain/task-verification` closed schema、`application/task-verification` 和 filesystem repository 共同维护。唯一 writer 精确拥有 `.buildr/tasks/<task-id>/verification.yml`，要求 active Task、明确 target identity、当前 Task/Project/Service scope 和完整事实结果；Application 自行读取、校验并计算 declaration identities，caller 不能注入 digest。Repository 以临时文件、rename、写后回读和失败 rollback 执行整值替换；持久字段不含 stdout/stderr、Environment Receipt、revision/history、applicability、风险或推进决定。Application 在读取时按 target/declaration identity 派生 `current / stale / unknown`；CLI、Local App 和 Finish 都不直接解析或写 YAML。

Workspace manifest 的 `runtime.node.version` 是实际采用的精确 Node toolchain 声明，属于 Workspace Domain；`package.json#engines.node` 只表达 Buildr 产品兼容范围。Buildr 在本机应用数据目录按 version/platform/arch 管理可恢复 runtime，`init` 首次确定并准备，`sync` 只按声明收敛，`doctor` 只读诊断。CLI、npm、验证、Candidate 和 Finish 均消费同一 Workspace Node identity，不允许 Agent runtime 或普通 `PATH` 重新选择版本。

## 验证

Project `verification.yml` 使用 closed `buildr.project-verification/v2`，只声明已存在 capability 的 identity、Project/Service scope、command 或 bounded Agent invocation、applicability、可证明事实、delivery policy，以及确有需要时的 environment/effects/resource 边界。声明缺失或能力不存在只形成 coverage gap；Buildr 不自动创建测试。旧 mode、maturity、stages、enforcement、coverage、sources、dependsOn 与 supersedes 已删除。

Production `verification run` 接受显式 Project、capability 列表和 opaque target identity，只运行 command capabilities，并形成 provider-owned transient `buildr.verification-execution/v1`。完整输出、耗时、临时目录、精确授权、Workspace Node/Environment execution binding 与资源诊断只属于 execution evidence；不提供 caller-managed output writer。声明级通用 plan/DAG 已删除；Product selector/registry/DAG 留在 `test/verification`，production 只保留平坦 capability runner、process executor、真实 claim 使用的 coordinated/external resource coordinator 和 evidence cleanup。

Task Verification Application 从 execution evidence 或有界 Agent 事实提炼完整 `buildr.task-verification-result/v1`，并整值写入 current slot。Result 只包含 Task/target/declaration identity、实际 capability 的 `passed / failed` 精炼事实、coverage gaps、`passed / not-passed` 结论与完成时间。中断、非终态 execution 或写入失败不覆盖 current；target 或当前 declaration identity 变化后 inspect 派生 stale。Result 不拥有推进决定、Task 状态、Candidate generation 或 Environment Receipt。

transient cleanup 只删除系统临时根下、名称和 summary containment 均匹配的 provider-owned run directory。非 transient、symlink、越界或不可证明的 evidence 保留现场。资源协调只处理声明中真实 claim 的 `coordinated / external` 边界；explicit resource 必须精确授权。Buildr 不创建或调度 Agent/task。

## Task Finish

Task Finish 是产品持有的固定五阶段执行器：`preflight → prepare → verify → deliver → cleanup`。CLI 只公开 `task finish run|inspect`；Application 持有 run store、candidate freeze、产品生成的 resume token 和结果投射，各领域的 OpenSpec convergence、verification、Git 与 runtime install 仍由确定性服务执行。Finish 完成交付后只向 Task Environment 提交各 scope 的 delivery identity/cleanup eligibility；可信 retained Environment Manager 按 Task-owned resource/provider facts 停止资源并调用 Git provider cleanup，不做 controller handoff，Finish 不再直接删除 worktree 或写第二份环境结论。

`preflight` 从 canonical Workspace 读取 Project 登记事实，并通过 Task Environment Application 读取 Change、knowledge、verification declaration、Git 交付内容与 execution binding；它一次聚合廉价只读问题。`prepare` 完成现有 Finish 的 mutation 并冻结 opaque target identity；`verify` 只通过 Task Verification Application 复用 current Result，或在单 Project command 能力的窄条件下执行一次、提炼并整值记录。产品缺陷、语义冲突和验证失败是终态；Finish 不创建 Candidate generation、不改 Task 状态，也不保存风险推进决定。客户端直接替换旧执行器，继续使用唯一 canonical run store，不创建第二 Verification store 或兼容 writer。
