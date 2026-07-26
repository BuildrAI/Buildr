## Context

Task Finish V1 把收尾进度迁移到 Workspace-local run 文件，并用短 lease 协调共享资源；task environment 则把 execution readiness 与 session activation 分开。当前实现的结构方向正确，但存在四类不一致：run id 未限制路径、步骤可在缺少证据时通过、lease 没有 fencing、environment receipt 记录创建者 CLI 导致 checkout-local CLI 自锁。同时 activation special case 仍以“修改 Rules/Skills”为触发条件，超出了真正需要新 session evidence 的 runtime 机制变更。

## Goals / Non-Goals

**Goals:**

- 让 finish run 的路径、步骤提交、远端观测和共享 lease fail closed。
- 在不引入 Workspace 全局锁的前提下，阻止过期 owner 删除或覆盖新 owner 的 lease。
- 让自举 Workspace 创建 environment 后确定性切换到 environment-local CLI；普通外部 Workspace 仍可使用显式声明的产品 CLI。
- 把普通 execution readiness 与 runtime discovery/loading/activation 专项 evidence 完全分离。
- 让 Skill frontmatter 与两个 manifest 的 description 使用同一事实。

**Non-Goals:**

- 不让 Buildr 内省或启动 Agent host。
- 不为普通 Skill 内容修改创建新 session，也不把 activation receipt 变成 Task Finish 常规门禁。
- 不改变 Git provider、验证 provider 或 OpenSpec provider 的专业策略。
- 不引入 daemon、全局锁、数据库或后台续租服务。

## Decisions

### 1. Finish run identity 使用受限 id 与 canonical containment

`runId` 采用与 task identity 相同的稳定字符边界；解析后的文件必须仍位于 `<workspace>/.buildr/task-finish/runs/`。读写共用同一校验函数，避免只保护创建路径。相比只清理 `../`，正向 allowlist 更容易审计，也与既有 task id 约定一致。

### 2. Step completion 先验证结果，再改变 checkpoint

每个 `passed` 必须具有已领取 attempt、非空 input fingerprint 和至少一个带稳定 id 的 evidence；effect 仍可为空，因为只读检查也能完成。`integration-push` 额外 required `expectedTargetRef`、`observedTargetRef` 且二者相等。所有验证在记录 effect/evidence、释放 lease和更新时间前完成，重复提交只有 attempt、fingerprint 与 effect/evidence identity 都相同时才幂等返回。

相比让 Agent 自由写任意 checkpoint，这保留 Agent/provider 负责专业动作的边界，同时由 Buildr 确定性保护 consumer 真正依赖的最小证据。

### 3. Lease 使用 owner/token fencing

lease 文件中的 key、run、step、attempt token 是 fencing identity。接管只允许发生在旧 lease 过期后；旧 holder 提交结果或释放前必须重新读取当前 lease，并在 identity 或 expiry 不匹配时返回 `lease-lost`，不得删除目录或接受成功。V1 不新增后台续租；默认 TTL 调整为足以覆盖常规单步的值，超时动作需要重新领取并由幂等 provider evidence 恢复。

### 4. CLI receipt 表达 environment-bound execution source

当 Buildr 产品源码位于当前 Workspace 内时，create 根据产品源码相对 Workspace 的路径，预先记录 environment 内对应 CLI 为 expected source；Agent 随后从 environment checkout 运行 context 即可匹配。canonical CLI 只负责创建，不成为永久 execution identity。

当产品源码不属于用户 Workspace 时，receipt 显式记录外部产品 CLI source，允许其配合 environment target/workdir 执行。结果增加 source kind，使 `checkoutLocal` 与 `executionReady` 不再矛盾。相比无条件要求 CLI 位于 environment，这一设计兼容普通用户 Workspace；相比只比较创建者 CLI，它又能保证自举开发真正使用 task checkout。

### 5. Activation 只验证 runtime 机制，不验证普通资产内容

Rule/Skill 内容修改通过源资产、package、render/sync、runtime projection 与 doctor 验证。只有本次任务修改 runtime adapter 的 discovery、loading、activation mode、投射路径或相关 metadata，且专项验收明确要求真实 activation proof 时，才请求 host evidence。session root 与 handle 一起绑定；任一变化都使 evidence mismatch。

create/reuse 的普通结果返回 `adoption: not-required` 且不包含 handoff next action。activation guidance 只作为条件式 metadata 保留。

### 6. Description 使用单一 routing fact

package builtin description、workspace baseline description 和 Skill frontmatter 必须完全一致。package check 增加静态一致性门禁；workspace sync 由 package source 投射该 description，避免 runtime 与 inventory 各自保留旧路由。

## Risks / Trade-offs

- [旧 run 没有 fingerprint/evidence] → 对尚未完成的旧步骤 fail closed，保留已有文件并返回确定性补证动作，不静默升级成功状态。
- [长动作超过 lease TTL] → 旧 owner 不能提交成功；调用者需要重新领取并依赖 provider 幂等性恢复，后续若出现真实需求再设计显式续租。
- [普通 Workspace 没有 checkout-local Buildr 产品源码] → 用 source kind 明确允许 external-product CLI，不伪装为 checkout-local。
- [严格 description 一致性暴露历史 drift] → 由当前 change 一次性同步 package/workspace/runtime 源，并用静态检查阻止复发。

## Migration Plan

1. 先补反例测试，覆盖路径逃逸、空证据 push、lease 接管、CLI bootstrap、activation root/handle 和 description drift。
2. 实现 finish-run 与 worktree application 修复，再更新 Skills、contracts、specs 和 package manifests。
3. 运行 affected verification、package/static checks、OpenSpec strict 与 doctor。
4. 回滚时恢复旧实现与资产；已有 run/receipt 文件保留，不执行破坏性迁移。

## Open Questions

无阻塞实现的问题。若后续真实单步经常超过默认 lease TTL，再独立设计显式续租协议。
