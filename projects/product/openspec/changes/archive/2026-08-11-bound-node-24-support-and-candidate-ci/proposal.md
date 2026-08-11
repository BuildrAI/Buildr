## Why

当前候选发布把四个平台/Node完整回归和两个重复发布包冒烟作业同时用作开发反馈，Windows 平台缺陷只能在长周期发布 CI 中逐层暴露，导致每次修复都重新消耗完整矩阵。与此同时，`engines.node: >=24.15.0` 会无条件承诺尚未适配的未来 Node 主版本，与实际只验证 Node 24 的事实不一致。

## What Changes

- 为合入 `dev` 前的任务分支提供 Windows Node 24.15.0/24.x 定向平台预检，集中覆盖路径身份、子进程启动、runtime 文件语义、Task/worktree 生命周期和发布包生命周期。
- 最终候选验证保留 macOS/Windows × Node 24.15.0/24.x 四个完整 `test:candidate` 作业，并删除两个覆盖重复的独立 `release-smoke` 作业；四个完整作业继续通过 Candidate 内置 `release-tarball-smoke` 验证打包、安装和 CLI 生命周期。
- **BREAKING**：npm/开发入口支持范围收紧为 `>=24.15.0 <25`；受管 Workspace runtime 继续固定精确版本 24.15.0，未来 Node 主版本须经独立适配和验证后再加入支持范围。
- 统一 Windows 文件系统身份、Node 脚本启动、路径断言和可执行权限语义，并增加防止再次绕过统一入口的回归约束。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`：区分任务分支 Windows 平台预检与最终候选四矩阵，删除没有新增覆盖面的独立冒烟作业。
- `workspace-node-toolchain`：明确 npm/开发入口只支持 Node 24.15.0 至 25 之前，未来主版本不自动承诺。

## Impact

- GitHub Actions：`.github/workflows/verify.yml` 的触发分层、矩阵和重复作业。
- npm 兼容声明与安装入口：`package.json`、`package-lock.json`、开发 CLI 安装检查和公开说明。
- Windows 平台实现与测试：Git worktree 身份、self-bootstrap runner、Task Finish fixture、runtime adapter reconciliation、CLI/launcher 断言。
- Product canonical specs、current knowledge、发布清单和候选验证证据。
