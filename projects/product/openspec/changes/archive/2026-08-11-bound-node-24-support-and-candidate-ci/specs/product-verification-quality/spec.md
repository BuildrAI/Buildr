## MODIFIED Requirements

### Requirement: CI 必须覆盖最低 Node、当前 Node 和目标桌面平台
Buildr CI MUST 将任务分支的 Windows 平台预检与最终候选验证分开；合入 `dev` 前 MUST 在 Windows Node 24.15.0 和当前 Node 24 上运行定向平台预检，最终候选 MUST 在 macOS、Windows Node 24.15.0 和当前 Node 24 上运行四个完整产品候选验证。矩阵 MUST 禁用 fail-fast，且 CI MUST NOT 为已经由完整 Candidate 覆盖的相同 release lifecycle 建立独立 release smoke job。

#### Scenario: 任务分支验证 Windows 平台边界
- **WHEN** pull request 以 `dev` 为目标触发产品 CI
- **THEN** Windows Node 24.15.0 和当前 Node 24 job MUST 安装锁定依赖和支持的 OpenSpec CLI
- **AND** 两个 job MUST 运行覆盖路径身份、子进程启动、runtime 文件一致性、Task/worktree 生命周期和发布包生命周期的定向平台预检
- **AND** 任一 job 失败 MUST NOT 取消另一个 job
- **AND** CI MUST NOT 为该任务分支重复运行完整 macOS/Windows Candidate 矩阵

#### Scenario: 验证最低 Node 版本
- **WHEN** `dev -> main` pull request、手工候选验证或 `main` push 触发最终候选 CI
- **THEN** macOS、Windows Node 24.15.0 MUST 各自运行完整 `test:candidate`
- **AND** 两个最低版本 job MUST 安装锁定依赖和支持的 OpenSpec CLI

#### Scenario: 验证当前 Node 与桌面平台
- **WHEN** `dev -> main` pull request、手工候选验证或 `main` push 触发最终候选 CI
- **THEN** macOS、Windows 当前 Node 24 MUST 各自运行完整 `test:candidate`
- **AND** 四个最低/当前 Node 矩阵 job MUST 使用同一冻结提交并保留各自完整失败证据
- **AND** 任一矩阵 job 失败 MUST NOT 取消其他矩阵 job

#### Scenario: 最终候选复用内置发布冒烟
- **WHEN** 四个完整 Candidate job 运行
- **THEN** 每个 job MUST 通过 Candidate 内置的 `release-tarball-smoke` 验证打包、安装和 CLI 生命周期
- **AND** workflow MUST NOT 建立覆盖相同 lifecycle 的独立 macOS 或 Windows `release-smoke` job
