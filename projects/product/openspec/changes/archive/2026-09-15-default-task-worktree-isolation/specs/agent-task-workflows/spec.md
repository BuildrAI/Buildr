## MODIFIED Requirements

### Requirement: 任务工作流必须显式可见
Buildr task 和 OpenSpec Skills MUST 在改变 task state 前，以及已报告状态发生实质变化时，明确 workflow selection、实际工作位置、repository set 和当前 OpenSpec change status。

#### Scenario: 使用 OpenSpec 前说明 change
- **WHEN** Agent 决定 create、explore、apply、sync 或 archive OpenSpec change
- **THEN** Agent MUST 在执行动作前说明正在使用 OpenSpec
- **AND** Agent MUST 在已知时尽快明确 change id、resolved change path 和 intended action

#### Scenario: 采用 OpenSpec 时说明当前 change 状态
- **WHEN** task triage 选择或继续 OpenSpec change-flow
- **THEN** Agent MUST 在面向用户的回复中包含当前 change status
- **AND** status MUST 在已知时标识 change id、resolved change path、current action，以及 change 是 planned、active、blocked、apply-ready、complete 还是 archived
- **AND** 在可用时，status MUST 汇总 artifact 或 task progress，并明确 next executable action 或 blocking reason
- **AND** Agent MUST 在首次采用 OpenSpec、状态发生实质变化、工作暂停或完成，或用户询问进度时刷新该 status

#### Scenario: 创建或复用Worktree前说明位置
- **WHEN** Agent决定创建或复用独立Worktree
- **THEN** Agent MUST在task edits前说明实际Workspace root、task id、worktree root、任务分支和repository set
- **AND** 只有用户明确要求在主开发分支修改时 MUST允许在核对归属与覆盖风险后使用该位置；只读检查无需隔离

#### Scenario: Worktree lifecycle remains a Skill concern
- **WHEN** Buildr 打包 task worktree guidance
- **THEN** placement、repository selection、disclosure、reuse、retention 和 cleanup procedures MUST 保留在 task Skills 中
- **AND** required Core Rule MUST NOT 复制Worktree操作手册

### Requirement: task-triage 必须输出正交且有证据的任务决策
Buildr 的 `task-triage` Skill MUST先核对任务相关事实，再分别判断语义治理和执行形态；输出 MUST包含选择、repository set、实际工作位置选择、最小依据、未决冲突和next provider/action，并 MUST只在适用时追加OpenSpec或正式Task状态。任务进度 MUST由对话、Task Record、Parent/Child与各专业公开read model表达，不得创建第二份Board或Environment authority。

#### Scenario: 已有契约的实现任务
- **WHEN** canonical spec已定义目标行为且Agent已核对当前checkout、repository/ref、owned scope与副作用
- **THEN** triage MUST选择`code-only + implementation`，并在首次持久文件修改前按默认隔离策略确定实际工作位置
- **AND** MUST NOT仅因缺少Environment、Plan、Receipt或projection而阻塞编辑、构建或有界测试

#### Scenario: 实现任务需要独立Git位置
- **WHEN** 任务需要修改持久文件，且用户未明确要求在主开发分支修改
- **THEN** triage MUST把明确Workspace、Task ID、branch、start point与repository selectors交给Worktree provider
- **AND** MUST使用provider返回的实际checkout path继续工作，不得把Worktree evidence冒充统一Environment ready

#### Scenario: 独立收敛当前事实文档
- **WHEN** canonical specs、当前实现与registries已能确认现行事实，任务只让current knowledge追上该事实且不进入代码、构建或测试
- **THEN** triage MUST选择`spec-maintenance + metadata-only`
- **AND** MUST使用selected current-knowledge provider的`maintain` operation，不得为既有事实补造OpenSpec Change

#### Scenario: Authority 或执行范围不明确
- **WHEN** 可信事实源冲突、授权边界不明、repository set或实际工作位置无法确认
- **THEN** triage MUST返回`blocked`或`unknown`并提出改变长期语义所需的最少问题
- **AND** MUST NOT预先写入Change、代码、Task或任何位置记录

### Requirement: 实现型 workflow 必须绑定 task execution context
Buildr的Task Triage与OpenSpec Skills MUST在首次持久文件写入前执行默认隔离策略，并核对实际Git checkout、Project/Service registry、owned scope和适用Worktree evidence。workflow MUST NOT要求matching Environment Receipt、统一`ready`、runtime projection或session adoption作为普通proposal、实现、构建、Review、Verification或交付前置。

#### Scenario: Triage选择实际工作位置后在原对话继续
- **WHEN** triage完成实际工作位置选择，且Agent已证明当前任务独立工作树（Worktree）或用户明确要求的主开发分支位置、branch/ref、dirty与owned scope适合本任务
- **THEN** workflow MUST在该真实位置继续并重新观察当前文件和Git事实
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

## ADDED Requirements

### Requirement: 持久文件改动默认隔离
任务分流技能（task-triage）MUST 在开始持久文件修改时介入；除非用户明确要求在主开发分支修改，否则 MUST 创建或复用当前任务的独立工作树（Worktree）。隔离判断 MUST 独立于语义治理和执行形态，覆盖代码、文档、配置、规则（Rule）、技能（Skill）、模板及 OpenSpec 材料；小改动和纯规划不构成例外。执行位置策略由任务分流技能（task-triage）负责，工作树技能（task-worktree）MUST 保留创建、检查和安全清理职责；命令及删除安全契约保持不变。

#### Scenario: 主开发分支干净时开始小改动
- **WHEN** 用户要求修改一个文件，当前位于没有未提交改动的主开发分支，未明确要求原地修改
- **THEN** 智能体（Agent）MUST 在首次文件写入前创建或复用当前任务的独立工作树（Worktree）

#### Scenario: 纯文档或规划修改
- **WHEN** 用户仅要求修改文档、技能（Skill）或 OpenSpec 规划材料
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
- **WHEN** 工作树（Worktree）提供者不可用、仓库缺失或位置身份冲突使隔离无法完成
- **THEN** 智能体（Agent）MUST 停止依赖该位置的持久文件写入，保留现场并报告具体原因，不自动回退主开发分支或初始化仓库
- **AND** 只读检查与合法任务记录动作 MUST 可以独立继续
