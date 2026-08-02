# Buildr 技术架构

## 所有权与源码边界

- Product Project root：`projects/product/`，拥有产品治理、OpenSpec、docs、knowledge 与 Service registry。
- Buildr Service root：`projects/product/services/buildr/`，拥有 CLI、Local App、runtime adapters、验证、package 和发布实现。
- 用户 Workspace 中由 Buildr 交付的 Rules/Skills/Components 是安装结果，只能由 Product checkout 的 update/sync 单向物化。

## 运行结构

- CLI 解析 Workspace/Project/Service manifests、Task Record 与 Task Environment 请求，执行确定性 source mutation、render、doctor、package 和 Local App lifecycle。`task environment prepare|inspect|cleanup` 只是 Application 的薄适配层；`worktree create|inspect|cleanup` 只适配 Git provider。
- Runtime adapter 将受管 Rules、Skills、contributions 和 capability binding evidence 投射到 Agent 原生入口；Project 普通知识和 Service repo 保持源资产，不复制进 runtime。
- Local App 只监听 loopback，以 Workspace registry 为全局目录，通过 application/domain 层读取和受控管理 Project、Service 与 Task Record，并只读展示 Change。Task 详情的“环境”页签调用 Task Environment Application `inspect`；Task-scoped Change route 复用共享 Resolver，不接收任意 filesystem path。

## Capability 与 Component

- `skills/manifest.yml` 注册 capability contracts、providers、consumers 和 workspace default bindings。
- Consumer 依赖 capability identity，不依赖 provider Skill id；required/optional 分别产生 blocked/degraded readiness。
- `task-manager` 提供并默认绑定 `buildr.task-record/v1`；`task-triage` 只在正式持久交付分支 optional 消费，provider 不 ready 不影响讨论或只读分支。
- `task-environment` 提供并默认绑定 `buildr.task-environment/v1`；正式 workflow 在持久写入前消费它。`task-worktree` 只提供 `buildr.git-worktree-provider/v1`，Environment 按实际 Git scope 组合该 provider。
- OpenSpec 1.6.0 作为默认 Component 交付上游 workflow Skills。Buildr 通过 Skill Contributions 在 runtime 组合 contract guard、terminology 和 current knowledge 门禁，不修改上游 Skill source bytes。

## 数据与完整性

Workspace、Project、Service、Rules、Skills、Commands 和 Components 由各自 manifests/registries 维护稳定 identity。Buildr 对路径、symlink、ownership、transaction、integrity 和并发 mutation fail closed；runtime 是可重建投影，不是源资产。

Task Record 由 `domain/task-record` 验证 closed schema，`application/task-record` 持有五个 lifecycle action、引用校验和 read/result model，filesystem repository 只维护 canonical `.buildr/tasks/<task-id>/task.yml`。CLI interface 只解析 action 参数、调用 Application 并适配输出/退出码；Local App HTTP/Web 共用该 Application，interface 不直接解析或写 YAML。Repository 以 Git topology 拒绝 linked-worktree Task Record target，只对 `task.yml` 做同目录原子替换，不对整个 Task 目录做 transaction/rollback，也不改写专业 sibling。Local App mutation 携带读取时的响应级 `recordDigest`；不匹配时 fail closed 并要求刷新，digest 不持久化，也不表示 revision、锁或自动合并。

Environment Receipt 由 `domain/task-environment` closed schema、`application/task-environment` 和 filesystem repository 共同维护，路径为 `.buildr/tasks/<task-id>/environment.json`。Application 是唯一 writer：`prepare` 同时承担首次准备和串行恢复，`inspect` 只读重新 probe，内部 resource port 供 Preview 等已登记 provider 使用，`cleanup` 只接受 Finish handoff 或已持久化 abandon。Git provider evidence 位于 Git common-dir，只包含 repository/checkout/branch/HEAD/clean/registration/effects，不与 Environment ready 或 cleanup 竞争 authority。候选 Product checkout 只能在自身 Task Validation Workspace 运行和投射；retained stable controller 才能控制 retained Task/peer Environment。

Workspace manifest 的 `runtime.node.version` 是实际采用的精确 Node toolchain 声明，属于 Workspace Domain；`package.json#engines.node` 只表达 Buildr 产品兼容范围。Buildr 在本机应用数据目录按 version/platform/arch 管理可恢复 runtime，`init` 首次确定并准备，`sync` 只按声明收敛，`doctor` 只读诊断。CLI、npm、验证、Candidate 和 Finish 均消费同一 Workspace Node identity，不允许 Agent runtime 或普通 `PATH` 重新选择版本。

## 验证

Project `verification.yml` 定义或增强验证政策。实现循环使用 minimal feedback，任务组完成后运行 affected，最终冻结 tree 运行 Candidate；evidence 同时绑定 candidate identity、Environment execution binding 与 Workspace Node identity，任一变化后失效。正式 `buildr verification run` 位于可发布 `src/application/verification`，Task 场景必须同时提供 Task ID 与 canonical Workspace，由 Application 解析 ready Environment 与允许执行根；checkout 与 npm 安装后 CLI 共用该实现，不依赖 `test/verification`。

Production verification summary 只公开一个 `buildr.verification-evidence-lifecycle/v1` 对象，execute、Task Finish consumer 与 `verification cleanup` 共享 run identity、summary path 和 provider-owned directory 边界。Cleanup 只删除系统临时根下、名称和 summary containment 均匹配的单次 transient run；首次删除后的相同公开调用只在精确 summary 路径及整个 run directory 已不存在时幂等返回 `already-absent`。Caller-managed、symlink、越界、父目录仍存在或不可证明的 legacy summary 保留现场。

验证 scheduler 管理单 run readiness/并行，resource coordinator 管理跨 task 共享容量：`isolated` 保持 task-local，`namespaced` 从 task/environment/run 派生命名空间，`coordinated` 在 Git common-dir 保存带 heartbeat/expiry/token 的 lease，`external` 要求显式授权。结果使用进程外单调时钟记录真实 wall-clock，并以 policy、environment、repository candidates 与 checks 形成 `evidenceIdentity`。Buildr 不创建或调度 Agent/task。

## Task Finish

Task Finish 是产品持有的固定五阶段执行器：`preflight → prepare → verify → deliver → cleanup`。CLI 只公开 `task finish run|inspect`；Application 持有 run store、candidate freeze、产品生成的 resume token 和结果投射，各领域的 OpenSpec convergence、verification、Git 与 runtime install 仍由确定性服务执行。Finish 完成交付后只向 Task Environment 提交各 scope 的 delivery identity/cleanup eligibility；Environment 停止资源并调用 Git provider cleanup，Finish 不再直接删除 worktree 或写第二份环境结论。

`preflight` 从 canonical Workspace 读取 Project 登记事实，并通过 Task Environment Application 读取 Change、knowledge、verification policy、Git 候选与 execution binding；它一次聚合廉价只读问题。`prepare` 完成全部候选 mutation 并冻结 identity，`verify` 对冻结候选最多执行一次 required assurance。产品缺陷、语义冲突和验证失败是终态并返回研发流程；只有 target、network、retained install 与 task-owned cleanup 等不改变候选语义的暂态条件可以恢复。客户端直接替换旧执行器，继续使用唯一 canonical run store，不创建版本化目录、兼容 reader 或状态迁移模块。
