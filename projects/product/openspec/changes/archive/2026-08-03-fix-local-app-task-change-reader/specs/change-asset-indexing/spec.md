## MODIFIED Requirements

### Requirement: Task-scoped Change 引用必须从受信任任务范围解析
Buildr MUST 提供任务范围 Change 引用解析器（Task-scoped Change Reference Resolver），以 canonical Workspace、Task ID 与限定 `project/change` 为唯一调用身份，并 MUST 通过 Task Environment 的只读 port 获取匹配 Project scope 的实际执行根。Resolver MUST NOT 信任请求 filesystem path、server cwd、branch、remote 或 worktree 名，也 MUST NOT 建立第二套持久 Change 状态。

#### Scenario: Change 只存在于 Task Environment
- **WHEN** matching active Task Environment 的 Project 执行根包含合法 active 或 archived Change，而 retained Project 尚无该 Change
- **THEN** task-scoped resolution MUST 返回该 Change 的真实 lifecycle 与 `task-environment candidate` provenance
- **AND** MUST 使用与 canonical Change indexing 相同的 path/symlink/artifact 安全校验

#### Scenario: Task Environment 与 retained 同时存在同名 Change
- **WHEN** matching task Project root 与 retained Project canonical root 都包含同名 active Change
- **THEN** task-scoped resolution MUST 将任务环境副本作为当前 Task working copy，并把 retained 副本作为 `retained baseline` provenance 分开返回
- **AND** MUST NOT 合并 artifacts、覆盖其中一份或把两份误报为两个 Task Record 引用

#### Scenario: 安装版 Local App 读取 candidate-only Change
- **WHEN** 安装版 Local App 的 product sourceRoot 不同于 matching Receipt controller，且该 Task Environment Project execution root 含有 retained Project 不存在的合法 Change
- **THEN** Task-scoped detail route MUST 通过共享 Resolver 返回该 Change 与 `task-environment candidate` provenance
- **AND** MUST NOT 仅因 Local App bundle root 与 controller sourceRoot 不同而回退到 retained Project

#### Scenario: Task Environment 副本不可用
- **WHEN** Task 没有 matching Environment Receipt、当前机器没有该执行根，或 Environment inspect 无法证明 Project scope
- **THEN** Resolver MUST 只回退到 retained Project canonical root，并 MAY 返回 active 或 archived Change
- **AND** retained 也不可解析时 MUST 返回稳定 unavailable/not-found diagnostic，不得猜测路径或创建目录

#### Scenario: 请求提交文件系统位置
- **WHEN** task-scoped Change 请求包含 `target`、`root`、`path`、cwd 或其他未登记位置提示
- **THEN** interface MUST 在读取 Change artifacts 前拒绝请求
- **AND** Resolver MUST 只从 Workspace registry、Task identity、Environment read port 与 Project registry 构造安全候选根
