## MODIFIED Requirements

### Requirement: 共享登记列表拒绝临时根
共享 Profile 的 Workspace 登记列表 MUST 只登记长期真实 Workspace root。是否属于共享登记范围 MUST 按本次写入的登记文件是否就是该 Profile 的共享长期登记文件来决定，按文件真实身份判定并归一符号链接，MUST NOT 以是否设置 `BUILDR_APP_DATA_DIR` 或等价覆盖变量作为判据。当写入目标即共享 Profile 登记文件时，登记入口 MUST 拒绝以下一次性位置：操作系统临时目录或其下任何路径、`/tmp` 与其符号链接目标下的路径、以及路径位于任一 `.worktrees/` 目录内的任务工作树（Worktree）检出。当写入目标是与共享登记文件不同的隔离数据根（预览实例、指向独立目录的显式覆盖与测试环境）时，MUST 继续允许登记其目标，包括临时位置。即使设置了覆盖变量，只要其指向共享 Profile 数据根，仍 MUST 按共享范围拒绝临时位置。

#### Scenario: 共享登记拒绝临时目录

- **WHEN** 通过写入共享 Profile 登记文件的实例登记位于系统临时目录或 `/tmp` 下的 Workspace
- **THEN** Application MUST 以明确错误码拒绝登记，说明该位置为一次性目录
- **AND** 登记列表 MUST 保持不变

#### Scenario: 共享登记拒绝任务工作树检出

- **WHEN** 通过写入共享 Profile 登记文件的实例登记位于 `.worktrees/` 下的 Workspace
- **THEN** Application MUST 以明确错误码拒绝登记
- **AND** 错误信息 MUST 提示使用 Task Preview 或等价隔离入口

#### Scenario: 覆盖变量指向共享数据根仍拒绝临时目录

- **WHEN** 进程设置了 `BUILDR_APP_DATA_DIR` 且其值指向共享 Profile 数据根，登记位于临时目录的 Workspace
- **THEN** Application MUST 以共享范围拒绝登记，错误码为 `workspace_registry_ephemeral_root`
- **AND** 共享登记列表 MUST 保持不变

#### Scenario: 隔离数据根可登记临时位置

- **WHEN** 预览实例或其他写入目标不同于共享登记文件的隔离进程登记位于临时目录的 Workspace
- **THEN** 登记 MUST 写入该实例自身的登记列表并正常返回
- **AND** 共享登记文件 MUST 保持不变
