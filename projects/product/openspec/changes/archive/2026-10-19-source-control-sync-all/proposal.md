# 源代码管理“全部同步”入口

任务说明见 [任务说明](@task/source-control-sync-all)。

## Why

源代码管理（Source Control）目录标题的操作菜单目前只提供“全部获取远程”；同步（Sync）只能在工作树（Worktree）行的操作菜单逐个点击“同步”。当多个代码库（Repository）或多个工作树（Worktree）都存在上游差异时，用户需要重复同样的点击，容易遗漏某个来源。本变更在目录菜单提供一次性的“全部同步”，按已观察身份依次对每个可同步工作树执行与单条同步完全相同的流程。

无破坏性变更；单条同步、全部获取远程及目录刷新行为保持不变。

## What Changes

- 源代码管理目录标题操作菜单新增“全部同步”项，与“全部获取远程”并列，有可访问名称与键盘操作。
- 前端同步动作支持按已观察目标列表顺序执行：逐个工作树完成完整的同步上下文核对 → 获取（Fetch）→ 必要整合 → 普通推送（Push）流程，不并行发起写入。
- 不可同步对象（来源未就绪、目录离线、无本地分支、无提交、未设置或未确认远端跟踪分支）在本次批次中跳过并保留真实原因；不猜测替代上游。
- 各阶段结果与单条同步一致：全部正常静默，异常或部分失败使用现有短时通知浮窗逐条表达真实阶段结果；结束后按原身份局部重新观察。
- 同一真实 Git 公共目录下已有应用内写入进行中的对象在本次批次中跳过，不与在途写入交错。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `code-worktree-sync`：在现有工作树同步能力上增加由目录操作菜单发起的“全部同步”入口语义——明确按已观察目标、顺序执行、逐条保留结果、跳过不可同步与在途写入对象；单条同步既有语义不变。

## Impact

- 前端：`projects/product/services/buildr-web/src/features/code/pages/CodeSourceControlPage.tsx`（目录菜单新增项）、`src/features/code/hooks/useSourceControlSync.ts`（按已观察列表顺序执行与批次等待状态）；菜单沿用现有 `Dropdown` 组件与图标，不新增依赖。
- 服务端：`projects/product/services/buildr` 的 `code` 模块同步应用不改接口、不新增批量端点；每条同步仍走既有 `sync-context` 与 `sync` 请求。
- 无存储迁移、无协议变更。
