## ADDED Requirements

### Requirement: task preview 启动必须可调用且目标解析一致

`buildr web preview start <instance> --task <task-id>` 与对应 `stop` MUST 在组合好的运行时中直接可执行；target 为 canonical workspace 根或该任务的 linked worktree 根时 MUST 归一到同一证据身份并解析出同一工作树。runtime 端口缺失、workspace 未初始化或工作树证据不可用 MUST 按既有 codedError 语义失败并给出明确诊断与 nextActions，MUST NOT 以运行时类型错误（如 `is not a function`）作为最终失败。

#### Scenario: canonical 目标启动任务预览

- **WHEN** Agent 提供 `--task` 且 `--target` 为 canonical workspace 根
- **THEN** 预览 MUST 从匹配工作树证据指向的 checkout 内 Buildr Product 入口启动
- **AND** owner MUST 记录 taskId、canonical workspace、证据路径与 planDigest

#### Scenario: 工作树目标启动任务预览

- **WHEN** `--target` 直接指向该任务的 linked worktree 根
- **THEN** 预览 MUST 解析到与 canonical 目标一致的证据与工作树 checkout
- **AND** MUST NOT 因目标拼写形式报工作树不可读取

### Requirement: task preview 必须保证任务数据可读

以工作树为服务目标的 `--task` 预览 MUST 让该 worktree 的本地结构化存储可读：目标 `.buildr/local/workspace.sqlite` 缺失时 MUST 从 canonical workspace 播种一份一致的 SQLite 副本（backup 语义，不共享文件句柄、不回写 canonical）；已存在时 MUST 复用并不覆盖。播种或复用结果 MUST 在启动结果中如实表达，供 Agent 判断数据时点。canonical 任务库为唯一数据权威，预览内写入只落在该工作树副本上。

#### Scenario: 首次启动播种快照

- **WHEN** 目标工作树没有本地 workspace.sqlite
- **THEN** 预览 MUST 从 canonical workspace 生成一致副本并继续启动
- **AND** 结果 MUST 标识本次数据为指定时点的快照来源

#### Scenario: 已存在本地副本复用

- **WHEN** 目标工作树已有本地 workspace.sqlite
- **THEN** 预览 MUST 复用现有副本
- **AND** MUST NOT 静默以 canonical 最新数据覆盖

#### Scenario: canonical 库不可读

- **WHEN** 需要播种而 canonical workspace.sqlite 缺失或损坏
- **THEN** 预览启动 MUST fail closed 并报告数据不可准备
- **AND** MUST NOT 创建空库冒充任务数据

## MODIFIED Requirements

### Requirement: task worktree 必须支持隔离的 Buildr Web 预览实例

Buildr MUST提供`buildr web preview start <instance>`，让Agent从指定Task Worktree或独立Git checkout的Buildr Product入口启动或复用独立loopback Preview。实例名 MUST通过稳定安全校验；Preview MUST使用独立于默认Buildr Web和其他Worktree的状态目录、Workspace registry、实例记录与启动锁，并默认随机选择可用端口。Task-owned preview 的可执行性、目标归一与数据可读性按本 capability 的对应要求约束。

#### Scenario: 启动两个不同任务预览

- **WHEN** 两个不同Task Worktrees分别使用不同实例名启动Preview
- **THEN** Buildr MUST让两个健康实例同时监听各自loopback URL
- **AND** 两个Preview MUST NOT复用实例记录、启动锁或Workspace registry，默认Buildr Web保持不受影响

#### Scenario: 同一Task Worktree复用健康预览

- **WHEN** 同一Task、Workspace、Worktree evidence与Product checkout使用相同实例名再次启动健康Preview
- **THEN** Buildr MUST复用原实例并返回同一URL与owner identity
- **AND** MUST NOT额外启动第二个进程

#### Scenario: 不同Task Worktree请求已被占用的实例名

- **WHEN** 健康Preview的Task、Workspace或Worktree owner与新请求不一致
- **THEN** Buildr MUST拒绝复用或停止该Preview
- **AND** MUST返回当前owner并要求更换实例名或由真实owner停止
