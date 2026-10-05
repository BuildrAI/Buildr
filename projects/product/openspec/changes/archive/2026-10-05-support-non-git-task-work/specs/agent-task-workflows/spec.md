## MODIFIED Requirements

### Requirement: task-triage 必须输出正交且有证据的任务决策
Buildr 的 `task-triage` 技能（Skill）MUST 先核对任务相关事实，再分别判断语义治理、执行形态、材料深度、方案审查（Planning Review）、实现审查（Implementation Review，兼容接口类型 `completion`）和任务验证（Task Verification）的需要；后三项 MUST 根据实际目标、方案、范围、风险与证明需要分别判断，MUST NOT 继承 `change-flow` 的选择。输出 MUST 包含选择、代码库集合（Repository Set，已确认无相关 Git 对象时为 `none`，无法确认时为 `unresolved`）、实际工作位置选择、最小依据、未决冲突和下一动作，并 MUST 只在适用时追加 OpenSpec 或正式任务（Task）状态。任务进度 MUST 由对话、任务记录（Task Record）、父子任务与各专业公开读取模型（Read Model）表达，不得创建第二份看板、环境权威或检查状态库。

#### Scenario: 已有契约的实现任务
- **WHEN** canonical spec已定义目标行为且Agent已核对当前checkout、repository/ref、owned scope与副作用
- **THEN** triage MUST选择`code-only + implementation`，并在首次持久文件修改前按默认隔离策略确定实际工作位置
- **AND** MUST NOT仅因缺少Environment、Plan、Receipt或projection而阻塞编辑、构建或有界测试

#### Scenario: 实现任务需要独立Git位置
- **WHEN** 任务需要修改实际属于 Git 的持久文件，且用户未明确要求在主开发分支修改
- **THEN** triage MUST把明确Workspace、Task ID、branch、start point与repository selectors交给Worktree provider
- **AND** MUST使用provider返回的实际checkout path继续工作，不得把Worktree evidence冒充统一Environment ready

#### Scenario: 独立收敛当前事实文档
- **WHEN** canonical specs、当前实现与registries已能确认现行事实，任务只让current knowledge追上该事实且不进入代码、构建或测试
- **THEN** triage MUST选择`spec-maintenance + metadata-only`
- **AND** MUST使用selected current-knowledge provider的`maintain` operation，不得为既有事实补造OpenSpec Change

#### Scenario: Authority 或执行范围不明确
- **WHEN** 当前动作依赖的事实源、授权、对象归属或实际位置无法确认
- **THEN** triage MUST 对该动作返回 `blocked` 或 `unknown` 并停止对应写入，保留现场并核对最小必要差异
- **AND** 合法任务记录与可独立安全完成的授权分支 MUST 可以继续；未知 Git 身份 MUST NOT 被降级为已确认非 Git，未确认的目标或权限不得通过预写材料绕过

#### Scenario: 无变更任务需要专业检查
- **WHEN** 不采用 OpenSpec 的正式任务存在方案取舍、实现风险或必要完成证明
- **THEN** 智能体（Agent）MUST 独立判断相应审查与验证，并交给各自能力执行
- **AND** MUST NOT 因 `code-only`、`spec-maintenance` 或空 `changes` 而省略需要的检查

#### Scenario: 材料深度与规范变化无关
- **WHEN** 简单任务不改变规范，或复杂任务需要多个规范变更
- **THEN** 每个新正式执行任务 MUST 仍形成真实任务说明（Task Brief），其他材料按实际需要保存
- **AND** MUST NOT 为材料展示强造 OpenSpec Change，也不得为凑齐节点生成占位报告

### Requirement: task-triage 必须通过条件能力依赖交接专业动作
`task-triage` MUST optional 依赖 `buildr.current-knowledge-maintenance/v3` 和 `buildr.git-worktree-provider/v1`，并 MUST 只在相应决策分支执行前读取 contract 与 selected provider；任何 provider 不 ready MUST 只阻塞或降级对应分支，不得使无关 triage 结论不可用。

#### Scenario: Implementation 分支缺少 worktree provider
- **WHEN** triage 已确认当前写入实际需要 Git 隔离，但 `buildr.git-worktree-provider/v1` 未 ready
- **THEN** MUST 只停止依赖该 Git 位置的写入，并报告具体能力诊断与下一动作；已确认独立安全的非 Git 资料工作 MUST 可以继续
- **AND** semantic decision MUST 保持可见

#### Scenario: 当前事实 maintain provider 不可用
- **WHEN** triage 选择独立 `spec-maintenance` 但 `buildr.current-knowledge-maintenance/v3` 未 ready
- **THEN** current knowledge 写入 MUST 停止
- **AND** triage MUST NOT 回退为无 evidence 的直接文档编辑或伪造 Change

#### Scenario: Verification provider 暂时不可用
- **WHEN** triage 只为实现任务规划验证节点
- **THEN** triage MUST NOT 因 `buildr.task-verification/v4` 暂时不可用而阻塞语义和位置判断
- **AND** 实际验证开始前仍 MUST 由相应 consumer 解析 selected verification provider

#### Scenario: 非 Git 资料不消费工作树能力
- **WHEN** triage 已确认相关资料没有 Git 归属，且实际位置、授权及专业工具可核验
- **THEN** 该资料分支 MUST 不消费 Git 工作树（Worktree）能力，不因其不可用而受阻
- **AND** 所属专业能力的授权、版本与失败边界 MUST 继续适用

### Requirement: 实现型 workflow 必须绑定 task execution context
Buildr的Task Triage与OpenSpec Skills MUST在首次持久文件写入前执行默认隔离策略，并核对相关项目（Project）或服务（Service）登记、实际路径、文件归属和授权范围；仅对实际 Git 对象核对检出位置（Checkout）、引用（Ref）与适用工作树证据（Worktree Evidence）。已确认的非 Git 资料 MUST 使用已核对的实际资料位置，不补造 Git 证据。workflow MUST NOT要求matching Environment Receipt、统一`ready`、runtime projection或session adoption作为普通proposal、实现、构建、Review、Verification或交付前置。

#### Scenario: Triage选择实际工作位置后在原对话继续
- **WHEN** triage完成实际工作位置选择，且智能体（Agent）已证明当前任务的适用 Git 位置，或已确认的非 Git 资料位置、目标身份与授权范围适合本任务
- **THEN** workflow MUST在该真实位置继续并重新观察当前文件、版本与适用 Git 事实
- **AND** MUST NOT创建空Environment、Plan或共享根占用记录

#### Scenario: 明确工作目录绑定Worktree
- **WHEN** matching Worktree evidence证明Task、Workspace、repository selector、checkout、branch和registration
- **THEN** workflow MUST只在对应checkout及其明确Project/Service根内写入
- **AND** evidence漂移只阻止依赖该位置的动作，不得撤销已成立的Review、Verification或Delivery

#### Scenario: Execution binding 漂移
- **WHEN** checkout、registry、Worktree evidence或owned scope任一冲突
- **THEN** workflow MUST停止对应写入并保留现场
- **AND** MUST NOT从cwd、分支名、路径相似、旧Receipt或相同HEAD猜测归属

#### Scenario: 只有 retained manager content identity 改变
- **WHEN** 实际checkout、Worktree evidence与owned scope仍匹配，但retained Buildr源码版本已经前进
- **THEN** workflow MUST按当前动作重新观察实际工具入口，不得自动改写Task checkout
- **AND** MUST NOT仅因工具版本变化而失效Review、Verification或已成立Delivery

#### Scenario: 非 Git 规划、实施和规范收敛
- **WHEN** 对应 OpenSpec 文件已确认没有 Git 归属且当前工作位置与规范来源可核验
- **THEN** 各入口 MUST 共同使用该实际位置，保留当前材料与来源版本核对
- **AND** MUST NOT 要求 Git 基线、变基（Rebase）或工作树证据（Worktree Evidence），也不得因此创建仓库

### Requirement: 持久文件改动默认隔离
任务分流技能（task-triage）MUST 在首次持久文件修改前按真实路径、资产责任及实际 Git 归属选择安全位置。实际 Git 文件 MUST 默认创建或复用当前任务的独立工作树（Worktree），仅用户明确要求主开发分支修改时采用该位置；已确认的非 Git 资料 MUST 在已授权、已核对的实际位置使用所属专业工具维护，不初始化仓库或补造工作树证据。身份未明、登记要求的仓库缺失、路径替换或观察失败 MUST NOT 被当作非 Git 例外。代码、文档、配置、规则（Rule）、技能（Skill）、模板和 OpenSpec 材料共同遵守此判断；专业应用维护的本机状态仍由其产品动作负责。工作树技能（task-worktree）MUST 只管理实际 Git 位置及安全清理，现有契约保持不变。

#### Scenario: 主开发分支干净时开始小改动
- **WHEN** 用户要求修改一个文件，当前位于没有未提交改动的主开发分支，未明确要求原地修改
- **THEN** 智能体（Agent）MUST 在首次文件写入前创建或复用当前任务的独立工作树（Worktree）

#### Scenario: 纯文档或规划修改
- **WHEN** 用户仅要求修改实际属于 Git 的文档、技能（Skill）或 OpenSpec 规划材料
- **THEN** 对应入口 MUST 执行同一默认隔离策略，不能以不修改代码为由跳过

#### Scenario: 复用当前任务位置
- **WHEN** 已有工作树（Worktree）可证明属于同一任务、仓库、分支及登记身份
- **THEN** 智能体（Agent）MUST 检查并复用该位置，保留当前任务未提交成果，不因新轮次或阶段转换重复创建
- **AND** 另一个任务的位置 MUST NOT 因分支名称或相同提交而被复用

#### Scenario: 用户明确要求主开发分支修改
- **WHEN** 用户已明确要求本任务在主开发分支修改，且对象、范围和副作用未变
- **THEN** 智能体（Agent）MUST 核对当前引用、文件归属及覆盖风险后在该位置继续，无需重复取得相同授权
- **AND** 仅授权实现或同意方案 MUST NOT 被解释为主开发分支写入例外

#### Scenario: 主目录存在其他任务改动
- **WHEN** 主目录存在与本任务无关的未提交文件，已确认提交可作为本任务起点
- **THEN** 智能体（Agent）MUST 保留这些文件并从已确认提交创建独立工作树（Worktree），不要求先提交、暂存或清空其他任务内容
- **AND** 创建成功 MUST NOT 被解释为依赖了主目录未提交成果或未来合并无冲突

#### Scenario: 无法建立隔离位置
- **WHEN** 实际需要 Git 隔离，但工作树（Worktree）提供者不可用、已登记仓库缺失或位置身份冲突使隔离无法完成
- **THEN** 智能体（Agent）MUST 停止依赖该位置的持久文件写入，保留现场并报告具体原因，不自动回退主开发分支或初始化仓库
- **AND** 只读检查与合法任务记录动作 MUST 可以独立继续

#### Scenario: 纯非 Git 资料工作
- **WHEN** 用户授权修改已确认没有 Git 归属的资料，实际目标和工作范围明确
- **THEN** 智能体（Agent）MUST 在该实际位置核对当前内容与已观察版本，使用所属专业工具修改，并从真实成果回读验收
- **AND** MUST 不以工作树（Worktree）缺失阻断，不调用 Git 提交或工作树清理，也不创建仓库

#### Scenario: 父仓库和不存在目标
- **WHEN** 文件尚未跟踪、被忽略、本目录没有 `.git`，或目标尚不存在
- **THEN** 智能体（Agent）MUST 核对目标及最近现存父目录的真实路径和实际仓库归属，不能凭这些条件判断非 Git
- **AND** 目标或祖先的悬空链接、身份冲突以及不明确观察 MUST 只阻止相关写入；缺少 Git 工具本身不能形成所有非 Git 资料任务的安装门禁

#### Scenario: 资料在观察后改变或新出现
- **WHEN** 写入前目标身份或内容已改变，或原本不存在的目标已经出现
- **THEN** 智能体（Agent）MUST 停止基于旧观察的覆盖，保留当前内容与本次修改意图，重读并判断
- **AND** 专业能力提供版本条件时 MUST 提交已观察版本；普通文件工具的重读和补丁 MUST NOT 被报告为对任意外部编辑器的原子并发保护

#### Scenario: 混合范围局部受阻
- **WHEN** 同一任务含 Git 和已确认的非 Git 对象，其中一个位置或版本存在冲突
- **THEN** 智能体（Agent）MUST 保留冲突现场，只停止依赖该对象的写入，继续可以独立安全完成的其他授权工作
- **AND** MUST NOT 借非 Git 分支绕过真实 Git 归属、已选提供者（Provider）或既有删除安全
