## MODIFIED Requirements

### Requirement: Task详情必须直接展示Task Record与独立专业事实
Buildr Web MUST 在任务详情直接展示任务记录（Task Record）的短目标、状态及独立任务说明（Task Brief）正文；正文 MUST 来自 Task Record.brief，MUST NOT 由 intent、聊天或关联变更说明替代。结果在收尾节点展示，Change、父子关系和复盘在对应阅读入口展示。审查（Review）与验证（Verification）MUST 独立读取并在所选节点直接呈现完整结果，父任务协调只在适用 Task 显示。页面 MUST 不请求 Task Overview、组合统一推进状态或根据材料及专业结果推断 Task 能否完成。

#### Scenario: 普通Task没有专业结果
- **WHEN** Task 只有 Task Record 和具有真实 brief 正文，而没有 Review 或 Verification
- **THEN** 任务详情 MUST 正常显示短目标与任务说明正文，已有结果仍可在收尾节点读取
- **AND** 专业结果缺失 MUST 不形成 Task 错误或全局阻塞，也不得被解释为通过或不适用

#### Scenario: 专业读取失败
- **WHEN** Review、Verification或父任务协调中的一个读取失败
- **THEN** 页面 MUST只在对应区域显示局部错误
- **AND** Task Record及其他已读取事实 MUST继续可见

#### Scenario: 有短目标但没有正式说明引用
- **WHEN** Task 具有 intent，但brief 为空或记录详情读取失败
- **THEN** 页面 MUST 保留短目标并如实显示说明缺失或局部诊断
- **AND** MUST NOT 把顶部普通链接可打开、intent 或变更说明当作独立说明已齐备

### Requirement: 任务详情必须按工作路径直接组织已有内容
默认页面 MUST 在列表旁的现有副屏紧凑展示标题、编码、短目标和状态，再以紧凑标签连接任务说明、方案设计、开发实现和任务收尾；方案审查 MUST 在方案设计内，实现审查和开发验证 MUST 在开发实现内；任务收尾不再提供常驻的「用户确认」目录项，验收设计另行决定。任务说明节点 MUST 直接展示Task Record.brief 的真实正文；方案、实施和交付 MUST 按实际关联材料组织，OpenSpec artifacts 只是来源之一。无说明材料时 MUST 如实表达缺失，不把 intent 当作说明正文；页面读取 MUST 不生成材料或报告。

#### Scenario: 读取完整任务
- **WHEN** Task 拥有真实 brief 正文、方案、实施和交付材料及专业结果，并可选关联 OpenSpec artifacts
- **THEN** 说明节点 MUST 默认直接展示 Task Brief 正文；设计节点 MUST 展示实际方案并可切换相关设计与规范，实施清单 MUST 在非模态浮窗中按需显示，实施节点 MUST 显示实现审查与开发验证摘要，设计与实现内部的审查 MUST 默认显示最新保存结论并可切换历次记录，开发实现内的验证 MUST 直接展示当前报告及检查依据，收尾 MUST 集中展示交付记录与适用的协同、复盘内容
- **AND** 多个关联变更及共享材料 MUST 标识来源，原始正文保持自身权威，不合并或选择主 Change

#### Scenario: 简单任务与空内容
- **WHEN** 简单 Task 没有方案材料或部分节点没有记录
- **THEN** 页面 MUST 保持四个主节点并如实显示空内容，MUST NOT 强制创建长文档、报告、子任务或错误状态；每个正式新任务的真实短 Task Brief 仍 MUST 由任务流程形成并保存到记录 brief
- **AND** brief 为空时说明节点 MUST 如实表达缺失，不把 intent 或旧正文冒充独立说明；历史空材料可继续只读查看，不自动补造

#### Scenario: 收尾不出现常驻用户确认
- **WHEN** 任务没有验收事项或答复记录
- **THEN** 收尾目录 MUST NOT提供「用户确认」目录项
- **AND** 页面其余目录与内容展示保持不变

#### Scenario: 当前工作与阅读选择不同
- **WHEN** 智能体记录 implementation 表示验证失败后的修复，而用户在方案设计内选择方案审查
- **THEN** 页面 MUST同时保留实现处的当前标记与方案设计及其内部方案审查的阅读选中态，显示保存的失败结果与当前实现标记
- **AND** 没有明确 stage 时 MUST不标记当前节点；MUST NOT从文件存在、清单数量或 active 状态推断当前节点、自动执行或通过

#### Scenario: 无 OpenSpec 的任务材料
- **WHEN** Task 的 `changes` 为空，但具有合法任务本机或项目来源材料
- **THEN** 任务说明节点 MUST 直接读取记录 brief；其他节点 MUST 按角色读取相应材料正文
- **AND** MUST NOT 为展示伪造 Change identity 或要求先采用 OpenSpec

#### Scenario: 历史变更说明兼容阅读
- **WHEN** 旧任务的记录 brief 为空，但关联 Change 提供旧说明
- **THEN** 页面 MUST 在方案辅助来源保留变更说明只读入口并分别标识来源，任务说明 MUST 明确显示尚未填写
- **AND** 记录 brief 填写后 MUST 直接读取该字段；读取失败或空值 MUST 不通过旧文件或变更说明回退掩盖

### Requirement: 任务材料必须读取任务的实际文件现场
任务详情 MUST 按独立材料引用、任务关联、项目范围与受管工作树（Worktree）证据选择实际文件根；存在可用工作树时项目材料 MUST 读取其中未提交的方案、规范、清单、原型及任务引用的项目文档；其他任务本机材料正文 MUST 从主工作空间（Canonical Workspace）的固定任务材料目录读取。副屏 MUST 标识来源，不能混用保留副本正文。服务目标本身是任务的 linked worktree 时，材料解析 MUST 仍按同一证据身份选择文件根，不得因目标形式退回保留目录或报工作树不可读取。普通材料读取 MUST 不依赖 OpenSpec 查询可用性。

#### Scenario: 工作树与主目录不同
- **WHEN** 同一相对文档在工作树中已修改而主目录仍是旧内容
- **THEN** 页面 MUST展示工作树正文；后续相对文档链接 MUST保持该任务现场

#### Scenario: 服务目标为任务工作树
- **WHEN** 预览或快照以服务目标直接指向任务的 linked worktree，且任务库副本提供任务记录
- **THEN** 任务材料解析 MUST 使用该 worktree 的证据身份读取候选工作副本
- **AND** MUST NOT 以 canonical 目录同名文件冒充当前内容，也不得报工作树不可读取

#### Scenario: 工作树缺失或身份漂移
- **WHEN** 已关联的工作树无法证明身份，或选定工作树中的文件缺失
- **THEN** 对应入口 MUST显示明确诊断或缺失，MUST NOT静默使用主目录同名文件冒充当前内容
- **AND** 已安全清理工作树、当前无工作树关联时 MUST可读取保留目录或归档内容并标明来源

#### Scenario: 限定文档范围
- **WHEN** 请求项目文档不属于任务项目范围、任务本机文档不属于该任务固定目录，或路径越界、为符号链接或非 Markdown
- **THEN** 任务文档入口 MUST 拒绝读取，不能成为任意文件读取接口

#### Scenario: 从列表查看并切换任务
- **WHEN** 用户在筛选后的任务列表点击任务，再切换另一个任务
- **THEN** 系统 MUST复用已有副屏，主屏列表保持可操作且不重置筛选、已加载批次或滚动；MUST NOT创建嵌套分屏
- **AND** 每个新打开的任务 MUST 默认显示正式 Task Brief 正文或真实缺失状态，后台当前节点变化不得强制改变阅读选择

#### Scenario: 归档后点击稳定说明引用
- **WHEN** 用户从 active 或 archived Change Brief 点击 `@task/<task-id>` 逻辑任务引用
- **THEN** 页面 MUST 在同一工作空间打开同一任务记录中的说明，不受归档目录深度变化影响
- **AND** 普通相对引用 MUST 保持既有语义，MUST NOT 因逻辑前缀扩大文件读取范围

#### Scenario: 失效 Change 不阻断普通正文
- **WHEN** Task 的 Change 引用不可解析，但独立任务本机或项目材料合法可读
- **THEN** 页面 MUST 继续显示安全可读材料，只在 Change 来源显示对应局部诊断
- **AND** MUST NOT 因 OpenSpec 不可用而跳过 记录 brief 或其他普通材料

### Requirement: 节点阅读必须连续且内容按判断需要取舍
页面 MUST 记住每个节点选中的文档、审查记录与阅读位置，关联阅读返回 MUST 恢复原上下文；打开新任务 MUST 默认显示独立任务说明（Task Brief）正文或其真实缺失状态。页面 MUST 优先呈现实际阶段、结论、问题及未覆盖范围，MUST NOT 堆叠重复标题、无内容栏目或内部结果摘要值。历史通过 MUST 明确表达为最近保存的结论，不能推导当前版本通过。任务唯一说明与零到多个 Change 的兼容说明 MUST 区分来源，不互相覆盖。

#### Scenario: 对照方案与实现
- **WHEN** 用户选择设计文档，切到开发实现，再返回方案设计
- **THEN** 页面 MUST保持所选设计文档和阅读位置，不退回默认提案

#### Scenario: 多份需求名称相同
- **WHEN** 旧任务关联多个变更且均有 brief，而记录 brief 为空
- **THEN** 兼容内容选项 MUST 用关联变更名称及来源区分，并标明它们不是已建立的独立任务说明；单文件 MUST 从辅助入口读取其历史正文
- **AND** 记录 brief 有正文时 MUST 默认直接读取该正文，MUST NOT 合并旧 brief 或推断主 Change

#### Scenario: 收尾中确认成果
- **WHEN** 任务具有验收事项或答复记录
- **THEN** 历史答复数据仍可由记录面读取；任务收尾目录 MUST NOT提供常驻「用户确认」阅读项
- **AND** 保存意见与任务完成动作的既有约束不因本项调整而改变

### Requirement: intent 的产品定位是短目标而非完整需求
Buildr 面向用户的目标字段（`intent`）MUST 表达一句话级别的任务目标与入口定位；问题、背景、必要范围与非目标、完成依据等完整任务说明 MUST 由独立任务说明（Task Brief）正文承载，与 Task 的零到多个 OpenSpec Change 无关。任务记录（Task Record）、列表与详情展示 MUST 基于该定位呈现，不通过拉长 intent 或仅依赖关联 Change `brief.md` 充当任务正文。原有 intent 中的普通具名文档链接 MUST 保留其只读导航用途，不自动成为正式材料关联。

#### Scenario: intent 保持短目标定位
- **WHEN** Agent 为用户任务编写 intent，且任务需求包含多个目标、复杂边界或验收条件
- **THEN** intent MUST 保持一句话级概括并把完整任务需求交给唯一 Task Brief
- **AND** Agent MUST NOT 把实现步骤、逐条验收或长篇正文写入 intent 替代任务说明

#### Scenario: 简单任务也有真实正文
- **WHEN** 新正式任务没有关联 Change 且目标简单
- **THEN** 页面 MUST 能通过Task Record.brief 直接显示真实短说明，不要求长模板或 Change
- **AND** 只有 intent 时 MUST 如实显示独立说明缺失，而非称其不适用

## ADDED Requirements

### Requirement: 任务说明必须可通过记录编辑和稳定链接接续
任务编辑入口 MUST 区分一句话目标 intent 与 Markdown 正文 brief，使用既有任务版本保护和冲突处理；任务说明阅读 MUST 直接展示排版正文并复用响应布局，不显示原文切换、重复文件名或材料来源框。Markdown 源文本 MUST 可在已有任务编辑入口查看和修改；其他文件材料 MUST 保留各自的原文切换。@task/<task-id> MUST 只解析合法任务身份并进入当前工作空间的对应任务，不接受任意主机、文件路径或越界身份。明确项目文档与同任务材料链接 MUST 保持受限读取。

#### Scenario: 任务说明直接阅读而文件材料保留原文
- **WHEN** 用户打开普通或组合任务的说明
- **THEN** 页面 MUST 直接展示记录正文且没有查看原文按钮，编辑入口 MUST 保留 Markdown 源文本
- **AND** 方案、实施、交付文件和 OpenSpec 材料的原文切换 MUST 继续正常工作

#### Scenario: 保存说明并刷新
- **WHEN** 用户修改 brief 并按当前版本保存
- **THEN** 页面 MUST 显示数据库中的新正文，刷新后仍读取同一内容
- **AND** 若发生冲突，页面 MUST 保留未保存输入并要求重新观察，不静默覆盖

#### Scenario: 从变更说明进入任务
- **WHEN** 用户点击 active 或 archived 变更中的 @task/<task-id> 链接
- **THEN** 页面 MUST 打开对应任务的记录正文或真实缺失状态，MUST 不按文件路径发现说明

#### Scenario: 同任务链接与返回
- **WHEN** 当前任务正在阅读方案中的变更说明，用户点击指向该任务自身的 @task/<task-id>
- **THEN** 页面 MUST 明确切换到记录正文，并保存独立的导航历史
- **AND** 返回 MUST 恢复原方案材料及阅读位置，不因同一任务身份丢失前后阅读状态

#### Scenario: 非法任务链接
- **WHEN** 链接包含非法身份、路径穿越或主机信息
- **THEN** 阅读器 MUST 拒绝该逻辑任务引用，不扩大到外部发送或文件读取
