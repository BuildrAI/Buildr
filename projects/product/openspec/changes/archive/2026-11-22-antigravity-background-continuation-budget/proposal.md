## Why

Antigravity 执行器将单轮后台命令自动续行次数硬编码限制为 8 次，并且用户在同轮执行中通过追加输入（`supplement`）推进新目标时不会重置该预算。在包含构建、全量测试、浏览器实测与收尾的多步骤研发任务中，后台唤醒极易超过 8 次而被强行截断。

同时，当前达到自动续行上限时仅在本地保留 `status = 'unknown'` 与上限诊断，既不会主动释放空闲控制资源，界面也缺少可用的“继续原任务”出口；若此后恰逢后台服务重启或退休接管，原诊断还会被覆盖为“服务重启中断”并被系统自动恢复重跑，既掩盖真实暂停原因，又绕过了防死循环保护边界。

## What Changes

- 将 Antigravity 单轮后台自动续行默认上限从 8 次提升至 20 次（并支持在测试构造时覆盖阈值）。
- 拆分同轮续行预算计数与持久化续行序号：已受理的用户执行中追加（`supplement`）重置本轮自动续行预算，被拒绝追加和系统自动续行不重置预算，同时保持持久化续行记录编号单调递增。
- 触顶暂停时保留真实上限诊断、主动释放空闲控制资源；应用层与跨代恢复阶段严格保留该上限诊断并禁止自动触发重启恢复，同时为界面和恢复逻辑提供可用的“继续原任务”出口与明确中文提示。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `antigravity-cli-execution`: 放宽 Antigravity 单轮后台自动续行上限、明确用户已受理追加重置续行预算且保持记录序号单调递增，并规范触顶暂停后释放空闲进程与控制资源的行为。
- `agent-conversations`: 规定因自动续行上限暂停且控制资源已释放的轮次保留真实上限诊断、禁止自动恢复重跑，并向用户提供单一“继续原任务”出口与清晰摘要说明。

## Impact

- `projects/product/services/buildr-harness`: Antigravity 执行器预算与释放逻辑、统一诊断常量、`ConversationApplication` 释放与恢复保护逻辑、续行恢复草稿提示以及集成/单元测试。
- `projects/product/services/buildr-harness-web`: 未知状态摘要与读取反馈文案、状态回归单元测试。
- `projects/product/knowledge`: 经检索确认现有知识文档未记录具体 Antigravity 自动续行上限数字或触顶分支，本次无需同步修改知识文档。
