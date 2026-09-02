## Why

统一任务环境（Task Environment）把工作树、依赖准备、运行时、预览资源和清理聚合为一个 `ready`，使普通 OpenSpec、审查、验证和收尾依赖并不需要的环境状态。当前真实安全价值来自 Git Worktree 的归属与删除检查，以及 Buildr Web Preview 自己的进程 owner；应先让消费者直接使用这些真实 owner，为最终删除统一 Environment 做准备。

## What Changes

- **BREAKING**：Task Triage、OpenSpec propose/apply/update、Task Review 与 Task Finish 不再把 matching Task Environment 或 `ready` 作为普通工作的前置；Agent直接选择当前工作区或独立 Worktree。
- **BREAKING**：`worktree cleanup` 直接接收逐仓完整 `--expected-source` 与 `--delivered-ref`，由 Worktree provider保护归属、source版本、dirty内容和retained ref；不再要求调用 `task environment cleanup`。
- **BREAKING**：Task-scoped Change 从当前 Worktree evidence定位候选根；没有Worktree时使用retained Project根，不读取Environment current。
- **BREAKING**：正式Task的Buildr Web Preview由Preview Application直接保存并验证Task、Workspace、Worktree、Git与进程owner，不再要求Environment ready或登记Environment resource。
- Task Overview与Buildr Web普通任务展示退出Environment聚合摘要；本Change不删除Environment本体及其专用页签，最终删除由后续独立Change负责。
- 保留和修改的Worktree、Preview、Change、Overview、接口与测试迁到TypeScript；后续确定删除的Environment专属实现不迁移。
- 不改变完整Release流程；Release连接由后续独立Change处理。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: Agent直接选择实际工作位置，OpenSpec、Review、Verification与Finish不再消费统一Environment许可。
- `task-environments`: Worktree与Preview成为独立owner，Environment不再是它们的唯一调用入口或资源登记中心。
- `worktree-buildr-web-preview`: Task Preview改为绑定Worktree与Preview自身owner，并独立启动、检查和停止。
- `direct-git-closeout`: 已核验交付可直接交给Worktree cleanup，保持逐仓版本、dirty与成果保全检查。

## Impact

- Skills、contracts与bindings：Task Triage、Task Finish、Task Review、OpenSpec sidebar、Task Worktree。
- Buildr Service：Git Worktree provider/CLI、Preview lifecycle/CLI、Task-scoped Change、Task Overview、模块装配与public JSON contracts。
- Buildr Web：Task Overview消费与相关API类型；Environment专属页签留到最终删除Change。
- 测试：Worktree、Preview、Change、Overview、CLI/HTTP与capability组合场景。
- 不迁移或删除`task_environment_current`，不改完整Release流程，不发布版本。
