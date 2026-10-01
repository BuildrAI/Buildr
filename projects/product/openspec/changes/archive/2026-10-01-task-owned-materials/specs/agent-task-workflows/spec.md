## RENAMED Requirements

- FROM: `### Requirement: 变更路径任务默认携带方案与实现审查`
- TO: `### Requirement: 任务检查必须分别判断适用性`

## MODIFIED Requirements

### Requirement: task-triage 必须输出正交且有证据的任务决策
Buildr 的 `task-triage` 技能（Skill）MUST 先核对任务相关事实，再分别判断语义治理、执行形态、材料深度、方案审查（Planning Review）、实现审查（Implementation Review，兼容接口类型 `completion`）和任务验证（Task Verification）的需要；后三项 MUST 根据实际目标、方案、范围、风险与证明需要分别判断，MUST NOT 继承 `change-flow` 的选择。输出 MUST 包含选择、代码库集合（Repository Set）、实际工作位置选择、最小依据、未决冲突和下一动作，并 MUST 只在适用时追加 OpenSpec 或正式任务（Task）状态。任务进度 MUST 由对话、任务记录（Task Record）、父子任务与各专业公开读取模型（Read Model）表达，不得创建第二份看板、环境权威或检查状态库。

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

#### Scenario: 无变更任务需要专业检查
- **WHEN** 不采用 OpenSpec 的正式任务存在方案取舍、实现风险或必要完成证明
- **THEN** 智能体（Agent）MUST 独立判断相应审查与验证，并交给各自能力执行
- **AND** MUST NOT 因 `code-only`、`spec-maintenance` 或空 `changes` 而省略需要的检查

#### Scenario: 材料深度与规范变化无关
- **WHEN** 简单任务不改变规范，或复杂任务需要多个规范变更
- **THEN** 每个新正式执行任务 MUST 仍形成真实任务说明（Task Brief），其他材料按实际需要保存
- **AND** MUST NOT 为材料展示强造 OpenSpec Change，也不得为凑齐节点生成占位报告

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

### Requirement: 任务目标必须写成简洁清晰的任务需求
Buildr 任务指引 MUST 将 `intent`（目标）定位为一句话级的任务目标与入口定位，而不是完整需求正文。每个新正式执行任务（Task）MUST 在登记与实际工作位置核对后，由任务管理技能（task-manager）形成并关联独立任务说明（Task Brief），真实表达问题或需求、目标、必要范围与非目标和完成依据；简单任务 MUST 允许简短正文但不得缺失或为空占位。说明 MUST 随理解及已确认范围更新，未知事实 MUST 明示，不强制长模板。任务 MAY 关联零到多个 OpenSpec Change；变更说明（Change Brief）MUST 解释各自具体规范变化并引用唯一任务正文，不重复维护同义任务需求。

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
- **THEN** 智能体（Agent）MUST 保存真实短 Task Brief 并建立正式材料引用，使任务说明节点可直接读取
- **AND** MUST NOT 把空材料、普通顶部链接或 intent 当作已形成任务说明

#### Scenario: 接续旧任务
- **WHEN** 旧任务没有独立说明关联，而智能体（Agent）主动接续其当前目标
- **THEN** 智能体（Agent）MUST 核对适用正文，显式关联已有文档或形成当前说明，并如实说明本次关联或补写
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

### Requirement: 收尾必须独立于研发交接且按动作检查安全
收尾与交付在日常意图中 MAY表示同一结束目标；task-finish MUST根据真实目标处理成果、已有记录及安全清理，MUST不要求候选、交接或统一验证链。已有正式任务的必要说明与过程材料 MUST 按目标核对正文保存、项目成果交付、本机引用和任务节点实际可读性；正文、关联与 Task 状态 MUST 分别核对，普通链接可打开不等于说明节点可读。

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
- **WHEN** 正式任务的说明正文已交付但本机关联缺失，或关联存在但正文当前不可读
- **THEN** 收尾 MUST 如实区分已交付正文、关联与局部读取缺口，并在授权内处理必要缺口
- **AND** MUST NOT 以 Task completed、Git 推送或顶部链接可打开冒充材料齐备；本机材料清理 MUST NOT 自动完成任务或删除工作树

## ADDED Requirements

### Requirement: 任务说明与材料管理必须遵守独立职责
任务管理技能（task-manager）MUST 指导形成、保存、显式关联、更新和接续唯一任务说明（Task Brief），并按实际需要关联零到多个方案、实施和交付材料。正文 MUST 保留在真实项目或任务本机文件中，引用 MUST 由独立任务材料应用（Task Materials Application）维护；任务记录（Task Record）与专业结果 MUST 不复制这些正文或状态。Buildr-owned 技能（Skill）及 OpenSpec 增强片段 MUST 表达该分工，MUST NOT 通过修改第三方技能正文或受管投射落地。

#### Scenario: 任务说明更新
- **WHEN** 已确认目标理解或范围变化，需要更新 Task Brief
- **THEN** 智能体（Agent）MUST 重新读取唯一正文及相关引用，按文件与引用各自的已观察版本更新，并核对实际节点可读
- **AND** Task Record MUST 只在其业务事实实际变化时更新，不因材料保存重写状态或历史

#### Scenario: 多任务共享变更或文档
- **WHEN** 多个 Task 引用同一 Change 或适用文档
- **THEN** 各任务 MUST 保持自身唯一说明引用，并允许共享正文与 Change 逻辑引用
- **AND** 技能（Skill）MUST NOT 强制 Task 与 Change 一对一、覆盖另一任务的引用或复制同义正文
