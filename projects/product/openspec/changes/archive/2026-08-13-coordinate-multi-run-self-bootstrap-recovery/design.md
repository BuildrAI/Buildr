## Context

`buildr-self-bootstrap-sync` 的 bundled runner 是 Buildr 自举 Workspace 唯一的 post-Finish activation owner。它只通过 retained Product CLI 读取一个 Finish Result，并在 workspace cleanliness 检查时仅排除该 doctor-blocked run 精确拥有的 carrier。另一个 run 的 carrier 即使是合法、可恢复的 cleanup 现场，也会作为 foreign dirty path 阻塞。

这种 fail-closed 行为保护了跨 owner 边界，但当前结果只给出 dirty path，没有一次性说明 foreign carrier 属于哪个 Finish run、为什么可以或不可以恢复、应由谁先执行什么动作。已有 Product `task finish inspect` 已能按 run identity 返回完整 current/terminal Result，因此不需要新增 Product Application 或 store。

## Goals / Non-Goals

**Goals:**

- 在任何 sync、Git、安装、Doctor 或 Finish resume 前完成只读 carrier inventory。
- 证明 foreign carrier 与 owning Finish Result 的 run、Workspace、路径、carrier identity 和 resume identity 一致。
- 把可证明的 `cleanup_pending` foreign run 表达为 predecessor owner cleanup，并把当前 runner 重试表达为最后一步。
- 一次返回全部已发现 carrier、确定性顺序、授权点、owner command 和预期 effects。
- 对所有不能证明的情况继续 fail closed，并保持现有单 run runner、Finish owner 与 Environment cleanup authority。

**Non-Goals:**

- 不由当前 runner 自动恢复、删除或忽略 foreign carrier。
- 不把多个 Finish run 合并为一条 transaction、队列、状态机或新 Receipt。
- 不增加 Product CLI、SQLite migration、Task Finish Result writer 或跨 owner mutation capability。
- 不为普通 Workspace、用户 npm package或任意临时目录提供通用垃圾清理器。

## Decisions

### 1. 预检属于现有 bundled runner 的 command adapter

`runSelfBootstrapCloseoutCommand` 已拥有 retained Node、canonical Workspace 和 Product CLI 路径。它先 inspect 当前 run，再枚举固定根 `.buildr/transient/task-finish/carriers` 的直接子项，并逐个调用现有 `task finish inspect --run <id> --detail full --json`。纯 runner 核心继续消费显式 observation，不导入 Product Application。

替代方案是在 Product 中增加跨 run inventory API；这会扩大公开面和 Product authority，而当前问题只存在于自举 Workspace 的专属 runner，因此不采用。

### 2. filesystem 名称只是候选，Finish Result 才是 owner authority

目录名只用于提出 inspect 候选。每个条目必须是固定 carrier 根下的真实直接目录且不是 symlink；inspect Result 还必须证明：

- `schemaVersion`、`runId` 与请求一致；
- `identity.workspaceRoot` 精确等于 canonical Workspace；
- `carrier.root` 精确等于观察目录；
- `resume.carrierIdentity` 与 `carrier.identity` 一致；
- predecessor 为 `status=cleanup_pending`、`primaryFailure.phase=cleanup`、`resume.phase=cleanup` 且 token 非空。

任一检查失败都形成该条目的 blocked observation；不能因为其他条目合法而忽略它。

### 3. 第一版只自动建议 owner cleanup predecessor

可证明的 foreign `cleanup_pending` run 已完成 delivery，只剩其原 Finish owner 的 cleanup。计划按 `taskId + runId` 稳定排序这些 owner cleanup；它们只处置各自资源，顺序间没有共享 Git mutation。最后追加当前 run 的 `retry-current-closeout` 步骤。

foreign doctor-blocked、prepare/deliver blocked、terminal complete 但 carrier 残留或其他状态仍展示 owner facts，但 action 为 `manual-owner-review`，整体保持 blocked。这样先解决真实复盘中的 predecessor cleanup 场景，不为尚未证明的多 activation 排序编造依赖。

### 4. 计划是 ephemeral read model，不是执行授权

Result 增加可选 `recoveryPlan`：包含 schema、current run、carrier observations、ordered steps、每步 owner、authorization、command 和预期 effects。计划不持久化；当前 invocation 在存在任意 foreign carrier 时都返回 blocked。Agent 必须向用户展示计划并取得对应 owner action 授权，然后分别调用原 Finish owner；全部 predecessor carrier 消失后再重跑当前 bundled runner。

### 5. 未知与漂移优先于便利性

无法读取、symlink、越界、重复 realpath、Result/path/run/token/identity 不匹配，或存在不支持状态时，计划标记 `unprovable`，不为该条目生成可执行 resume command。runner 不执行 sync、Git、安装、Doctor 或当前 resume。

## Risks / Trade-offs

- **[风险]** 一次 inspect 多个 run 会增加启动耗时。→ 只枚举固定根的直接子项，按名称排序并有界调用现有 CLI；正常无 foreign carrier 时没有额外 run inspect。
- **[风险]** 在 ephemeral Result 中包含 resume command 可能扩大 token 暴露。→ 仅对已证明 owner 的 cleanup step返回 matching token；不写 Execution Record、SQLite、日志或 Git，诊断不得复制其他命令输出。
- **[风险]** 第一版不能自动排序多个 doctor-blocked activation。→ 明确返回 `manual-owner-review`，不从时间、目录名或 Git 外观猜依赖；后续只有新增事实证明后再扩展。
- **[取舍]** 用户仍需分别授权和执行 owner action。→ 保持现有 authority 不变，但把原来多轮调查压缩为一次完整可审计方案。

## Migration Plan

1. 扩展 bundled runner 的只读预检与结构化 Result。
2. 增加纯分类、command adapter、真实 filesystem/CLI fixture 和 fail-closed contract tests。
3. 更新 self-bootstrap Skill 使用说明与 canonical spec。
4. 无数据迁移；旧 Finish Result 与无 foreign carrier 的 runner 调用保持兼容。

## Open Questions

无。多个 doctor-blocked activation 的自动排序不在本 Change 范围内。
