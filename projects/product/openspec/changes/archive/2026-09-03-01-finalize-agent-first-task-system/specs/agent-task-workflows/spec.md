## MODIFIED Requirements

### Requirement: task-manager Skill 必须作为 Buildr Web 与 CLI 共享的 Task Record 薄管理入口
Buildr MUST交付现有`task-manager` workspace Skill作为`buildr.task-record/v3`默认provider，指导Agent创建、读取和维护正式Task Record。`task-manager` MUST不成为全局任务dispatcher或父任务流程总管。Buildr Web MUST作为同一Task Record Application的独立人类客户端；任一客户端 MUST不直接访问SQLite或migration scripts。

#### Scenario: 用户明确管理正式 Task
- **WHEN** 用户要求创建、查看、更正、完成或放弃正式Task
- **THEN** Agent MUST使用`task-manager`并先读取当前Task与digest
- **AND** 后续Review、Verification、Git、Worktree、发布和收尾 MUST继续由各自能力负责

#### Scenario: 用户按 Task ID 继续工作
- **WHEN** 用户或Agent提供已有Task ID并要求继续
- **THEN** `task-manager` MUST先inspect canonical Task Record
- **AND** MUST不从Task Record推断工作位置、Git、验证或交付事实

#### Scenario: 人先在 Buildr Web 创建 Task
- **WHEN** 用户查找Buildr Web任务创建入口
- **THEN** 页面 MUST不提供创建入口并引导交给Agent表达目标
- **AND** Agent创建后页面 MUST读取同一Task Record事实

#### Scenario: 普通任务请求
- **WHEN** 用户只提出实现、文档、测试、讨论或探索
- **THEN** `task-manager` MUST不因出现“任务”一词自动创建正式记录
- **AND** Agent MUST先判断是否需要长期Task事实

#### Scenario: Skill 返回存储细节
- **WHEN** Task action成功或blocked
- **THEN** Skill MUST只报告业务结果、digest、effects与diagnostic
- **AND** MUST不要求用户编辑SQLite或migration ledger

#### Scenario: Buildr Web修改Task
- **WHEN** 用户在Buildr Web编辑、完成或放弃已有Task
- **THEN** 页面 MUST调用与CLI相同的Application和当前digest保护
- **AND** MUST不通过Skill routing写记录或维护第二状态机

### Requirement: Buildr Web、人、Agent 与产品必须分担语义和确定性逻辑
人 MUST负责目标、约束、授权和验收；Agent MUST负责判断是否形成正式Task、组合技能与工具并重新观察现场；Skill MUST提供方法指导；Task Record Application MUST只负责schema、引用、关系、状态、系统时间、digest冲突和具体写入安全。Buildr Web MUST只查看和直接操作同一Application事实。

#### Scenario: 创建Task
- **WHEN** Agent确认工作需要长期任务记录
- **THEN** Agent MUST形成title、intent与scope并调用create
- **AND** Application MUST不创建Environment、Change、Review、Verification或Git资源

#### Scenario: 创建与更新参数
- **WHEN** Agent已确认创建或修改Task顶层事实
- **THEN** Agent MUST只提供明确业务参数与适用digest
- **AND** Application MUST生成系统字段并拒绝非法组合

#### Scenario: 修改已有Task
- **WHEN** CLI或Buildr Web提交明确业务字段和当前digest
- **THEN** Application MUST原子验证并写入
- **AND** 任一客户端 MUST不提交完整next-state或专业结果

#### Scenario: 人通过 Buildr Web 管理 Task
- **WHEN** 人在Buildr Web编辑、完成或放弃已有Task
- **THEN** 页面 MUST收集明确业务字段并调用同一Application
- **AND** MUST不执行Git、测试、部署或资源清理

#### Scenario: 专业模块返回事实
- **WHEN** Review、Verification、Git、Worktree、发布或其他owner返回结果
- **THEN** Task Record MUST不复制其path、revision、状态或证据
- **AND** 只有Task业务事实实际变化时才调用Task Record mutation

### Requirement: 协作者更新必须与本地 self-bootstrap activation 排他路由
Buildr Agent workflow MUST把远端协作者提交导致canonical Workspace前进、但当前工作没有matching Buildr Task delivery结果的情况归类为普通Workspace update。`buildr-self-bootstrap-sync` MUST只消费明确Task、真实delivered ref、retained checkout与Product Node/Doctor事实，不得从commit author、HEAD、dirty tree或缺失Task猜测适用性。

#### Scenario: 普通协作者更新
- **WHEN** selected Git provider证明canonical checkout因remote提交而前进且没有matching自举任务交付
- **THEN** Agent MUST按普通Workspace update运行适用Doctor/sync
- **AND** MUST不启动`buildr-self-bootstrap-sync`

#### Scenario: 协作者提交使 canonical tree 前进且本地没有匹配 Finish
- **WHEN** canonical tree因协作者提交前进且没有matching当前Task交付
- **THEN** 该事实 MUST按普通Workspace update处理
- **AND** 旧Finish Result缺失 MUST不被视为异常

#### Scenario: 协作者更新只造成当前 Agent managed projection stale
- **WHEN** Doctor只报告当前Agent受管投影stale
- **THEN** Agent MUST按Workspace sync边界处理
- **AND** sync结果 MUST不创建Task或自举证据

#### Scenario: Doctor 报告非 workspace sync blocker
- **WHEN** Doctor报告不能由sync处理的具体问题
- **THEN** Agent MUST交给对应owner处理
- **AND** MUST不把一次sync宣称为完整修复

#### Scenario: matching自举交付
- **WHEN** 当前工作具有明确Task、已核验delivered ref和命中Product自举范围的真实变化
- **THEN** Agent MAY调用唯一self-bootstrap runner
- **AND** runner失败 MUST只形成Activation Attention，不撤销交付或Task结果

#### Scenario: 当前会话存在 matching Formal Finish Result
- **WHEN** 历史调用方只提供旧Formal Finish Result而没有当前Task与Git交付事实
- **THEN** self-bootstrap MUST不采用该历史Result
- **AND** 调用方 MUST改用当前Task、delivered ref与retained事实

#### Scenario: workspace sync 不产生 Task 或 Finish authority
- **WHEN** 普通Workspace update执行sync
- **THEN** sync MUST只收敛Workspace与Agent runtime
- **AND** MUST不创建Task、Verification、Finish或self-bootstrap结果

### Requirement: 内置场景化 Skills 必须围绕真实产物协作
Buildr内置Task与OpenSpec Skills MUST让Agent依据目标和真实现场按需选择Task Record、Current Knowledge、Review、Verification、Git、Worktree、具体资源owner与默认task-finish能力，不得路由已退役工作流。

#### Scenario: 普通实现达到可交付状态
- **WHEN** Agent已完成实现并取得任务所需的实际检查结果
- **THEN** Agent MUST可直接进入适用的审查、验证或交付动作
- **AND** MUST不创建Task Environment、Task Candidate、generation或Development Handoff

## REMOVED Requirements

### Requirement: squash 发布候选以 tree identity 幂等衔接回 dev
**Reason**: 发布身份链由release专属规范维护；本条混入旧Formal Finish和Environment依赖。
**Migration**: 使用release collection、main reconciliation与open source release规范。

### Requirement: Workspace 可以通过 Skill Contribution 扩展 Task Finish 后续维护
**Reason**: 条款依赖Formal Finish run、resume token和冻结Task Contribution。
**Migration**: Buildr自举由独立`buildr-self-bootstrap-sync` Skill基于当前Task与Git事实执行。

### Requirement: 通用 Task Finish 不得执行 Buildr development 产品安装
**Reason**: 条款描述已删除Task Finish Application与五阶段run。
**Migration**: 默认task-finish是Skill-only组合；自举由独立Skill负责。

### Requirement: Task Finish v2 delivered证明必须兼容旧安装字段但解除其门禁权责
**Reason**: `buildr.task-finish-result/v2`和terminal reader已删除。
**Migration**: 交付从Git、文件、部署或外部系统重新观察。

### Requirement: self-bootstrap 最终候选验证必须按实质身份变化重建或复用 evidence
**Reason**: 条款依赖Content Target、Task Candidate和旧validation store模型。
**Migration**: 当前self-bootstrap runner核对实际delivered ref、retained source、Node和Doctor。

### Requirement: Formal Finish 成功后的 Buildr Web 自举 activation 失败不得改写研发与交付事实
**Reason**: Formal Finish、Environment retained Node和研发交接均已删除。
**Migration**: 自举失败只形成Activation Attention，交付由Git事实保持成立。
