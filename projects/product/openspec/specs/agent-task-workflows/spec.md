# Agent Task Workflows

## Purpose

定义 Buildr 内置场景化 Skills、Agent 任务协作、OpenSpec/Git/worktree/finish 工作流和分层验证契约。

## Requirements

### Requirement: Buildr Skill 引导场景化内置 Skills
产品内置 Buildr Skill MUST 在用户意图匹配相关工作流时，引导 Agent 使用场景化内置 Skills。

#### Scenario: 用户询问 Rules 与 Skills
- **WHEN** 用户询问如何维护或重组 Buildr rules 和 skills
- **THEN** Buildr Skill MUST 说明任务触发型流程应归入 Skills
- **AND** Buildr Skill MUST 将 required Rules 视为 ontology、源资产边界和常驻 invariants 的承载位置

#### Scenario: Agent runtime 找不到场景化 Skill
- **WHEN** 某个工作流应由内置场景化 Skill 处理，但当前 Agent runtime 找不到该 Skill
- **THEN** Buildr Skill MUST 引导 Agent 检查 workspace Skills 源资产和 runtime 投射状态
- **AND** Buildr Skill MUST 优先引导 `skills render`、`sync` 或 doctor 指导的修复，而不是把工作流文本复制到 Rules

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

### Requirement: 发布 worktree 在远端候选确认后默认清理
Buildr task-worktree guidance MUST 将发布 worktree 与需要持续联调的普通开发 worktree 区分，并在发布目标完成后默认清理不再需要的本地发布环境。

#### Scenario: 推送并确认发布分支后清理本地发布环境
- **WHEN** Agent 使用临时 worktree 制作发布分支
- **AND** 远端发布分支已推送且远端 ref 与候选提交一致
- **AND** worktree 干净且没有明确的后续本地构建、部署、修复或验证动作
- **THEN** Agent MUST 删除本地发布 worktree 和已由远端安全承载的本地发布分支
- **AND** Agent MUST NOT 因普通开发任务的保守保留策略继续保留该发布 worktree
- **AND** Agent MUST NOT 自动删除远端发布分支

#### Scenario: 存在后续本地发布动作时保留
- **WHEN** 发布分支推送后仍有明确的本地构建、部署、修复或验证动作
- **THEN** Agent MUST 保留发布 worktree
- **AND** Agent MUST 向用户说明保留原因和下一项本地动作

### Requirement: Buildr Skill 统一表达 doctor 生命周期
Buildr Skill MUST 通过统一执行循环表达 Buildr 状态变更后的 doctor 验证流程，并避免在每个资产章节重复相同要求。

#### Scenario: 状态变更后的统一验证
- **WHEN** Agent 通过 Buildr Skill 完成 workspace 状态变更
- **THEN** Buildr 技能（Skill）MUST 使用当前智能体（Agent）的诊断（Doctor）确认相关结果；当前动作已返回同一现场的最终诊断（Doctor）时直接复用，否则运行 `buildr doctor --agent <agent> --target <dir> --json`
- **AND** 完成标准 MUST 要求不存在需要立即处理的 error

#### Scenario: 资产章节避免重复
- **WHEN** Buildr Skill 分别说明 Workspace、Project、Service、Rules 或 runtime 维护动作
- **THEN** 各资产章节 MUST 依赖共享执行循环完成通用 doctor 验证
- **AND** 只有该资产存在额外诊断语义时才能补充专项检查说明

#### Scenario: Bootstrap 兜底一致
- **WHEN** Buildr 技能（Skill）不可用且智能体（Agent）使用命令帮助和命令参考
- **THEN** 命令参考 MUST 保留当前智能体（Agent）的诊断与修复依据；`init --agent` 或 `sync` 已返回有效的最终诊断（Doctor）时 MUST 复用，不重复运行

### Requirement: task-triage 明确 OpenSpec 中文文档约束
Buildr 的 task-triage Skill MUST 在选择或继续 OpenSpec 工作流时，要求 Agent 使用中文编写 Buildr 自有 OpenSpec 文档和用户可见说明，并说明允许保留英文的格式与技术内容。

#### Scenario: task triage 选择 OpenSpec
- **WHEN** task triage 选择或继续 OpenSpec change-flow
- **THEN** 其面向用户的 guidance MUST 要求 Buildr 自有文档正文使用中文
- **AND** 它 MUST 允许 English commands、paths、code identifiers、protocol fields、YAML/frontmatter 和 OpenSpec format keywords

### Requirement: Git 工作区转换后诊断 Buildr Agent 环境
Git 提供者（Provider）MUST 只报告真实检出变化；Buildr 技能（Skill）或当前任务的能力消费者（Consumer）MUST 根据变化范围执行相应诊断与恢复。工作树（Worktree）提供者（Provider）只管理 Git 位置、证据与安全清理，MUST NOT 自动创建运行环境、执行诊断（Doctor）、同步资产或安装依赖。

#### Scenario: Git 操作成功改变已检出内容
- **WHEN** Agent 通过任一 Git capability provider 成功完成 `pull`、`merge`、`rebase`、切换 tree 的 `checkout` 或 `switch`、改变工作区的 `reset`、`cherry-pick`、`revert`、`stash apply` 或 `stash pop`
- **AND** 当前仓库位于包含 `.buildr/workspace.yml` 的已初始化 Buildr workspace 中
- **THEN** Agent MUST 针对当前 Agent 和 Buildr workspace root 运行 `buildr doctor --agent <agent> --target <workspace-root> --json`
- **AND** 检查 MUST 发生在 Git 操作成功且工作区不存在未解决冲突之后

#### Scenario: Git 操作不改变已检出内容
- **WHEN** Agent 只执行 `fetch`、`push`、普通 `commit`，或复用未发生 tree 转换的既有 worktree
- **THEN** Agent MUST NOT 仅因该操作运行 Git 工作区转换后的 Buildr 环境检查

#### Scenario: 当前环境无需处理
- **WHEN** 工作区转换后的 doctor 没有报告需要用户处理的环境问题
- **THEN** Agent MUST NOT 提醒用户执行无必要的 `render` 或 `sync`

#### Scenario: 当前环境存在漂移或依赖问题
- **WHEN** 工作区转换后的 doctor 报告 Rules、Skills、capability bindings、Commands、Components、Contributions 或当前 Agent runtime 存在需要处理的问题
- **THEN** Agent MUST 向用户汇总当前环境问题及 doctor 指向的可执行下一步
- **AND** Agent MUST NOT 将全部问题笼统解释为 runtime 渲染问题
- **AND** Agent MUST 说明当前 session 是否重新发现新资产由 Agent runtime 决定

#### Scenario: 当前 provider 已报告 treeChanged
- **WHEN** 已绑定 Git provider 的结果证据包含 `treeChanged: true`
- **THEN** 能力消费者（Consumer）MUST 按 Buildr 技能（Skill）核对当前工作空间（Workspace）与运行时（Runtime），执行适用诊断
- **AND** Agent MUST NOT 因 selected provider 的具体 Skill id 不同而跳过检查

#### Scenario: 一般环境漂移可由 workspace sync 修复
- **WHEN** 非 worktree-create 工作区转换后的 doctor 指出当前 Agent 的 workspace sync 是合适修复动作
- **THEN** 智能体（Agent）MUST 在已有同范围授权内执行同步；只有缺少该授权或需要新的业务取舍时才询问
- **AND** Agent MUST 同时提供 `buildr sync <agent> --target <workspace-root>` 作为手动同步备选
- **AND** 面向用户的手动命令 MUST 使用已解析的实际 Agent 和 workspace root，不得保留占位符
- **AND** 智能体（Agent）MUST NOT 在缺少相应授权时执行同步，MUST NOT 对已成立的同范围授权重复确认
- **AND** Agent MUST NOT 把要求用户自行运行命令作为默认处理方式

#### Scenario: 用户确认由 Agent 同步
- **WHEN** 用户确认由 Agent 处理 workspace sync
- **THEN** Agent MUST 调用 Buildr Skill 执行 `buildr sync <agent> --target <workspace-root>`
- **AND** 智能体（Agent）MUST 使用同步返回的最终诊断（Doctor）确认结果；同一现场已有有效结果时不重复执行
- **AND** Agent MUST 报告实际同步与诊断结果，而不是仅重复手动命令

#### Scenario: 用户选择手动同步或 Agent 无法执行
- **WHEN** 用户明确选择手动同步，或 Agent 因工具不可用、权限、登录态或外部环境无法完成同步
- **THEN** Agent MUST 提供准确的手动同步命令
- **AND** Agent MUST 在无法执行时说明具体原因
- **AND** 用户选择手动同步后，Agent MUST NOT 在缺少诊断证据时假设同步成功
- **AND** 用户报告完成且 Agent 能运行 doctor 时，Agent MUST 再次验证当前环境

#### Scenario: 诊断问题不应由 sync 修复
- **WHEN** doctor 报告 Commands、Components、CLI 或其他不能由 workspace sync 正确修复的问题
- **THEN** 智能体（Agent）MUST 按对应能力在已有授权内执行可完成的动作，只有范围或副作用变化时取得必要决定
- **AND** Agent MUST 仅在自身无法完成或用户选择手动方式时要求用户操作

#### Scenario: 无法确认当前 Agent 环境
- **WHEN** Agent 无法匹配受支持的 runtime adapter，或 post-transition doctor 无法执行
- **THEN** Agent MUST 报告环境状态尚未确认及具体原因
- **AND** Agent MUST NOT 猜测本地 Agent runtime 已经同步

#### Scenario: 产品创建新 task worktree 并自动准备环境
- **WHEN** 智能体（Agent）已明确任务标识、分支、起点与工作空间（Workspace），并调用已选工作树（Worktree）提供者（Provider）
- **THEN** 提供者（Provider）MUST 返回真实创建或复用位置及 Git 证据，MUST NOT 自动执行诊断（Doctor）、同步或安装依赖
- **AND** 智能体（Agent）MUST 从返回位置继续工作，仅在当前实现或验证需要时读取项目（Project）和服务（Service）的真实准备入口
- **AND** 准备与投射 MUST 遵守独立授权、目录所有权和保留工作空间（Workspace）保护边界

#### Scenario: 新 task worktree 不满足安全自动 sync 条件
- **WHEN** 工作树（Worktree）创建后发现运行时（Runtime）、依赖、组件（Component）或源资产问题
- **THEN** 智能体（Agent）MUST 保留已创建目录和 Git 事实，将具体问题交给相应能力所有者（Owner）
- **AND** 提供者（Provider）MUST NOT 执行任意修复命令、删除检出目录、丢弃内容或扩大 Git 授权
- **AND** 局部准备问题 MUST NOT 否定已经成功创建或复用的位置

#### Scenario: 幂等复用既有 task worktree
- **WHEN** canonical task path 已注册为同一 repository 与 branch 的既有 worktree
- **THEN** Buildr MUST 返回 `reused` 与 `treeChanged: false`
- **AND** Buildr MUST NOT 仅因复用重复运行创建后的 doctor 或自动 sync
- **AND** path、repository 或 branch identity 不匹配时 MUST fail closed 且零写入

#### Scenario: 任务 Skill 内部发生其他工作区转换
- **WHEN** `task-finish` 通过绑定 provider 改变目标 workspace tree，或 task workflow 执行 worktree create 之外的 tree transition
- **THEN** 对应任务技能（Skill）MUST 依据真实变化调用产品入口 Buildr 技能（Skill）的适用诊断与恢复；已有有效诊断和同范围授权继续复用
- **AND** 检查 MUST NOT 改变既有验证证据、Git 授权或 worktree 清理契约

#### Scenario: Git 操作由 Agent 之外执行
- **WHEN** 用户或其他程序绕过 Agent Skill 和 Buildr worktree create 入口直接改变 Git 工作区
- **THEN** Buildr MUST NOT 声称能够即时感知该操作
- **AND** 智能体（Agent）后续继续工作时 MUST 核对当前事实；需要运行时（Runtime）诊断时使用当前产品入口，而非宣称已自动观察到变化

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

### Requirement: Change lifecycle 必须在最终验证前收敛 Brief 与当前认知
Buildr OpenSpec 工作流（Workflow）MUST 通过 `buildr.current-knowledge-maintenance/v3` 在 propose/update 阶段按真实范围 assess，在 apply 阶段完成已授权知识任务并 reconcile；最终依据 MUST 对应真实成果。此处 Brief MUST 只指具体变更说明（Change Brief），该能力 MUST 保留已授权说明创建、刷新与一致性检查保证，不接管独立任务说明（Task Brief）或任务过程报告。智能体（Agent）MUST 只更新被内容或运行条件变化实际影响的检查，不把固定调用顺序或辅助记录作为验证、归档或收尾的全局门禁。归档动作 MUST NOT 附带知识写入，后续独立维护仍按当前事实与授权进行。

#### Scenario: Propose 创建人类入口与影响任务
- **WHEN** `openspec-propose` 完成 proposal、design、specs 和 tasks
- **THEN** Agent MUST 使用 selected current-knowledge provider 创建或更新 Change Brief 并运行 assess；说明 MUST 引用任务的唯一 Task Brief，不复制任务需求正文
- **AND** assess 识别的真实维护目标 MUST 进入 tasks 及已采用的 knowledge-impact evidence
- **AND** 无真实影响的目标 MUST NOT 产生空文档任务

#### Scenario: Update 修订 planning artifacts
- **WHEN** `openspec-update-change` 修改 scope、流程、影响、验收或 delta requirements
- **THEN** Agent MUST 更新 Change Brief 并重新运行 assess；任务整体目标改变时 MUST 另由任务管理技能（task-manager）维护 Task Brief
- **AND** tasks 及已采用的 knowledge-impact evidence MUST 与修订后的 planning artifacts 保持一致

#### Scenario: Apply 发现并处理当前认知影响
- **WHEN** `openspec-apply-change` 实现 Change tasks
- **THEN** Agent MUST 执行已识别的 Change Brief、knowledge 和 terminology tasks，并把实现中新发现的真实影响加入 tasks 及已采用的 evidence
- **AND** implementation content 完成后 MUST 运行 reconcile，再进入最终 verification

#### Scenario: Sync 前核对 reconcile evidence
- **WHEN** `openspec-sync-specs` 准备把 delta specs 同步到 canonical specs
- **THEN** Agent MUST 核对 reconcile result 对应当前 Change、canonical candidate 和 delivery tree identity
- **AND** 辅助 evidence 缺失或陈旧时 MUST 直接核对当前事实并报告局部缺口；只有真实语义冲突会使规范同步错误时 MUST 停止相关 sync

#### Scenario: Archive 不补写当前认知
- **WHEN** Change 已完成 sync、verification、current-knowledge inspect 并准备 archive
- **THEN** archive MUST 只移动 Change 及其 companion/sidecar artifacts，MUST NOT 移动或删除独立 Task Brief
- **AND** archive 动作 MUST NOT 附带 glossary、overview、architecture、flows 或 services 写入；后续独立已授权维护 MUST 不改写历史 Change

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

### Requirement: Workflow 按任务影响验证 adapter activation
只有任务修改 runtime adapter 的 discovery、loading、activation mode、投射路径或相关 metadata，且专项验收要求证明新机制已激活时，workflow MUST 消费 adapter activation metadata。普通 Rule/Skill 内容、contract 或 description 修改 MUST NOT 触发新 session 门禁；该专项 evidence MUST NOT 阻塞普通 workflow。

#### Scenario: 普通 Skill 内容完成交付
- **WHEN** 任务修改 Skill 正文、contract 或 description，但没有改变 Agent runtime 的发现或激活机制
- **THEN** workflow MUST 使用 source、package、render/sync、projection 与 doctor evidence 验证交付
- **AND** MUST NOT 要求当前开发 session 重新加载新版 Skill

#### Scenario: Codex Skills 在 session start 激活
- **WHEN** 任务改变 Codex Skills 的 discovery、session-start loading 或投射机制，且验收需要证明新机制已激活
- **THEN** workflow MUST 说明 Rules 与 Skills 各自 activation mode
- **AND** Codex App 不能绑定既有 Buildr worktree 时 MUST 报告 evidence 缺口，不得伪造自动 handoff

#### Scenario: Runtime 支持显式 reload
- **WHEN** adapter activation 机制专项验收中声明 `explicit-reload`、提供 reload guidance 且 Agent/runtime host 返回匹配的 reload evidence
- **THEN** workflow MUST 接受 reload activation evidence
- **AND** 该 evidence MUST 与 execution readiness 分开记录

### Requirement: 验证执行必须回收 task-owned descendant processes
Buildr Product verification runner MUST 为自身启动的 step 建立可识别 ownership，并在 step 完成或 runner 异常结束时清理仍存活的 owned descendants，包括运行期间已由 owned lineage 观察到、随后 detached 或 reparented 的 descendants。清理 MUST 限于该 runner 创建的进程组或运行期间由精确 parent-child lineage 建立的 ownership，不得按端口、进程名或宽泛 workspace 匹配终止其他任务进程。

#### Scenario: verification step 留下 server descendant
- **WHEN** Candidate 或 affected step 的主命令结束但其 owned server descendant 仍存活
- **THEN** runner MUST 终止该 owned descendant 并记录 cleanup status
- **AND** 最终 verification evidence MUST 报告是否存在 cleanup failure

#### Scenario: 其他任务存在同名进程
- **WHEN** 另一个Task Worktree中存在同名server或使用相同默认端口的进程
- **THEN** 当前 runner MUST 保留该进程
- **AND** cleanup evidence MUST 只引用当前 runner 的 ownership identity

#### Scenario: descendant 在主命令结束前 detached
- **WHEN** runner 在 step 运行期间已观察到 descendant 属于 owned lineage，随后该进程脱离原 process group 或被重新托管
- **THEN** runner MUST 在 step 结束时仍核对并终止该存活 descendant
- **AND** cleanup evidence MUST 区分 process group 与 tracked descendant 的处理结果

#### Scenario: 未被 owned lineage 观察的同名进程
- **WHEN** 另一个任务存在同名进程，但它从未出现在当前 step 的 owned parent-child lineage 中
- **THEN** runner MUST 保留该进程
- **AND** MUST NOT 用名称、端口或 workspace 文本匹配补充 ownership

### Requirement: Agent只处理OpenSpec收敛语义结果
Buildr MUST 让 Agent 只处理 `blocked` 的语义冲突或 `recovery-unprovable` 的人工事实检查；确定性路径 MUST 完全由产品执行。Agent MUST NOT 被要求手工恢复 canonical spec、刷新 baseline、选择内部恢复 stage、拼装多条 guard 命令或解释多个 sidecar 不一致。

#### Scenario: 确定性事务通过
- **WHEN** `buildr openspec converge` 返回 `passed`
- **THEN** Agent MUST 将 canonical收敛与Change归档视为产品已安全完成
- **AND** 不得额外运行旧pre-sync/post-sync或手工sync命令

#### Scenario: 语义冲突阻塞
- **WHEN** converge返回`blocked`并列出冲突Change、Requirement或不完整delta
- **THEN** Agent MUST只修订语义authority或请求用户决定
- **AND** 修订后 MUST重新调用同一converge入口

#### Scenario: 状态不可证明
- **WHEN** converge返回`recovery-unprovable`
- **THEN** Agent MUST停止自动收尾并报告真实文件与receipt证据缺口
- **AND** MUST NOT通过删除sidecar、采用当前baseline或覆盖canonical绕过失败

### Requirement: Agent 只能处理收敛事务外的语义决定
Agent MUST 将 Buildr 的确定性收敛结果视为产品事实：`passed`直接继续后续工作，`blocked`只处理最小语义冲突，`recovery-unprovable`只在当前实际工作位置仍保留恢复现场时使用OpenSpec Convergence Inspect或进行人工核对。Agent MUST NOT手工恢复Canonical Specs、刷新baseline、选择内部恢复stage、拼装旧门禁命令，或把Inspect变成正常验收门禁。

#### Scenario: 产品报告状态无法证明
- **WHEN** `buildr openspec converge`返回`recovery-unprovable`且当前Change工作根仍保留
- **THEN** Agent MAY调用`buildr openspec convergence inspect`读取逐文件事实，并停止其他正式文件写入
- **AND** MUST NOT删除恢复现场、刷新baseline或从旧stage继续

#### Scenario: 产品报告确定性通过
- **WHEN** `buildr openspec converge`返回`passed`与`archived`
- **THEN** Agent MUST直接消费该结果继续current knowledge检查、Content Target、Verification与后续Task流程
- **AND** MUST NOT再次运行Convergence Inspect或要求内部恢复记录进入Git交付

#### Scenario: Worktree已经清理
- **WHEN** Formal Task Finish已经成功且具体owner cleanup完成
- **THEN** Agent MUST使用Archived Change、Canonical Specs和Git交付事实回答正常历史问题
- **AND** MUST NOT要求恢复Worktree或把临时现场缺失报告为`recovery-unprovable`

#### Scenario: Inspect返回not-applicable
- **WHEN** Convergence Inspect报告事务尚未开始或Change已经终结
- **THEN** Agent MUST按reason code分别启动Converge或停止恢复检查
- **AND** MUST NOT把`not-applicable`解释为同步失败、归档失败或长期证据缺失

### Requirement: 正式执行必须先建立 Task Record
Buildr 的 `task-triage` MUST optional 依赖 `buildr.task-record/v4`，并 MUST 在已确认进入正式持久交付的分支、首次交付写入前调用 selected provider 创建或恢复 Task Record。路径已明确而无需重新 Triage 的正式执行也 MUST 遵守同一前置条件。

#### Scenario: Triage 选择已有契约实现
- **WHEN** task-triage 选择 implementation，且任务即将创建分支或修改交付物
- **THEN** Agent MUST 先创建或恢复 Task Record，再进入当前实际工作位置
- **AND** Task Record provider 不 ready 或操作 blocked MUST 阻止首次交付写入，但不抹去已确认的 triage 结论

#### Scenario: Triage 选择 Change Flow
- **WHEN** task-triage 选择 change-flow 且即将创建首份 OpenSpec artifact
- **THEN** Agent MUST 先创建或恢复 Task Record
- **AND** Change 创建成功后 MUST 通过 Task Manager 将真实 `project/change` 引用加入 active Task Record

#### Scenario: 不形成正式 Task
- **WHEN** triage 选择 explore、纯只读诊断、Task 外单次操作或 metadata 写入只是已有 Task lifecycle 的一部分
- **THEN** task-triage MUST NOT 调用 Task Record create
- **AND** 其他适用的只读或专业动作 MUST 不因 Task Record capability 不 ready 而阻塞

#### Scenario: 已有 Task Record
- **WHEN** 正式执行上下文已提供 Task ID
- **THEN** Agent MUST inspect 并核对 active Task 的 intent/scope
- **AND** MUST NOT 重新 create、从 worktree 名称补造第二个 Task ID 或覆盖终态 Task

### Requirement: task-review Skill 必须作为 Task Review 语义入口
Buildr MUST交付一个`task-review` workspace Skill，并通过selected`buildr.task-review/v2`支持`planning|completion`。Agent理解Task Intent、重新观察真实subject、动态选择工具和范围并形成结论；Application只负责inspect与CAS record。

#### Scenario: 用户要求审查正式 Task 的方案
- **WHEN** 用户或Agent目标需要Planning Review并能取得真实方案identity
- **THEN** Agent MUST路由到task-review并在完整结束后可选记录Planning Result

#### Scenario: 用户要求审查完成候选
- **WHEN** 用户要求审查真实完成结果
- **THEN** Agent MUST路由到同一Skill并自行从代码、Git、文件、部署或外部系统取得subject
- **AND** MUST不要求Candidate或Development Receipt

#### Scenario: Task 外普通审查
- **WHEN** 用户只要求一次性评论且没有正式Task
- **THEN** Agent MAY返回会话内意见
- **AND** MUST不创建Task Review Result或伪subject

### Requirement: Task Review 必须如实记录执行方式和覆盖边界
`task-review` MUST 如实选择 `self|independent-agent|human`，动态记录实际 reviewed、相关但 uncovered 的对象与原因、findings 和结论。Skill MUST NOT 把自审描述为独立审查，也 MUST NOT 把固定 OpenSpec artifacts、代码目录、测试命令或 review checklist 强制为所有 Task 的统一范围。

#### Scenario: 当前 Agent 自审
- **WHEN** 当前 Agent 自己执行 Review
- **THEN** Result method MUST 为 `self`，即使 Agent 使用工具或 Project evidence 也 MUST NOT 标为 independent-agent

#### Scenario: 只覆盖部分相关对象
- **WHEN** 某个相关对象因不可用、越权或明确范围限制没有被审阅
- **THEN** Skill MUST 把对象与真实原因写入 uncovered
- **AND** MUST NOT 以空列表或概括性 passed 隐藏覆盖缺口

### Requirement: Skill 必须区分 Capability Declaration、Execution 与 Result
Skill MUST把Project测试地图作为稳定测试体系事实，把Agent直接调用项目工具取得的输出、耗时和诊断作为本次执行事实，把current Task Verification Report作为Workspace-local Task fact。Skill MUST不将三者合并成一个schema，也 MUST不把完整执行输出或本机路径写入Report。

#### Scenario: command execution 成功
- **WHEN** Agent依据测试地图直接执行显式项目测试入口
- **THEN** Agent MUST读取真实结果并在开发完成后提炼有意义报告
- **AND** 测试工具自己的资源与清理由对应owner处理

#### Scenario: execution 中断
- **WHEN** 项目runner或Agent operation中断且完整结论未形成
- **THEN** Skill MUST保留已有current Report
- **AND** MUST如实报告本次执行未形成新current

### Requirement: Buildr 产品入口必须路由 v3 Verification authority
Buildr product Skill、task-triage和相关builtin descriptions MUST将测试地图维护、已有测试执行与开发完成报告意图路由到selected `buildr.task-verification/v4` provider，并 MUST不恢复v3 Request/Plan、Candidate reuse或Execution Record流程。

#### Scenario: runtime 发现 Task Verification
- **WHEN** supported Agent runtime完成Buildr sync/render
- **THEN** runtime MUST发现v4 `task-verification` Skill、contract、Project v4 reference/template与binding
- **AND** MUST不同时投射旧v3 contract/reference

### Requirement: 测试建设与 Task Verification 必须使用独立入口
Buildr product Skill、task-triage和builtin descriptions MUST将测试框架设计、测试分层、编排策略和为实现任务开发测试的意图路由到`project-testing`；将Project测试地图维护、已有测试选择/直接执行和current Task Verification Report路由到selected `buildr.task-verification/v4` provider。两个Skill MAY在同一任务中先后使用，但 MUST不互相维护状态、声明provider dependency或接管对方authority。

#### Scenario: 实现完成后补充测试再验证任务
- **WHEN** Agent完成功能实现，需要先开发项目测试，再形成正式Task Verification Report
- **THEN** Agent MUST先使用`project-testing`按项目约定补充适量测试
- **AND** 测试入口稳定后 MUST使用`task-verification`选择并直接执行已有工具，最后保存报告

#### Scenario: runtime 发现两个独立 Skill
- **WHEN** supported Agent runtime完成Buildr sync或render
- **THEN** runtime MUST同时发现`project-testing`与`task-verification`
- **AND** `project-testing` MUST不提供Task Verification capability binding或Result authority

### Requirement: Git Operations 只执行 consumer 已选定的 Git Operation
Buildr MUST 交付唯一 Skill-only `git-operations`，并 MUST 通过 selected `buildr.git-operations/v1` provider 为一次已选定 Git Operation 提供授权边界、安全默认值、操作前后 identity 与最小 Result。直接用户或上游 consumer MUST 决定 repository、operation、相关 ref、scope、目标和顺序；provider MUST NOT 接管 Task Development、Task Finish、验证、交付编排或语义决策。

#### Scenario: 输入不足时零写入
- **WHEN** repository、operation、相关 local/remote ref、精确 scope 或当前授权不能唯一确定
- **THEN** provider MUST 在任何 Git 写入前返回 `blocked` 与缺失事实
- **AND** MUST NOT 自行选择 repository、ref、remote、operation 或策略

#### Scenario: 独立 commit
- **WHEN** consumer 只授权 `commit` 并提供精确 owned paths 或可可靠分离的 hunks
- **THEN** provider MUST 只 stage 授权内容并创建或安全 amend 尚未共享的当前 scope commit
- **AND** MUST NOT push、使用 `git add -A`、stage 无关 dirty 或覆盖其他改动

#### Scenario: 独立 push
- **WHEN** consumer 只授权 `push` 并提供 source ref、destination remote/ref 与 commit scope
- **THEN** provider MUST 只推送已有 commit，并在写远端前核验实际 remote/ref 和完整 unpublished commit range
- **AND** MUST NOT 把 dirty 内容自动 commit 或只检查 range 的 tip commit

#### Scenario: commit 后 push
- **WHEN** consumer 明确选择 `commit+push`
- **THEN** caller MUST 依次请求独立 commit 与 push operation，并分别消费两个 Result
- **AND** Git Operations MUST NOT 把两步伪装成原子 transaction

#### Scenario: 工作区存在无关 dirty
- **WHEN** operation scope 外存在 modified、staged 或 untracked 内容
- **THEN** provider MUST 保留这些内容的 index 与 working tree 状态
- **AND** 只有授权内容可精确隔离时 operation MAY 继续，否则 MUST 返回 `blocked`

#### Scenario: Push range 包含 scope 外提交
- **WHEN** destination remote/ref 与 source ref 之间将被发布的完整 commit range 含有 consumer scope 外的 unpublished commit
- **THEN** provider MUST 在 push 前返回 `blocked` 并列出不匹配的 range facts
- **AND** MUST NOT 自动扩大授权、改推其他 ref、rebase、merge 或 force push

#### Scenario: Push 被拒绝
- **WHEN** remote 拒绝普通 push 或 destination identity 已漂移
- **THEN** provider MUST 停止并返回当前 local/remote facts 与已发生 effects
- **AND** MUST NOT 自动 force push、改写历史、切换 destination 或改变集成策略

#### Scenario: 共享 commit 冻结
- **WHEN** 当前 scope commit 已 push 或以其他方式共享
- **THEN** provider MUST NOT amend、rebase 或改写该 commit
- **AND** 后续变更 MUST 创建新 commit；撤销共享内容默认由 caller 明确选择新 revert operation

#### Scenario: 操作部分失败
- **WHEN** 一个 operation 失败前已经产生 local history、working tree 或 remote effect，或 commit+push 的 commit 已成功而 push blocked
- **THEN** Result MUST 如实报告已发生 effects、当前 repository identity 和未发生的 effect
- **AND** provider MUST NOT 静默回滚、stash、reset、换策略或把部分成功报告为零 effect

#### Scenario: 最小 Result
- **WHEN** provider 完成或阻止一个 Git Operation
- **THEN** Result MUST 包含 repository、实际 operation、`succeeded | blocked`、reason、适用的 before/after branch 与 commit identity、remote/ref、变化维度和已发生 effects
- **AND** Result MUST 只在 push 适用时包含完整 commit range，且 MUST NOT 要求所有 operation 填充统一的大 schema 或创建 Receipt

#### Scenario: 默认不自动执行高风险策略
- **WHEN** operation 遇到 dirty、divergence、冲突、目标竞争或共享历史
- **THEN** provider MUST NOT 自动 stash、reset、rebase、merge、force push、改写共享历史或切换策略
- **AND** 语义或重大风险决定 MUST 由 Agent 交还用户，恢复或重试 MUST 先重新核验事实

### Requirement: task-manager Skill 必须作为 Buildr Web 与 CLI 共享的 Task Record 薄管理入口
Buildr MUST交付现有`task-manager` workspace Skill作为`buildr.task-record/v4`默认provider，指导Agent创建、读取和维护正式Task Record。`task-manager` MUST不成为全局任务dispatcher或父任务流程总管。Buildr Web MUST作为同一Task Record Application的独立人类客户端；任一客户端 MUST不直接访问SQLite或migration scripts。

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

#### Scenario: 创建或继续正式说明
- **WHEN** 用户授权开始或继续 code-only、文档或 OpenSpec 任务
- **THEN** task-manager MUST 通过 Task Record 的 brief 字段保存和读取真实说明，不创建新的 brief 材料引用
- **AND** 其他专业技能 MUST 使用同一记录正文及 @task/<task-id> 稳定引用；旧说明导入 MUST 使用显式产品动作并报告当前事实

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

### Requirement: 日常正式任务引导必须按阶段装配上下文
本条只约束当前已触发专业动作所需的上下文；收尾独立触发，MUST不消费已退役的研发交接或依赖统一研发顺序，已有验证能力只保护自身动作。
Buildr 内置任务 Skills MUST 引导 Agent 只在当前动作成为 next executable action 时读取该动作所需的 Skill、capability contract、selected provider 与直接 authority，并 MUST 将后续阶段的专业上下文延后到对应动作开始前。该引导 MUST NOT允许跳过已触发 Skill、required Rule、provider contract、授权或 result evidence。

#### Scenario: Triage 正在选择任务路径
- **WHEN** Agent 正在判断语义治理、执行形态、repository set 与下一 provider action
- **THEN** `task-triage` MUST只要求读取当前分支决策和立即执行动作所需的 binding
- **AND** MUST不要求在 proposal 前预先读取 Verification、Completion 等尚未到达阶段的完整 provider 指引

#### Scenario: 已具备进入 proposal 的事实
- **WHEN** 用户已授权实现，任务（Task）、实际工作位置及当前动作所需的事实已经明确
- **THEN** guidance MUST引导 Agent 进入 proposal 或当前首个研发动作
- **AND** MUST不因收集非当前阶段信息、预读下游 Skills 或建立额外进度 authority而延迟该动作

#### Scenario: 首次修改前建立 source map
- **WHEN** Agent 准备修改 proposal、Skill、代码、测试或当前知识
- **THEN** guidance MUST按实际影响核对直接相关实现和约束；小改动不要求遍历规范、知识、测试与登记信息，涉及行为、职责或权威来源变化时才扩大调查并形成有界来源图（Authority Source Map）
- **AND** 后续 MUST只在 scope、authority 或相关事实变化时增量刷新，不得把该 map 写成新的产品 authority或反复全量扫描

### Requirement: 验证范围引导必须保持计划预览与正式 evidence 分离
Buildr 任务技能（Skill）MUST 在项目（Project）已提供只读计划或试运行能力时，引导智能体（Agent）先消费计划以判断影响范围、成本与补充风险，再选择必要的真实检查；计划预览 MUST NOT 作为实际检查结果、任务验证报告（Task Verification Report）事实或跳过必要检查的依据。项目未提供计划入口时，指引 MUST 允许智能体依据变更路径、测试地图与风险作出有证据的范围判断，不得因此阻塞。

#### Scenario: Project 提供验证计划预览
- **WHEN** Project registry 或现有命令提供不会执行测试的 affected plan
- **THEN** Agent MUST在追加 broad transient verification 前先读取该计划
- **AND** MUST结合计划覆盖与任务风险决定是否需要额外反馈，避免仅凭习惯重复整套测试

#### Scenario: 进入正式 Verification
- **WHEN** 智能体（Agent）已完成相关检查并准备登记当前内容的正式验证报告
- **THEN** 任务验证（Task Verification）MUST 校验并保存真实检查、未覆盖项和结论，由应用（Application）维护当前报告，不代替智能体执行测试
- **AND** 计划预览或推理 MUST NOT 冒充实际执行结果，检查名称或单次命令成功不得替代覆盖判断

#### Scenario: Project 没有计划预览能力
- **WHEN** 项目（Project）只声明已有检查入口而没有只读计划或试运行入口
- **THEN** Agent MUST基于实际变更、declaration applicability 与已识别风险选择范围
- **AND** guidance MUST不要求创建 planner、猜测命令或把缺少 preview 记录为 coverage gap

### Requirement: 日常任务边界检查必须动作就近且保持 Agent 判断
Buildr 内置任务技能（Skill）MUST 在智能体（Agent）即将写变更实施清单（Change Checklist）、调用 OpenSpec 合流、选择局部回归或判断已有检查是否仍可复用时提供动作就近的最小检查。该指引 MUST NOT 建立新的状态、关键词门禁、自动工作根选择或基于效率指标的自动推进逻辑。

#### Scenario: Agent 写入 Change checklist
- **WHEN** Agent 创建或修订 `tasks.md`
- **THEN** guidance MUST要求立即逐项确认 checkbox 能否在 Change archive 前完成
- **AND** MUST不要求预读 Verification、Candidate、Completion、Finish 或 cleanup 的完整下游流程来填充 checklist

#### Scenario: identity 输入已经变化
- **WHEN** 内容版本、相关测试地图、工具或运行条件已经变化
- **THEN** 任务验证（Task Verification）指引 MUST 重新判断受影响检查的适用性，并选择必要的补充检查
- **AND** MUST 保留原执行事实，不把旧结果描述为新内容已经验证，也不因登记报告或阶段转换重复仍有效的检查

#### Scenario: 团队提供窄任务耗时参考
- **WHEN** 用户或团队为一类任务提供耗时参考区间
- **THEN** Retrospective guidance MAY将其作为当前复杂度下的跟踪、评估和优化背景
- **AND** MUST不把该数值固化为通用产品阈值、Result 字段、gate 或自动缩减验证范围的依据

### Requirement: workflow guidance 必须保留用户调整边界
Buildr 指引 MUST 区分具体动作不可安全绕过的权威与授权边界，以及用户可按实际情况调整的推荐路径；MUST NOT 依赖已退役的统一流程快照（Snapshot）。指引 MUST 不把耗时参考、调用次数或推荐方式编码为门禁、自动推进或成功条件。

#### Scenario: 用户选择合法替代动作
- **WHEN** 用户基于当前事实调整推荐顺序、验证范围或专业能力提供者（Provider）
- **THEN** 智能体（Agent）MUST 按对应能力契约（Capability Contract）核验并执行该选择
- **AND** MUST 不补造统一快照或推进状态，也不得绕过既有授权和具体动作的失败关闭边界

### Requirement: 协作者更新必须与本地 self-bootstrap activation 排他路由
Buildr Agent workflow MUST依据当前Workspace是否安装自举Component与已交付变化范围选择自举或普通Workspace update。命中自举范围时MUST使用唯一`buildr-self-bootstrap-sync`执行器；Task编号仅为可选说明，不查询Task状态作为门禁。真实基线、delivered ref、retained checkout与Product Node/Doctor事实继续必需；MUST NOT从commit author、缺失Task或任务终态推断适用性。

#### Scenario: 普通协作者更新
- **WHEN** selected Git provider证明canonical checkout因remote提交而前进且未命中自举范围
- **THEN** Agent MUST按普通Workspace update运行适用Doctor/sync
- **AND** MUST不启动`buildr-self-bootstrap-sync`

#### Scenario: 协作者提交使 canonical tree 前进且本地没有匹配 Finish
- **WHEN** canonical tree因协作者提交前进且未命中自举范围
- **THEN** 该事实 MUST按普通Workspace update处理
- **AND** 旧Finish Result缺失 MUST不被视为异常

#### Scenario: 协作者更新只造成当前 Agent managed projection stale
- **WHEN** Doctor只报告未安装自举Component的普通Workspace当前Agent受管投影stale
- **THEN** Agent MUST按Workspace sync边界处理
- **AND** sync结果 MUST不创建Task或自举证据

#### Scenario: Doctor 报告非 workspace sync blocker
- **WHEN** Doctor报告不能由sync处理的具体问题
- **THEN** Agent MUST交给对应owner处理
- **AND** MUST不把一次sync宣称为完整修复

#### Scenario: matching自举交付
- **WHEN** 当前工作具有已核验基线、delivered ref和命中Product自举范围的真实变化，无论有无Task记录
- **THEN** Agent MUST调用唯一self-bootstrap runner
- **AND** runner失败 MUST只形成Activation Attention，不撤销交付或Task结果

#### Scenario: 当前会话存在 matching Formal Finish Result
- **WHEN** 历史调用方只提供旧Formal Finish Result而没有当前Git交付事实
- **THEN** self-bootstrap MUST不采用该历史Result
- **AND** 调用方 MUST改用真实基线、delivered ref与retained事实

#### Scenario: workspace sync 不产生 Task 或 Finish authority
- **WHEN** 普通Workspace update执行sync
- **THEN** sync MUST只收敛Workspace与Agent runtime
- **AND** MUST不创建Task、Verification、Finish或self-bootstrap结果

### Requirement: Buildr 工作流门禁必须保持宽而薄
Buildr required Core MUST 将“宽而薄”定义为通用治理原则：只有继续推进会造成越权、错误对象写入、未经授权的外部或不可逆副作用、证据失真或完成误报时才关闭式失败；其他可恢复不确定性 MUST 如实报告事实、风险与下一步，并保留 Agent 的安全判断和推进空间。Product scope MUST要求新增硬门禁明确其保护的 authority 或结果不变量及放行造成的具体伤害，MUST NOT仅因缺少辅助 provenance、推荐流程、特定工具身份或统一工作方式而阻断原本可安全检查和继续的工作。

#### Scenario: 缺少辅助证明但结果边界仍可检查
- **WHEN** 工作流缺少推荐的 metadata 或 provenance hint，但 authority、目标、授权、副作用和真实完成条件仍能由当前事实检查
- **THEN** Buildr MUST提供诊断与 Agent 指引并允许安全推进
- **AND** MUST NOT把辅助证明升级为唯一硬门禁或要求 Agent 伪造证明

#### Scenario: 推进会造成错误写入或完成误报
- **WHEN** 当前 identity、authority、授权或结果 evidence 不完整，继续动作可能写入错误对象、产生未经授权副作用或把未验证结果报告为完成
- **THEN** Buildr MUST在对应副作用或完成声明前关闭式失败
- **AND** MUST报告实际 blocker 与可恢复入口，不得用“宽而薄”绕过真实边界

#### Scenario: Product 设计新增硬门禁
- **WHEN** Product Change 准备新增会阻断 Agent 工作流的硬门禁
- **THEN** proposal、design 或 specification MUST明确该门禁保护的 authority/结果不变量和放行的具体伤害
- **AND** 若只有自动化信心降低或工作方式不同、但存在可检查的安全继续路径，Product MUST选择 typed diagnostic、风险报告或 Agent guidance

### Requirement: Buildr Release必须分离Readiness与Publication授权
`buildr-release` MUST默认先执行无副作用release readiness并向维护者展示全部findings、hosted deferred checks与next actions。只有维护者对当前frozen context明确授权publication后，Agent才可调用显式dispatch动作；Task完成、Candidate通过、历史发布授权或命令成功 MUST NOT替代本次publication授权。

#### Scenario: 维护者只要求准备或检查
- **WHEN** 维护者要求准备候选版、检查release或查看是否可发布但未明确授权publication
- **THEN** Agent MUST停在readiness Result并报告`effects: []`与hosted deferred checks
- **AND** MUST NOT dispatch workflow、请求`npm-production`approval或执行任何公共mutation

#### Scenario: 维护者明确授权publication
- **WHEN** 维护者在看到current frozen context后明确要求发布
- **THEN** Agent MUST把该授权交给唯一dispatch adapter并跟踪同一workflow run/attempt
- **AND** 不得另行创建tag、调用本机npm publish、dispatch第二workflow或生成第二tarball

#### Scenario: 发布attempt失败
- **WHEN** hosted transaction返回partial或failed evidence
- **THEN** Agent MUST先回读current attempt evidence并按`same-attempt`、`new-attempt`或`blocked-new-version`恢复分类解释已成立事实与下一步
- **AND** MUST NOT把Publication、Delivery、Activation、Environment Cleanup、Diagnostics或dev convergence互相改写

### Requirement: 候选版准备Task必须覆盖完整准备结果并与support交付分离
Buildr Release workflow MUST让唯一`release-<version>` Task表达维护者要求的完整发布生命周期，并将需要在Candidate前独立完成Development、Verification与Finish的版本材料、测试修复或owner修复建模为窄release support Task。协调Task MUST从selection持续保持active到Publication、post-publication dev provenance reconciliation与必需closeout完成；support Task terminal、Task Finish delivery、self-bootstrap activation、单次Candidate运行或readiness通过 MUST NOT单独使release Task completed。

#### Scenario: release材料需要在Candidate前交付
- **WHEN** package version、CHANGELOG、README、测试修复或release owner修复必须进入当前release集合
- **THEN** Agent MUST在基于current `dev`的独立support Task worktree完成该内容自己的Development、Verification、Finish与适用self-bootstrap
- **AND** delivered dev commit MUST再以`cherry-pick -x`选择到既有release集合；Agent MUST NOT直接在release worktree修复后把整条release历史合并回dev

#### Scenario: Candidate失败
- **WHEN** current release source的完整Candidate aggregate失败、缺失或与selection identity不匹配
- **THEN** release Task MUST保持active或blocked并报告失败run/source和同一Task恢复动作
- **AND** Agent MUST NOT调用release Task Finish/complete、把support delivery当成发布完成或创建第二个同version协调Task

#### Scenario: 候选版准备达到授权终点
- **WHEN** current release selection已冻结、完整Candidate aggregate通过、唯一tarball成立、release→main tree相等且dispatch-check readiness以`effects: []`通过
- **THEN** release workflow MUST保持同一协调Task active并报告等待current frozen context的publication授权
- **AND** Task状态、Candidate通过或历史授权 MUST NOT替代维护者本次明确授权

#### Scenario: publication和必需closeout完成
- **WHEN** protected transaction、正式readback、matching dev provenance reconciliation与全部必需local/intermediate closeout成立，且正式远端release ref已按本轮授权完成保留或安全清理并核验
- **THEN** Agent MAY以no-change完成唯一`release-<version>`协调Task并报告完整发布与closeout事实
- **AND** 新发布授权 MUST明确包含本轮正式发布分支及临时分支清理；旧授权缺少该政策时 MUST保留原行为，不要求第二协调Task

#### Scenario: 历史release Task被提前完成
- **WHEN** 旧版本在本Requirement生效前已有错误terminal协调Task
- **THEN** Agent MUST保留历史记录，不得改写SQLite、伪造Task reopening或把旧事实迁移为current
- **AND** 新的唯一Task约束 MUST适用于后续version，产品不得继续把resume、refresh或finalize作为正常恢复模型

### Requirement: Buildr Release Skill必须消费current lifecycle与closeout结果
`buildr-release` MUST按release lifecycle read model恢复同一version和Task，只在阶段需要时调用selection、Candidate、readiness、protected transaction、Git reconciliation与closeout owner。Skill MUST报告Publication与后续维护的正交状态，并 MUST NOT通过聊天摘要、Task标题或新建协调Task补造阶段。

#### Scenario: 等待授权后继续发布
- **WHEN** lifecycle为`awaiting-publication-authorization`且维护者明确授权matching context
- **THEN** Skill MUST展示本轮分支清理范围，并以同一Task、generation与context dispatch protected transaction，绑定已获授权的清理政策并继续跟踪后续阶段
- **AND** MUST NOT创建finalize Task、重新pack或沿用其他context授权

#### Scenario: main→dev或closeout受阻
- **WHEN** Publication已成立但dev provenance reconciliation或必需closeout返回blocked及recovery identity
- **THEN** Skill MUST保留同一active Task并从该identity恢复对应owner
- **AND** MUST NOT撤销Publication、写入dev、重跑已通过Candidate或创建resume Task

### Requirement: Buildr Release Skill必须消费统一发布编排结果
`buildr-release` MUST使用release orchestration runner推进merge后readiness、显式授权dispatch与Publication后closeout，同时继续把selection、transaction、Git convergence、Task Record、Worktree、Release Preparation和Doctor视为独立owner。Skill MUST在每次暂停或恢复时报告current action、context/timeline identity、已成立effects与唯一next action，不得用聊天摘要补造阶段或成功事实。

#### Scenario: readiness完成后请求唯一publication授权
- **WHEN** release→main已合并且orchestration `prepare-dispatch`返回current frozen context与`awaiting-publication-authorization`
- **THEN** Skill MUST向维护者展示该context digest和唯一publication授权决定并停止
- **AND** MUST NOT自动dispatch、把历史授权当作current授权或完成release Task

#### Scenario: 授权后dispatch发现context漂移
- **WHEN** 维护者授权的expected context digest与dispatch时重新读取的current context不一致
- **THEN** Skill MUST保持同一active release Task并返回readiness owner的blocked事实
- **AND** MUST NOT重建近似context、沿用旧授权或dispatch第二workflow

#### Scenario: Publication后恢复closeout
- **WHEN** Publication已成立但reconciliation、release resource closeout、Task completion、Environment cleanup或Doctor尚未完成
- **THEN** Skill MUST以同一orchestration identity只恢复尚未完成的owner步骤
- **AND** MUST NOT重跑Publication、撤销已成立effects或创建resume/finalize协调Task

### Requirement: task-triage 必须分离任务登记与代码更新
Agent MUST 在创建或激活任务前确认用户目标、目标工作空间、任务范围、已有匹配记录与写入授权，更新已有记录时 MUST 使用已观察版本。任务登记 MUST NOT 以 Git 更新、干净工作目录、集成分支、上游引用、Git 提供者或全局 Doctor 就绪为前置。代码更新与后续专业动作 MUST 按实际用户目标及当前事实独立选择；登记成功 MUST NOT 被解释为代码、环境、验证或交付已经就绪。

#### Scenario: 仅登记或激活任务
- **WHEN** 任务目标、范围和授权明确，记录输入合法
- **THEN** Agent MUST 直接创建或激活任务，MUST NOT 为登记执行 fetch、rebase 或工作空间同步

#### Scenario: 本地存在未提交内容或进行中的 Git 操作
- **WHEN** 合法任务登记范围内存在未提交内容或进行中的 Git 操作
- **THEN** Agent MUST 保留 Git 现场并允许记录写入
- **AND** 后续代码修改 MUST 独立核对归属和冲突，无法安全执行时只暂停对应动作

#### Scenario: 离线或上游无法解析
- **WHEN** 网络不可用、上游缺失或集成分支无法唯一解析，但记录目标与范围明确
- **THEN** Agent MUST 允许合法登记，MUST NOT 猜测 dev 或修改分支与上游

#### Scenario: Git 提供者不可用
- **WHEN** optional Git Operations 提供者不可用且当前只需任务登记
- **THEN** Agent MUST 使用可用的任务记录提供者完成合法登记，不将 Git 依赖提升为必需

#### Scenario: 用户另行要求更新代码
- **WHEN** 用户目标确实需要更新明确仓库与引用，并且相应授权成立
- **THEN** Agent MUST 使用已选 Git Operations 提供者独立执行并保留实际结果
- **AND** 更新失败 MUST NOT 撤销已成立的任务登记或扩大为无关记录写入的阻塞

#### Scenario: 登记自身条件不成立
- **WHEN** 任务目标、范围、授权或记录版本不明确，或记录输入非法
- **THEN** Agent MUST 停止对应记录写入并说明最小缺口

### Requirement: 收尾技能检查不得固化过程文案
技能检查 MUST只执行通用结构、资源完整性与能力绑定约束，不要求旧流程关键字、最低字数或最低行数。

#### Scenario: 合法短技能
- **WHEN** 收尾技能内容满足通用格式及真实能力契约，但没有旧交接文案且少于旧字数下限
- **THEN** 静态检查 MUST允许通过，不要求补回已退役流程或无意义文字。

### Requirement: 默认收尾必须由技能指导智能体完成目标
默认收尾 MUST由智能体（Agent）依据用户目标和真实现场组合原生 Git、系统工具和现有 Buildr 接口；技能（Skill）MUST不要求候选、交接、五阶段运行、完整环境或对账结果。专项能力只在实际适用时触发。

#### Scenario: 已有任务
- **WHEN** 目标实际达成且用户授权范围明确
- **THEN** 智能体 MUST复用 `task complete` 保存结果，分别说明交付、验证、激活和资源残留；不得为完成记录补造交接。

#### Scenario: 没有任务或非代码成果
- **WHEN** 当前工作没有匹配任务或没有 Git 变化
- **THEN** 智能体 MUST直接完成适用交付及善后，不创建临时任务、不制造提交。

#### Scenario: 多仓库部分成功
- **WHEN** 一个仓库已交付，另一个仓库受阻
- **THEN** 智能体 MUST保留已成立结果，只处理剩余仓库，不重复推送成功项。

#### Scenario: 内部缺口
- **WHEN** 内部记录缺失但真实结果可观察
- **THEN** 智能体 MUST继续其他安全工作；仅在越权、错误对象、数据丢失或完成误报风险处停止相关动作。

### Requirement: 收尾必须独立于研发交接且按动作检查安全
收尾与交付在日常意图中 MAY表示同一结束目标；task-finish MUST根据真实目标处理成果、已有记录及安全清理，MUST不要求候选、交接或统一验证链。已有正式任务的必要说明与过程材料 MUST 按目标核对记录 brief 保存、过程文件成果交付、材料引用和任务节点实际可读性；记录正文、文件关联与 Task 状态 MUST 分别核对，普通链接可打开不等于说明节点可读。

#### Scenario: 四类组合
- **WHEN** 任务有无 Buildr 记录与有无 Git 管理形成四种组合
- **THEN** 仅调用实际适用能力，无记录不建记录，无 Git 不制造提交

#### Scenario: 已有检查仍适用
- **WHEN** 内容和检查相关条件未改变
- **THEN** MUST复用已有结果，不因收尾、生成新提交或提交编号改变而追加验证

#### Scenario: 具体检查缺口
- **WHEN** 存在相关内容变化或已知错误
- **THEN** MUST选择覆盖实际影响的最小充分已有检查；如确需补测，MUST在推进目标分支前执行并通过，再集成推送。不得按测试条数代替风险和执行成本判断，不创建统一门禁

#### Scenario: 部分成功
- **WHEN** 交付成立但登记或清理失败
- **THEN** 保留交付，继续安全必要动作，说明遗留

#### Scenario: 材料与交付分别核对
- **WHEN** 正式任务的记录说明尚未保存或读取失败，或其他过程文件已交付但引用缺失、引用存在但文件不可读
- **THEN** 收尾 MUST 如实区分记录说明保存、其他文件交付、关联与局部读取缺口，并在授权内处理必要缺口
- **AND** MUST NOT 以 Task completed、Git 推送或顶部链接可打开冒充材料齐备；本机材料清理 MUST NOT 自动完成任务或删除工作树

### Requirement: 正式研发必须由 Agent 直接组合专业能力
Buildr MUST让Agent依据Task目标和真实现场按需组合实际工作位置、OpenSpec、Current Knowledge、Task Review、Task Verification、Git与默认`task-finish` Skill，MUST NOT要求Environment Receipt、统一`ready|blocked`、Development Receipt、Task Candidate或Development Handoff。

#### Scenario: 带OpenSpec的实现任务
- **WHEN** active Task在已核对的当前Workspace或matching Worktree中创建、实施并收敛OpenSpec Change
- **THEN** Agent MUST可直接完成strict validation、semantic preflight、实现、Current Knowledge、convergence、Review、Verification与交付
- **AND** 全程 MUST不创建Environment许可或研发聚合事实

#### Scenario: 内容变化后重新检查
- **WHEN** Review或Verification后真实内容变化
- **THEN** Agent MUST根据实际subject/content identity判断并重做受影响检查
- **AND** MUST不创建统一stale状态、候选代次或Environment恢复动作

### Requirement: 内置场景化 Skills 必须围绕真实产物协作
Buildr内置Task与OpenSpec Skills MUST让Agent依据目标和真实现场按需选择Task Record、Current Knowledge、Review、Verification、Git、Worktree、具体资源owner与默认task-finish能力，不得路由已退役工作流。

#### Scenario: 普通实现达到可交付状态
- **WHEN** Agent已完成实现并取得任务所需的实际检查结果
- **THEN** Agent MUST可直接进入适用的审查、验证或交付动作
- **AND** MUST不创建Task Environment、Task Candidate、generation或Development Handoff

### Requirement: 内置任务 Skills 只依赖实际需要的能力契约
Task Triage MAY按需消费Task Record、Git Operations、Current Knowledge与Worktree；task-finish MAY调用Task Record、Git Operations、Worktree和具体资源owner。Capability graph MUST不包含普通OpenSpec、Review、Verification或Finish对Task Environment的依赖。

#### Scenario: 解析任务能力图
- **WHEN** package或runtime解析内置Task/OpenSpec Skills
- **THEN** 每个consumer MUST只因实际动作需要而声明依赖
- **AND** Worktree、Preview或其他可选专业能力缺失 MUST只影响对应动作，不得扩大为全局阻塞

### Requirement: OpenSpec workflow 必须直接组合当前认知维护
OpenSpec propose、update、apply、sync与archive contributions MUST按真实知识影响调用Current Knowledge provider；Current Knowledge结果直接交给Agent解释，不经研发聚合模块转发。

#### Scenario: Change实现改变当前知识
- **WHEN** Agent完成实现并准备收敛Change
- **THEN** Agent MUST按impact完成reconcile并重新观察交付内容
- **AND** OpenSpec convergence MUST不依赖任务研发回执

### Requirement: Task Review 与 Task Verification 必须保持独立
Review与Verification MUST分别记录真实审查和验证结果。Agent MUST依据目标、当前对象和风险判断是否调用及如何消费；Application MUST不生成统一推进决定。

#### Scenario: 内容在检查后变化
- **WHEN** 已审查或验证对象的真实identity发生变化
- **THEN** Agent MUST只重做受影响的检查
- **AND** MUST不建立统一stale状态或候选代次

### Requirement: OpenSpec Change checklist 必须止于 Change disposition
Buildr-owned OpenSpec contributions MUST只把归档前可完成的实现、知识收敛、验证反馈和convergence readiness写入`tasks.md`。交付、Task terminal transition与Environment cleanup由Agent在Change外按实际需要完成。

#### Scenario: Change checklist全部完成
- **WHEN** Change已满足convergence和archive条件
- **THEN** checklist MUST允许Change归档
- **AND** MUST不要求Task Candidate、Development Handoff或旧Finish运行

### Requirement: 任务复盘必须由Agent按用户意图直接完成
用户明确要求复盘终态Task时，Agent MUST使用`task-retrospective` Skill读取当前事实、生成固定本机Markdown并通过Task Record登记。Task完成本身 MUST不自动提示、生成、登记或要求复盘。

#### Scenario: 用户在任务完成后要求复盘
- **WHEN** 用户明确要求复盘指定终态Task
- **THEN** Agent MUST直接组合Task、Git、代码、测试和适用专业结果形成文档
- **AND** MUST不调用独立Retrospective Application、内部Driver或统一流程门禁

### Requirement: Task Review与任务复盘必须保持职责独立
Task Review MUST继续审查方案或完成结果；任务复盘Skill MUST只分析实际执行过程与改进。两者 MUST不合并为通用审查平台，也不得互相成为门禁。

#### Scenario: Task没有复盘
- **WHEN** Agent记录或读取Task Review、执行Verification或完成Task
- **THEN** 动作 MUST不要求复盘文档或决定状态

### Requirement: Task Verification Skill 必须先选择合法 invocation
Buildr 投射的 Task Verification Skill MUST 在调用命令前区分项目检查 invocation 与 current report writer invocation。对于 Buildr 自举 linked worktree，Skill MUST 给出 canonical retained Product bridge；对于普通 Workspace，Skill MUST 使用该 Workspace 的已安装或 retained Buildr，且 MUST NOT 把 `--target` 描述成 writer provenance。

#### Scenario: Agent 从自举 Task worktree 记录验证
- **WHEN** Agent 读取 Task Verification Skill 并发现当前 execution root 是 canonical Workspace 的 linked Task worktree
- **THEN** Skill MUST 指导 Agent 在 worktree 执行检查、在 canonical retained Product bridge 执行 report `inspect|record`
- **AND** Agent MUST 能在第一次写调用前完成选择而无需消费一次 provenance rejection

#### Scenario: 普通 Workspace 记录验证
- **WHEN** Agent 在非 Buildr Product 自举 Workspace 保存 Task Verification Report
- **THEN** Skill MUST 指导 Agent 使用该 Workspace 当前合法的 installed/retained Buildr writer
- **AND** MUST NOT 假设该 Workspace 存在 `projects/product/buildr`

### Requirement: OpenSpec 接入必须复用上游并保持动作范围
Buildr OpenSpec contributions MUST通过自有增强片段补充当前工作根、既有授权的延续、相关检查复用和必要恢复，保持上游技能原文；MUST保持独立同步不归档、显式归档按目标执行，不将辅助状态提升为统一工作许可。

#### Scenario: 实现或同步继续
- **WHEN** 用户继续实现或只同步规范
- **THEN** 智能体按授权动作工作，不默认升级为归档

#### Scenario: 延续明确授权
- **WHEN** 用户已明确授权同一目标的规划与实现或一组材料修订
- **THEN** 增强指引 MUST保留该授权，在当前动作完成后接续适用动作，不按阶段或文件重复请求确认；仅规划请求仍停止于规划

#### Scenario: 普通错误与真实决定
- **WHEN** 已授权动作遇到错误
- **THEN** 增强指引 MUST允许在范围内修复可逆错误并复查，只对无法确定的业务语义、扩大授权、不可逆风险或错误对象写入暂停；不得绕过命令的阻塞状态

#### Scenario: 阶段检查复用
- **WHEN** 从提案转入实现且已有检查仍覆盖当前内容与相关现场
- **THEN** 增强指引 MUST复用有效结果；材料、检查规则或相关进行中变更改变时，只刷新受影响检查

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

### Requirement: 开发收尾必须消费明确的远端清理政策
任务级临时引用（如任务分支（Branch））的远端生命周期全程受明确授权约束：智能体（Agent）MUST NOT在没有用户指令、任务声明交付方式或适用于该仓库的持续授权时把任务分支推送到远端，通用“收尾”指令本身 MUST NOT被解释为远端任务引用的创建或删除授权。授权推送任务引用时 MUST 同时确定其生命周期处置，默认随用途结束删除。交付后收尾技能（Skill）MUST核对任务范围内每个仓库是否存在本任务远端引用，只在删除授权覆盖且归属、交付保全与无活动用途均证明时按实时观察提交条件删除；删除不可得时 MUST逐项报告保留原因，不得静默残留。仓库自行声明的常驻引用 MUST保留；发布引用由发布能力按绑定政策处理。

#### Scenario: 无授权的远端创建
- **WHEN** 任务分支没有用户指令、任务声明交付方式或仓库持续授权覆盖远端创建
- **THEN** 智能体（Agent）MUST NOT推送该任务分支到远端或为完成收尾上传它
- **AND** 获得推送授权时 MUST 同时记录该引用的生命周期处置

#### Scenario: 交付后枚举本任务远端引用
- **WHEN** 交付核验完成且任务范围包含仓库集合
- **THEN** 收尾 MUST对每个仓库以任务分支名查询实际远端，不依赖当次会话记忆
- **AND** 仓库声明的常驻引用 MUST保留，不作为处置对象

#### Scenario: 直接交付开发主线
- **WHEN** 任务未经过合并请求（Pull Request），已完成直接交付且仓库政策授权清理本任务临时引用
- **THEN** 智能体（Agent）MUST核对精确归属、交付保全、无活动用途和实时提交后条件删除并回读
- **AND** MUST不把GitHub合并后自动删除设置当作已经完成清理的证据

#### Scenario: 合并后自动删除
- **WHEN** GitHub已删除合并请求（Pull Request）的临时引用
- **THEN** 收尾 MUST核对实际合并与远端不存在并复用该事实，不重建或重复删除

#### Scenario: 保留必要工作和报告残留
- **WHEN** 引用有未交付内容、开放合并请求（Pull Request）、未结束运行、漂移、归属未知或删除授权未覆盖
- **THEN** 收尾 MUST保留相关对象并逐项说明原因，授权缺失时向用户提出最小授权问题或如实说明未决残留，继续其他安全工作
- **AND** MUST分别说明已删除、已不存在和仍保留项，不以任务完成或笼统cleaned替代远端观察

### Requirement: Git Operations 条件删除远端引用
selected `buildr.git-operations/v1` provider MUST 支持 consumer 明确选定的 `delete-remote-ref` 操作（Operation）：consumer 提供实际 repository、remote、精确 ref、已观察远端提交与允许的远端 effect；provider MUST 在写远端前核对实际远端 tip 仍等于已观察提交，只删除该引用并回读确认。

#### Scenario: 按观察提交删除
- **WHEN** consumer 提供明确授权、精确 remote/ref 与已观察远端提交，且实际远端 tip 仍匹配
- **THEN** provider MUST 只删除该引用并回读远端确认不存在
- **AND** MUST NOT 删除其他引用、改用无条件删除或扩大授权范围

#### Scenario: 远端漂移或不可观察
- **WHEN** 删除前实际远端 tip 与已观察提交不一致、远端无法可靠观察或归属不明
- **THEN** provider MUST 在远端零写入状态返回 `blocked`
- **AND** MUST 保留已发生的其他独立 Result

### Requirement: 任务目标必须写成简洁清晰的任务需求
Buildr 任务指引 MUST 将 `intent`（目标）定位为一句话级的任务目标与入口定位，而不是完整需求正文。每个新正式执行任务（Task）MUST 在登记与实际工作位置核对后，由任务管理技能（task-manager）形成并保存独立任务说明（Task Brief）到任务记录的 brief 字段，真实表达问题或需求、目标、必要范围与非目标和完成依据；简单任务 MUST 允许简短正文但不得缺失或为空占位。说明 MUST 随理解及已确认范围更新，未知事实 MUST 明示，不强制长模板。任务 MAY 关联零到多个 OpenSpec Change；变更说明（Change Brief）MUST 解释各自具体规范变化并引用唯一任务正文，不重复维护同义任务需求。

#### Scenario: 创建任务时书写需求
- **WHEN** Agent 调用 `task create` 或修订正式执行任务的目标
- **THEN** `intent` MUST 清晰概括任务目标，任务的完整问题、范围和完成依据 MUST 位于独立 Task Brief
- **AND** MUST NOT 只写标题复述、内部记号，或通过拉长 intent 替代正文

#### Scenario: 变更 Brief 与任务目标的分工
- **WHEN** Task 关联一个或多个 OpenSpec Change
- **THEN** Task `intent` MUST 保持短目标，唯一 Task Brief MUST 保持任务级整体需求
- **AND** Change `brief.md` MUST 只解释该变更并引用 Task Brief，两者 MUST NOT 相互复制正文或相互矛盾

#### Scenario: 无 Change 的简单正式任务
- **WHEN** 正式新任务只需一次简单修复或文档维护且 `changes` 为空
- **THEN** 智能体（Agent）MUST 在 Task Record.brief 保存真实短说明，使任务说明节点可直接读取
- **AND** MUST NOT 把空材料、普通顶部链接或 intent 当作已形成任务说明

#### Scenario: 接续旧任务
- **WHEN** 旧任务的记录 brief 为空，而智能体（Agent）主动接续其当前目标
- **THEN** 智能体（Agent）MUST 核对适用正文，通过产品动作显式导入已关联旧正文或形成当前记录说明，并如实说明本次来源和补写
- **AND** MUST NOT 批量补造、改写过去时间、旧 Change Brief、归档或专业历史

### Requirement: 任务检查必须分别判断适用性
Buildr 任务指引 MUST 分别按实际目标、方案选择、范围、风险与完成证明需要判断方案审查（Planning Review）、实现审查（Implementation Review，兼容接口类型 `completion`）和任务验证（Task Verification），MUST NOT 将三项默认触发机械绑定到 `change-flow` 或是否采用 OpenSpec。方案审查 MUST 核对任务需求与真实方案的完整性、合理性及一致性；实现审查 MUST 核对实际成果是否兑现当前任务需求与适用方案；任务验证 MUST 检查完成依据所需的真实结果。方案可来自任务文档、设计、清单或专业产物，OpenSpec artifacts 只是其中一种来源。专业结果继续由各自应用（Application）维护，不新增统一就绪、审批或适用性状态库；结果存在或缺失 MUST NOT 自动成为完成、归档或交付门禁。以下旧场景标题仅为规范条目的兼容身份，MUST 以更新后的 WHEN/THEN 判断行为，MUST NOT 根据标题恢复按路径默认两次审查或排除非变更任务的规则。

#### Scenario: change-flow 任务默认两次审查
- **WHEN** `change-flow` 任务的真实方案风险和实现风险分别需要审查
- **THEN** 指引 MUST 在适用对象可读时执行 Planning Review，并在实现对象稳定时执行 Completion Review，按现有语义保存真实结果
- **AND** MUST 根据完成证明需要独立选择 Task Verification，不以两次审查替代验证

#### Scenario: 非变更路径不默认审查
- **WHEN** Task 为 `code-only`、`spec-maintenance` 或其他不采用 OpenSpec 的路径
- **THEN** 指引 MUST NOT 仅凭路径自动添加或排除审查、验证，而 MUST 按目标、真实方案和风险分别判断
- **AND** 用户明确要求或真实风险需要时 MUST 可执行并记录，MUST NOT 要求先创建 Change

#### Scenario: 默认审查缺失不形成门禁
- **WHEN** 所需审查未执行、结论为 `changes-requested` 或审查对象已变化
- **THEN** Task 完成、Change 收敛归档与交付 MUST 不被该记录事实自动阻塞
- **AND** Agent MUST 如实说明覆盖、未完成事项和原因；必要目标或风险尚未解决时 MUST NOT 声称整体完成，也不得把未完成表述为不适用或已通过

#### Scenario: 必要检查尚未完成
- **WHEN** 方案审查、实现审查或验证已判断需要，但材料缺失、工具不可用或执行尚未结束
- **THEN** 智能体（Agent）MUST 在既有方案或工作摘要中说明需要、当前缺口和下一步，专业应用只保存已形成的真实结果
- **AND** MUST NOT 标记“不适用”、生成通过占位或为等待检查新增审批状态

#### Scenario: 本次检查确实不适用
- **WHEN** 当前目标、方案与风险没有某项审查或验证的实际需要
- **THEN** 智能体（Agent）MUST 给出与本次事实相符的简短理由，可保存在既有材料或工作摘要中
- **AND** MUST NOT 仅因没有 Change、没有结果或尚未执行就推断不适用

### Requirement: 收尾登记完成前必须补登已发生的审查与验证证据

收尾指引 MUST 在登记任务完成前加入就近核对：Task 仍为 `active` 时，若本次实际执行过验证或审查但对应 Task Verification Report 或 Task Review Result 尚未登记，Agent MUST 先完成登记再执行完成动作；不得补造未发生的检查或审查，也不得把缺失登记升级为完成门禁。该要求只保证已发生事实不越过终端写入窗口，不要求新增检查。

#### Scenario: 已发生证据尚未登记

- **WHEN** Agent 即将调用 `task complete`，且本次实际执行的检查或审查尚未保存为对应 Report/Result
- **THEN** 指引 MUST 要求先登记该证据，再登记任务完成
- **AND** MUST NOT 因登记动作补跑无关检查或虚构未发生的验证

#### Scenario: 无待登记证据

- **WHEN** 本次没有实际执行过需要登记的检查或审查
- **THEN** 完成登记 MUST 直接继续，MUST NOT 因没有报告而推断验证缺失或阻塞完成

### Requirement: 规划材料齐备声明前必须核对变更 Brief 存在

OpenSpec `propose` 增强指引 MUST 要求 Agent 在声明规划材料齐备或移交审查/实现前，确认 Change root 内 `brief.md` 实际存在且为本次生成的有效文件；缺失时 MUST 先补齐或如实说明不适用原因，不得把缺失文件表述为已就绪。该核对是文件存在性自查，不新增审批门禁或第二份规范来源。

#### Scenario: 规划完成前的 Brief 自查

- **WHEN** Agent 完成 proposal、design、specs、tasks 并准备报告规划结果
- **THEN** Agent MUST 核对 `brief.md` 存在于当前 Change root
- **AND** 缺失时 MUST 先创建或向用户说明缺口，MUST NOT 直接把缺失状态报告为完整

#### Scenario: 既有变更缺少 Brief

- **WHEN** 接续的既有 Change 缺少 `brief.md`
- **THEN** Agent MUST 如实说明 Brief 缺失并继续提供现有材料
- **AND** MUST NOT 伪造一份虚构 Brief 冒充历史产物

### Requirement: 自举工作空间必须保留内部预览技能

Buildr 自举工作空间 MUST 保留 workspace-local 的 `buildr-dev-preview` 技能（Skill），用于在 Buildr 自身开发与验收中按"开发工作树代码 + 指定数据源"启动 Buildr Web 预览。该技能 MUST 以 `skills/` 工作空间源资产存在并登记进 `skills/manifest.yml`；MUST NOT 进入产品 package 的 `resources/`、内置 Skill 清单或用户 workspace 默认能力，MUST NOT 提供用户级安装说明。

技能 MUST 支持三种数据源模式：canonical workspace 实时任务库（读取 canonical `.buildr/local/workspace.sqlite`，工作树材料经受管工作树证据解析）、隔离 SQLite 快照（以一致副本为工作树 `.buildr/local/workspace.sqlite` 播种，不共享、不回灌）、空现场（无任务库依赖的 UI 验收）。技能 MUST 优先使用 `buildr web preview start|list|stop` 托管实例生命周期与 owner/secret 证据；托管路径不满足当前模式或存在已知缺陷时，MUST 如实降级为手工配方并显式说明预览身份证据差异。任一模式 MUST 使用独立 `BUILDR_APP_DATA_DIR`、随机 loopback 端口，并以工作树内 `projects/product/buildr` 开发入口运行被预览代码；MUST NOT 改写 canonical 任务库内容、影响默认 Buildr Web 或 `Buildr Web Dev.app`，MUST NOT 以主目录旧文件冒充工作树材料。

#### Scenario: 维护者要求验收工作树中的前端改动

- **WHEN** 维护者请求"用开发工作树的代码 + 指定任务数据起一个 Buildr Web 页面"或等价意图
- **THEN** 当前宿主 MUST 发现 `buildr-dev-preview` 技能并按其流程选数据源模式、构建前端产物、启动隔离预览
- **AND** 输出的验收链接 MUST 能区分为开发预览身份

#### Scenario: 预览不在用户 workspace 中扩散

- **WHEN** 维护者检查产品 package 资源清单与用户 workspace 技能同步结果
- **THEN** `buildr-dev-preview` MUST NOT 出现在 package `resources/`、内置 Skill 清单或用户级安装说明中
- **AND** 自举工作空间自身的 `skills/manifest.yml` 登记保持可读且用途边界如实表达

#### Scenario: 托管路径不可用时降级并说明

- **WHEN** `buildr web preview start --task` 对当前目标不可执行（例如运行时端口缺口或所选模式不支持）
- **THEN** 技能 MUST 如实报告托管路径缺口，选择手工配方并说明实例 owner、secret 与停止责任不再受托管证据保护
- **AND** MUST NOT 把手工启动伪装成托管预览，也不得改写 canonical 数据补齐功能缺陷

### Requirement: 任务说明与材料管理必须遵守独立职责
任务管理技能（task-manager）MUST 指导在 Task Record.brief 形成、保存、更新和接续唯一任务说明（Task Brief），并按实际需要关联零到多个方案、实施和交付材料。任务说明 MUST 由记录维护唯一正文；方案、实施和交付正文 MUST 保留在真实项目或任务本机文件中，其引用 MUST 由独立任务材料应用（Task Materials Application）维护，MUST 不复制进任务记录或专业结果。旧说明只通过显式产品动作导入，原文件保留。Buildr-owned 技能（Skill）及 OpenSpec 增强片段 MUST 表达该分工，MUST NOT 通过修改第三方技能正文或受管投射落地。

#### Scenario: 任务说明更新
- **WHEN** 已确认目标理解或范围变化，需要更新 Task Brief
- **THEN** 智能体（Agent）MUST 重新读取记录 brief，按已观察 recordDigest 更新，并核对实际节点可读；其他过程文件与引用 MUST 按各自版本维护
- **AND** 说明变化 MUST 更新记录版本并保留适用的终态更正历史；其他过程材料保存 MUST 不重写任务状态或历史

#### Scenario: 多任务共享变更或文档
- **WHEN** 多个 Task 引用同一 Change 或适用文档
- **THEN** 各任务 MUST 保持自身独立的记录 brief；共享仅适用于 Change 逻辑引用与合法方案或过程文档
- **AND** 技能（Skill）MUST NOT 强制 Task 与 Change 一对一、覆盖另一任务的记录说明或过程引用

### Requirement: 原型到正式开发必须接续同一隔离位置

同一目标从已授权原型（Prototype）进入正式开发时，任务分流（Task Triage）MUST 核对并复用已有源码工作树（Worktree）、分支（Branch）和稳定隔离标识，MUST 保留未提交成果及确认版来源，MUST NOT 仅因阶段转换新建另一套位置。任务管理 MUST 在尚无正式任务且已有同目标隔离标识时核验后沿用该标识登记；已有匹配任务 MUST 继续使用原任务。工作树提供者 MUST 使用现有 inspect 核验归属，身份冲突 MUST 保留现场。正式任务正文 MUST 继续位于主工作空间数据库，不随隔离位置搬移。

#### Scenario: 原型先于正式任务形成源码位置
- **WHEN** 用户确认按已有原型实施，原型源码已有可核验的独占工作树（Worktree），且尚无匹配正式任务
- **THEN** 智能体（Agent）MUST 以已核对的隔离标识登记正式任务并复用该路径和分支（Branch）
- **AND** MUST 保留原型源码和未提交修改，不另建实施隔离或补造过去任务历史

#### Scenario: 已有正式任务进入开发
- **WHEN** 正式任务已在同一位置制作原型并获得实施授权
- **THEN** 智能体（Agent）MUST 接续该任务与位置，不因阶段或轮次变化重复创建

#### Scenario: 原型只有临时页面
- **WHEN** 原型没有源码检出位置，仅有独立临时 HTML
- **THEN** 智能体（Agent）MUST 按正常任务隔离策略创建开发位置并保全原型，不为页面回溯补造旧工作树（Worktree）

#### Scenario: 原型位置归属冲突
- **WHEN** 既有隔离标识、工作树（Worktree）或分支（Branch）无法证明属于当前同一目标
- **THEN** 智能体（Agent）MUST 保留现场，只停止依赖该位置的写入，MUST NOT 另建副本或覆盖登记绕过冲突
