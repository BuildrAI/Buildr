## ADDED Requirements

### Requirement: 共享登记列表拒绝临时根
共享 Profile 的 Workspace 登记列表 MUST 只登记长期真实 Workspace root。当实例的 Web 数据根未被 `BUILDR_APP_DATA_DIR` 或等价覆盖隔离（即写入共享 Profile 登记文件）时，登记入口 MUST 拒绝以下一次性位置：操作系统临时目录或其下任何路径、`/tmp` 与其符号链接目标下的路径、以及路径位于任一 `.worktrees/` 目录内的任务工作树（Worktree）检出。隔离数据根（预览实例、显式覆盖与测试环境）MUST 继续允许登记其目标，包括临时位置。

#### Scenario: 共享登记拒绝临时目录
- **WHEN** 通过共享 Profile 实例登记位于系统临时目录或 `/tmp` 下的 Workspace
- **THEN** Application MUST 以明确错误码拒绝登记，说明该位置为一次性目录
- **AND** 登记列表 MUST 保持不变

#### Scenario: 共享登记拒绝任务工作树检出
- **WHEN** 通过共享 Profile 实例登记位于 `.worktrees/` 下的 Workspace
- **THEN** Application MUST 以明确错误码拒绝登记
- **AND** 错误信息 MUST 提示使用 Task Preview 或等价隔离入口

#### Scenario: 隔离数据根可登记临时位置
- **WHEN** 预览实例或其他设置了隔离数据根的进程登记位于临时目录的 Workspace
- **THEN** 登记 MUST 写入该实例自身的登记列表并正常返回

### Requirement: 预览登记列表合并共享条目
持有 `buildr.local-app-preview` owner identity 且数据根已隔离的 Preview 实例，其 Workspace 登记查询 MUST 返回本预览登记列表与共享 Profile 登记列表的合并结果；共享条目标记为只读来源。预览中的移除操作 MUST 只作用于本预览登记列表；目标仅存在于共享列表时 MUST 返回明确诊断而不是静默成功或"未登记"。共享登记文件缺失或损坏 MUST NOT 阻止预览展示本预览登记条目。

#### Scenario: 预览列表可见共享工作空间
- **WHEN** 共享 Profile 已登记真实 Workspace，预览实例启动并查询登记列表
- **THEN** 返回结果 MUST 同时包含共享条目（标记共享来源）与本预览登记条目
- **AND** revision MUST 仍指向本预览登记文件

#### Scenario: 预览移除共享条目返回诊断
- **WHEN** 在预览实例中请求移除仅存在于共享 Profile 登记列表的 Workspace
- **THEN** Application MUST 返回明确诊断说明该条目属于共享登记列表
- **AND** 共享登记文件 MUST 保持不变
