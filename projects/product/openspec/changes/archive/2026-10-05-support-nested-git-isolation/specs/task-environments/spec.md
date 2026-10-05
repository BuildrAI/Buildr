## ADDED Requirements

### Requirement: 非 Git 根内的独立代码库必须按真实边界隔离

Git 工作树提供者（Provider）MUST 支持已确认非 Git 的工作空间（Workspace）根内明确选择的独立 Git 代码库（Repository），保持完整预检、共享去重、窄证据、当前身份与交付保全条件。未选来源 MUST NOT 自动加入；证据 MUST 保存在实际参与来源的 Git 公共目录（Common Directory），保持完整组身份；发现与关联读取 MUST NOT 要求根自身属于 Git，也 MUST NOT 新增任务状态或复制资料。

#### Scenario: 非 Git 根内显式选择两个独立来源

- **WHEN** 根已确认非 Git，任务明确选择多个服务（Service）且其实际来源属于两个独立 Git 代码库（Repository）
- **THEN** 提供者（Provider）MUST 只创建两份对应规范来源层级的工作树（Worktree），共享引用去重，不创建 `workspace` 项或初始化根 Git；同源且明确选择项目（Project）时 MUST 保留其完整项目候选语义，不受选择顺序影响
- **AND** 无远端但有本地集成引用的代码库（Repository）MUST 使用真实登记的集成起点

#### Scenario: 发现证据与关联查询

- **WHEN** 合法组证据保存在参与来源的公共目录（Common Directory），根没有 Git
- **THEN** 创建重试、检查、任务提交与代码工作树（Worktree）查询 MUST 读取同一真实组并保留任务关联
- **AND** 发现其他来源的登记 MUST NOT 自动改变本次参与集合；多个组记录或身份冲突 MUST 显式诊断；证据读取不完整时 MUST 保留真实 Git 目录且不得声称唯一任务归属

#### Scenario: 仅子代码库的无历史恢复

- **WHEN** 历史证据缺失，调用方提供仅含明确独立来源的完整当前对象集合及适用交付版本
- **THEN** 提供者（Provider）MUST 逐项核验实际 Git 身份、规范嵌套关系、登记、占用和完整集合，按已有删除安全检查接续
- **AND** MUST 保持观察起点未知，不补造历史记录，不以缺少 `workspace` 项拒绝合法集合；遗漏同组兄弟或嵌套 Git 来源 MUST 拒绝删除

#### Scenario: 资料与健康来源不受无关坏来源阻塞

- **WHEN** 一个已登记 Git 来源缺失、损坏、身份未知或落在错误父代码库（Repository），但资料及另一个明确来源可核验
- **THEN** 包含坏来源的创建 MUST 在完整预检阶段拒绝且没有 Git 创建效果，不能把坏来源当作非 Git
- **AND** 独立资料维护及只选择健康来源的隔离 MUST 继续按自身边界执行

#### Scenario: 清理保留非 Git 成果与预览边界

- **WHEN** 子代码库（Repository）的逐仓成对源与交付版本及其他删除条件均成立
- **THEN** 清理 MUST 只处理任务所有的 Git 检出、本地任务分支（Branch）与组证据，保留非 Git 组目录内的资料
- **AND** 已确认非 Git 的项目资料 MUST 继续从真实项目根读取；项目实际属于 Git 或身份未知时 MUST NOT 用保留根替代缺失的候选根；项目中位于已选服务（Service）来源内的代码资料 MUST 使用对应候选且不得在缺失或失效时回退原文件
- **AND** 仅子来源的组目录 MUST NOT 被当作完整工作空间（Workspace）；依赖完整根的预览（Preview）MUST 返回局部范围诊断

## MODIFIED Requirements

### Requirement: 工作树证据身份必须归一 linked checkout 目标

Git Worktree provider 在解析任务工作树证据与检查身份时，MUST 把作为目标传入的 linked task worktree 根归一到其 canonical checkout 身份，使 canonical workspace 根与工作树根产生一致的证据解析结果。已确认非 Git 且没有相关独立代码库（Repository）证据的目标，或其他无证据目标，MUST 保持既有 `git_worktree_evidence_missing` 类诊断；归一 MUST NOT 改变 evidence 中登记的 workspaceRoot、checkoutPath 或 repository selector 语义，MUST NOT 凭 `.worktrees/` 目录名猜测归属。

#### Scenario: 以工作树根执行 inspect

- **WHEN** `worktree inspect`（或依赖同一 provider 的读取方）的 target 是某任务的 linked worktree 根
- **THEN** provider MUST 按该 checkout 所属的 canonical evidence 解析并返回同一仓库集合
- **AND** MUST NOT 因目标拼写差异返回身份不匹配或证据缺失

#### Scenario: 目标不属于任何登记的 checkout

- **WHEN** target 是 Git 管理的普通目录但不是 canonical 根也不是登记的 task worktree
- **THEN** provider MUST 沿用既有缺证据诊断
- **AND** MUST NOT 猜测任务归属或读取其他任务的 checkout
