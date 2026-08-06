## Context

Buildr 的普通用户 Workspace 只有一个 retained Buildr runtime 和一份 canonical Workspace Structured Store。用户项目/服务的业务进程及数据库是另一套系统；Buildr 只通过 CLI/HTTP adapter 调用 Application 维护自身 Task current records。

自举时同一 Git common-dir 内同时存在 retained checkout 与多个 candidate task worktree。现有 runtime projection guard 已禁止候选 source 写 retained runtime，但 SQLite repository 只验证 target 是否为 canonical Workspace，未验证调用 runtime 的来源。因此候选 CLI、Local App 或 internal driver 可以在主库应用只存在于候选中的 migration，造成 ledger 与 retained runtime 不匹配。

现有 `database-newer-than-runtime`、checksum drift 与连续 migration 检查是正确的数据完整性保护，不能以关闭检查或修改 ledger 解决并发问题。长期术语已定义“Retained Buildr Environment Manager”和“Task Validation Workspace”；本 Change 不扩张 `controller` 这个已有内部字段为新的泛化产品术语。

## Goals / Non-Goals

**Goals:**

- 让 canonical Workspace Structured Store 的全部 mutation 只由可证明来自 retained controller 的 runtime 执行。
- 让每个自举候选在 receipt-bound Task Validation Workspace 的独立 SQLite 中验证 migration、应用行为和 Local App smoke。
- 保持并发任务可各自开发 migration；在最终集成阶段按最终候选的 migration identity 重建验证库并选择性重验。
- 保持普通用户 Workspace 的单数据库体验和现有 migration integrity guarantees。

**Non-Goals:**

- 不关闭 ledger、checksum 或数据库版本超前检查，不直接编辑 ledger，不引入 down migration。
- 不同步、导出、合并或回放任务验证数据库的数据到 canonical 数据库。
- 不让 candidate runtime 成为 Task Record、Environment 或其他真实进度 writer，不新增 daemon、server、云端、锁服务或通用 scheduler。
- 不把“控制器”扩张为跨所有 Domain 的新术语或第二套 lifecycle authority。

## Decisions

### 1. 以 runtime provenance 而非 migration 版本决定 canonical writer 权限

每次可能创建数据库、运行 migration 或写 SQLite 的入口，在打开 connection 前计算 caller runtime source 与 target canonical Workspace 的 provenance。若 caller source 位于与 target 共享 Git common-dir 的 linked task worktree/candidate checkout，则拒绝，诊断包含脱敏的 caller/target identity、允许的 retained source 类别和稳定 code；不得创建数据库、目录、WAL/SHM、ledger row 或业务 row。

这比“允许候选写、失败后手动回退”更可靠：DDL 往往不可逆、并发任务无法安全判断其他任务依赖，且 ledger 已应用的脚本不应被删除。它也比按 cwd、branch 名称或调用命令猜测更确定；CLI、HTTP 和 internal driver 都经 Application/repository 的同一个低层 gate。

普通用户安装不在 self-bootstrap Git topology 中，继续使用其 retained/runtime source 写自己的 canonical Workspace；guard 不把它们误判为候选。

### 2. 真实 Task 进度始终走 receipt-pinned retained runtime

Task Record、Development、Review、Verification、Retrospective、Environment、Finish terminal transition、Local App mutation 和 canonical migrations 属于 Workspace framework 数据。自举 task 从 worktree 触发真实更新时，必须使用 Environment Receipt 绑定的 retained controller executable/identity；不得依赖 shell PATH、candidate CLI 或工作目录推断。

候选 runtime 仍可以作为被测对象读取、执行功能和服务验证，但不获得主 Workspace writer 资格。Local App 的 retained 实例只服务 canonical Workspace；候选 Local App 只能绑定验证 Workspace，且端口/process 作为 Task-owned resource 登记。

### 3. Task Validation Workspace 拥有可抛弃的验证数据库

Task Environment 在自举 task 的 validation root 下创建独立 Workspace Local Data Store。候选 runtime 在这里从 `0000` 到当前候选 migration 链初始化，并运行候选 CLI/HTTP/Local App smoke。该库的 Task、测试和 schema 数据只属于本次验证；任务清理/放弃时删除整个验证 Workspace 或其精确 owned store，而不是对 canonical database 生成回退 SQL。

任务在验证时改动的是 Task/Workspace 功能也不例外：测试数据写入验证库，真实任务进度仍写 retained canonical 库。两者不需要也不得互相合并。

### 4. 按最终候选变化分层重验，不机械全量重跑

首次候选验证绑定 runtime source、Content Target、migration identity、验证数据库基线与受影响 capability evidence。最终集成前：

- 若这些输入均未变，仅执行最终 identity/retained-baseline 检查并复用结果；
- 若仅 migration 文件名/编号变化，丢弃旧验证库，从最新基线重建，重跑完整 migration 链、SQLite 和相关功能测试；
- 若代码、SQL、测试、verification declaration、runtime identity 或冲突解决改变，重跑受影响 capability；
- 无法证明等价时，形成新的完整 Candidate 验证。

这样并发 task 可以各自先用相同的暂定编号在隔离库工作；后集成者 rebase/重编号后只承担与最终候选变化相称的验证成本。

### 5. 只有集成后的 retained runtime 升级 canonical database

成功交付后，source/migration 先成为 retained checkout 的内容，retained controller 完成适用 activation。随后它在合法 canonical writable action 中按现有连续 migration runner 升级主库。若验证失败、任务放弃或交付冲突，验证 Workspace 被清理，主库保持此前版本。

该顺序保留了 migration ledger 的单向事实：主库永远只记录其 retained runtime 已携带的脚本。它也不要求在 Git 合并时同步任何测试数据。

## Risks / Trade-offs

- [guard 只在部分入口生效] → 将 guard 放在 SQLite connection/migration 与 repository shared path，并以 CLI、HTTP、internal driver 和 direct repository fixtures覆盖所有 writer。
- [候选误被当 retained] → 以 canonical Workspace、runtime source root 和 Git common-dir/Environment receipt evidence 组合判断；来源不明时 fail closed，而不是推断允许。
- [独立验证库增加本机资源] → 使用 SQLite 文件，创建成本低；作为 receipt-owned resource 精确登记/cleanup，不做跨 task 共享。
- [并发 migration 重编号增加末尾成本] → 只在最终候选 identity 改变时重建验证库并重跑受影响范围，不把每次 rebase 一律升级为全量测试。
- [保留主库已有历史不匹配] → 不修订旧 ledger；先以当前 retained runtime 检查/恢复到一致状态，再启用新 guard，异常状态明确诊断而不自动修改数据。

## Migration Plan

1. 在 retained runtime 实现并验证 provenance guard、validation-store preparation/cleanup、receipt-pinned dispatch 与候选 Local App isolation。
2. 用临时 Workspace fixture 验证候选 runtime 被主库拒绝且零 mutation，同时验证候选库可完成完整 migration 链。
3. 在自举 Worktree 中按最终候选做受影响验证；若 migration identity 在 rebase/冲突后改变，重建 validation database。
4. 通过现有 Formal Finish 集成 source；由 retained runtime 激活并在下一次合法 writable action 升级 canonical database，执行 Doctor。

不存在对 canonical database 的 rollback 方案：失败时不接触主库，已应用 migration 仍只能前向修复。可回退的是未集成的候选源码和整份 Task Validation Workspace。

## Open Questions

- 无。具体 rejection code、receipt 字段和 Local App launch argument 在实现中沿现有诊断/Environment schema 约定收敛，不形成新的公开生命周期模型。
