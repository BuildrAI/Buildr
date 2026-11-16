## Why

受管 Antigravity CLI（`agy`）自带更新器。2026-11-16，它在 Buildr 已向连接私有配置写入 `autoUpdate: false` 的情况下仍自行更新到 1.5.9，旧二进制被改名为 `.old`。Buildr 保存的程序身份摘要（路径、inode、大小、修改时间）与当前文件不一致，按设计中断本轮并关闭该程序的对话进程。

中断后没有任何可用的恢复路径：官方清单最新版本同样是 1.5.9，程序更新显示“已是最新”，受管程序不出现更新按钮；同版本升级被“目标版本不高于当前版本”拒绝；重新准备连接也因绑定摘要不一致失败。用户只能等待下一个版本，或直接修改连接记录。这不是一次性偶发：只要 `agy` 会自行更新，每次更新都会让 Buildr 连接进入无法从界面恢复的状态。

## What Changes

- 程序更新检查新增“受管程序文件身份已变化”观察：区分文件内容身份与官方版本，界面显示明确诊断，而不是“已是最新”。
- 新增显式的“重新核对并重装受管程序”动作：在身份失配时允许重新安装当前最新版本（包括与本地版本相同的版本），从官方发布清单下载并校验后替换受管程序，再更新连接绑定摘要。
- 恢复动作完成后，保留的失败输入可以继续；不自动在未核对的文件上继续旧对话，不重放可能已执行的工作。
- 修复关闭 `agy` 自动更新的约束：依据 `agy` 实际读取的配置与更新器行为核对 `autoUpdate` 失效原因，补齐有效约束；无法由配置关闭时，明确诊断并在程序身份变化后提供可恢复状态。
- **BREAKING**：无。新增状态和动作为增量；同版本重装只对已失配的受管程序开放。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `antigravity-cli-execution`: 受管程序身份变化后的恢复路径、同版本重装条件，以及关闭自动更新的可验证约束。

## Impact

- `services/buildr-harness/src/executors/antigravity`：程序身份观察与恢复动作的服务端约束。
- `services/buildr-harness/src/application/program-updates.ts`、`program-upgrades.ts`、`connection-application.ts`：更新状态、同版本重装与绑定刷新。
- `services/buildr-harness/src/operation-schemas.ts`、`interfaces/http`：程序更新视图字段与操作输入。
- `services/buildr-harness-web/src/features/agent-conversations`：程序更新界面状态、诊断与动作。
- 相关单元测试与 Antigravity 执行器测试；不涉及账号凭据、原生历史或用户桌面程序。
