# Change Asset Indexing Specification

## Purpose

定义 Buildr 对已登记项目中进行中与已归档 OpenSpec Change 的安全只读索引、标准产物详情、任务进度和 Agent 操作边界。
## Requirements

### Requirement: Buildr 必须安全索引 Project 的 active 与 archived Change
Buildr MUST 从已登记 Project 的 canonical OpenSpec planning root 生成 Change read model，并 MUST 将 active 与 archived lifecycle 分开表达，不建立第二套持久化状态。

#### Scenario: 列出 active Change
- **WHEN** Project 的 `openspec/changes/<change>` 存在合法 change 目录
- **THEN** Change collection MUST 返回 Project identity、change code、`active` lifecycle、更新时间、artifact availability 和任务进度
- **AND** MUST NOT 因任务全部完成而把 active Change 标记为 archived

#### Scenario: 列出 archived Change
- **WHEN** Project 的 `openspec/changes/archive/<archive-entry>` 存在合法归档目录
- **THEN** Change collection MUST 返回 `archived` lifecycle、稳定 archive reference 和可用的原始 change code
- **AND** MUST 保留 archive entry，不得依赖猜测出的日期或名称定位目录

#### Scenario: Project 没有 OpenSpec planning root
- **WHEN** 已登记 Project 不包含 canonical OpenSpec changes 目录
- **THEN** Change collection MUST 返回空集合
- **AND** MUST NOT 创建目录、运行迁移或把缺失状态报告为读取失败

### Requirement: Change 详情必须按需投影标准 artifacts
Buildr MUST 为单个 Change 返回 identity、lifecycle、任务进度、标准 artifact 内容和 Buildr companion Brief，并 MUST 对 Project、Change 与文件路径执行边界校验。Brief MUST 只从已解析 Change root 内的 `brief.md` 读取，且 MUST 与标准 artifacts 分别表达 availability 和 source path。

#### Scenario: 读取完整 Change
- **WHEN** 请求命中存在的 active 或 archived Change
- **THEN** 详情 MUST 返回 Brief、proposal、design、specs 和 tasks 的可用内容与来源路径
- **AND** specs MUST 使用稳定 capability 与相对路径标识
- **AND** Brief MUST 标识为 Buildr companion artifact，不得伪装成 OpenSpec 标准 artifact

#### Scenario: 读取部分完成 Change
- **WHEN** Change 仅包含部分标准 artifacts 或缺少 Brief
- **THEN** 详情 MUST 明确每类 artifact 和 Brief 是否存在
- **AND** MUST 保留已有内容，不得伪造缺失内容、Brief 或完成状态

#### Scenario: Change reference 非法或不存在
- **WHEN** 请求包含路径穿越、非法 identity 或无法在目标 Project 中解析的 Change reference
- **THEN** Application MUST 拒绝请求或返回 not found
- **AND** MUST NOT 读取 Project planning root 外的文件

#### Scenario: Brief source 越过 Change root
- **WHEN** `brief.md` 路径、符号链接或解析结果越过目标 Change root
- **THEN** Application MUST 将 Brief 报告为不可安全读取并拒绝返回内容
- **AND** MUST NOT 因标准 artifacts 合法而放宽 companion 文件边界

### Requirement: Change 任务进度必须来自只读任务事实
Buildr MUST 只根据 Change 的 `tasks.md` checkbox 计算任务总数和完成数，并 MUST 将未知或缺失任务文件与零任务区分。

#### Scenario: tasks 包含完成与未完成项
- **WHEN** `tasks.md` 同时包含 `- [x]` 与 `- [ ]` 任务
- **THEN** read model MUST 返回准确的 complete、total 和 remaining 数量

#### Scenario: tasks 文件缺失
- **WHEN** Change 不包含 `tasks.md`
- **THEN** read model MUST 标记 tasks artifact 不存在
- **AND** MUST NOT 把缺失任务文件解释为已完成

### Requirement: Change 生命周期操作必须交给 Agent
Buildr MUST 为 Change 创建、继续与审阅生成完整 Agent prompt，并 MUST NOT 从本机应用直接创建、修改、apply、sync 或 archive OpenSpec change。

#### Scenario: 创建 Change prompt
- **WHEN** 用户在 Change 管理页面选择所属 Project 并描述目标
- **THEN** Application MUST 生成要求 Agent 核对 scope、选择 worktree、使用 OpenSpec propose 并验证状态的完整 prompt
- **AND** 生成 prompt MUST 零写入

#### Scenario: 继续或审阅 Change prompt
- **WHEN** 用户对已存在 Change 选择继续或审阅
- **THEN** Application MUST 生成包含 Project、change identity、当前 lifecycle 和目标 action 的完整 prompt
- **AND** prompt MUST 要求 Agent 读取真实 artifacts 和当前状态后再决定下一步

#### Scenario: archived Change 请求继续
- **WHEN** 用户对 archived Change 生成 Agent prompt
- **THEN** prompt MUST 明确该 Change 已归档
- **AND** MUST 要求 Agent 判断是只读审阅还是创建后续 Change，不得直接修改历史归档

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

### Requirement: Task-scoped Change 投影不得改变全局 retained 索引
Buildr MUST 只在明确 Task context 的引用校验和详情读取中使用 task-scoped Change resolution。Workspace 全局 Change collection MUST 继续只从 retained Project canonical OpenSpec root 索引 active/archived Change，不得扫描全部 Task Environments 或把未集成候选混入全局列表。

#### Scenario: 全局列出 Change
- **WHEN** 用户打开 Workspace/Project 全局 Change 页面或调用既有 Change collection
- **THEN** collection MUST 保持 retained-only active/archived 结果
- **AND** MUST NOT 因某个任务环境存在 candidate 而新增、替换或隐藏全局条目

#### Scenario: 从 Task 详情打开关联 Change
- **WHEN** 用户从 `/workspaces/:workspaceId/tasks/:taskId` 打开某个 `{project, change}` 引用
- **THEN** Local App MUST 使用 Task ID 调用 task-scoped detail route，并展示 candidate/retained/archived/unavailable provenance
- **AND** HTTP/Web MUST 复用共享 Resolver，不得实现第二套 root selection 或直接解析 Environment Receipt

#### Scenario: 候选集成到 retained source
- **WHEN** task-environment candidate 已进入 retained Project 且任务环境副本随后清理
- **THEN** 同一 `{project, change}` 逻辑引用 MUST 自然解析为 retained active 或 archived Change
- **AND** Task Record MUST NOT 因来源切换而改写引用或保存历史 checkout path

### Requirement: Task-scoped Change 审查必须路由到 Planning Review
Buildr MUST 根据是否存在明确 Task context 区分正式 Task Planning Review 与普通 Change review。Task-scoped Change detail 的审查 action MUST 携带 Task ID、限定 `project/change` 与 `reviewType: planning` 路由到 `task-review`；Workspace 全局 Change collection/detail MUST 继续只生成普通只读 Change review prompt。

#### Scenario: 从 Task 详情审查关联 Change
- **WHEN** 用户从 `/tasks/:taskId/changes/:project/:change` 发起审查
- **THEN** Agent action MUST 要求先恢复正式 Task、使用 Task-scoped Resolver 读取该 Change、确认明确 plan target identity并执行 Planning Review
- **AND** 完整结束后 MUST 只通过 Task Review Application 记录 Planning Result

#### Scenario: 从全局 Change 目录审查
- **WHEN** 用户从 retained-only Workspace Change list/detail 发起审查且没有 Task context
- **THEN** 现有普通 Change review prompt MUST 保持只读且不创建 Task Review Result
- **AND** 全局 Change collection MUST 不扫描 Task Environments

#### Scenario: task-environment Change 暂时不可用
- **WHEN** Task-scoped Resolver 返回 unavailable 或 identity conflict
- **THEN** Planning Review action MUST fail closed 并报告 Resolver diagnostic
- **AND** MUST 不回退到同名 retained/global Change 或由请求 path 选择副本
