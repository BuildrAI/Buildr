## MODIFIED Requirements

### Requirement: Task详情必须直接展示Task Record与独立专业事实
Buildr Web MUST 在任务详情直接展示任务记录（Task Record）的短目标、状态及独立任务说明（Task Brief）正文；正文 MUST 来自正式材料引用，MUST NOT 由 intent、聊天或关联变更说明替代。结果在收尾节点展示，Change、父子关系和复盘在对应阅读入口展示。审查（Review）与验证（Verification）MUST 独立读取并在所选节点直接呈现完整结果，父任务协调只在适用 Task 显示。页面 MUST 不请求 Task Overview、组合统一推进状态或根据材料及专业结果推断 Task 能否完成。

#### Scenario: 普通Task没有专业结果
- **WHEN** Task 只有 Task Record 和已关联的真实 Task Brief，而没有 Review 或 Verification
- **THEN** 任务详情 MUST 正常显示短目标与任务说明正文，已有结果仍可在收尾节点读取
- **AND** 专业结果缺失 MUST 不形成 Task 错误或全局阻塞，也不得被解释为通过或不适用

#### Scenario: 专业读取失败
- **WHEN** Review、Verification或父任务协调中的一个读取失败
- **THEN** 页面 MUST只在对应区域显示局部错误
- **AND** Task Record及其他已读取事实 MUST继续可见

#### Scenario: 有短目标但没有正式说明引用
- **WHEN** Task 具有 intent，但没有独立任务说明引用或引用正文不可读
- **THEN** 页面 MUST 保留短目标并如实显示说明缺失或局部诊断
- **AND** MUST NOT 把顶部普通链接可打开、intent 或兼容变更说明当作独立说明已齐备

### Requirement: 任务详情必须按工作路径直接组织已有内容
默认页面 MUST 在列表旁的现有副屏紧凑展示标题、编码、短目标和状态，再以紧凑标签连接任务说明、方案设计、开发实现和任务收尾；方案审查 MUST 在方案设计内，实现审查和开发验证 MUST 在开发实现内；任务收尾不再提供常驻的「用户确认」目录项，验收设计另行决定。任务说明节点 MUST 直接展示显式关联的唯一任务说明（Task Brief）真实正文；方案、实施和交付 MUST 按实际关联材料组织，OpenSpec artifacts 只是来源之一。无说明材料时 MUST 如实表达缺失，不把 intent 当作说明正文；页面读取 MUST 不生成材料或报告。

#### Scenario: 读取完整任务
- **WHEN** Task 拥有正式 Task Brief 引用、方案、实施和交付材料及专业结果，并可选关联 OpenSpec artifacts
- **THEN** 说明节点 MUST 默认直接展示 Task Brief 正文；设计节点 MUST 展示实际方案并可切换相关设计与规范，实施清单 MUST 在非模态浮窗中按需显示，实施节点 MUST 显示实现审查与开发验证摘要，设计与实现内部的审查 MUST 默认显示最新保存结论并可切换历次记录，开发实现内的验证 MUST 直接展示当前报告及检查依据，收尾 MUST 集中展示交付记录与适用的协同、复盘内容
- **AND** 多个关联变更及共享材料 MUST 标识来源，原始正文保持自身权威，不合并或选择主 Change

#### Scenario: 简单任务与空内容
- **WHEN** 简单 Task 没有方案材料或部分节点没有记录
- **THEN** 页面 MUST 保持四个主节点并如实显示空内容，MUST NOT 强制创建长文档、报告、子任务或错误状态；每个正式新任务的真实短 Task Brief 仍 MUST 由任务流程形成并关联
- **AND** 没有说明材料时说明节点 MUST 如实表达缺失，不把 intent 或旧正文冒充独立说明；历史空材料可继续只读查看，不自动补造

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
- **THEN** 任务说明、方案、实施和交付节点 MUST 按角色直接读取相应正文，不跳过材料加载
- **AND** MUST NOT 为展示伪造 Change identity 或要求先采用 OpenSpec

#### Scenario: 历史变更说明兼容阅读
- **WHEN** 旧任务没有显式 Task Brief 引用，但关联 Change 提供旧 brief
- **THEN** 页面 MUST 保留其只读入口并标明“历史变更说明，非独立任务说明”，分别标识各来源
- **AND** 明确 Task Brief 引用建立后 MUST 优先使用该引用；引用缺失或读取失败 MUST 不通过旧 brief 回退掩盖

### Requirement: 任务材料必须读取任务的实际文件现场
任务详情 MUST 按独立材料引用、任务关联、项目范围与受管工作树（Worktree）证据选择实际文件根；存在可用工作树时项目材料 MUST 读取其中未提交的任务说明、方案、规范、清单、原型及任务引用的项目文档；任务本机正文 MUST 从主工作空间（Canonical Workspace）的固定任务材料目录读取。副屏 MUST 标识来源，不能混用保留副本正文。服务目标本身是任务的 linked worktree 时，材料解析 MUST 仍按同一证据身份选择文件根，不得因目标形式退回保留目录或报工作树不可读取。普通材料读取 MUST 不依赖 OpenSpec 查询可用性。

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
- **WHEN** 用户从 active 或 archived Change Brief 点击 `@project/` 限定项目根逻辑 Markdown 引用
- **THEN** 页面 MUST 在同一任务项目范围内打开相同任务说明，不受归档目录深度变化影响
- **AND** 普通相对引用 MUST 保持既有语义，MUST NOT 因逻辑前缀扩大文件读取范围

#### Scenario: 失效 Change 不阻断普通正文
- **WHEN** Task 的 Change 引用不可解析，但独立任务本机或项目材料合法可读
- **THEN** 页面 MUST 继续显示安全可读材料，只在 Change 来源显示对应局部诊断
- **AND** MUST NOT 因 OpenSpec 不可用而跳过 Task Brief 或其他普通材料

### Requirement: 节点阅读必须连续且内容按判断需要取舍
页面 MUST 记住每个节点选中的文档、审查记录与阅读位置，关联阅读返回 MUST 恢复原上下文；打开新任务 MUST 默认显示独立任务说明（Task Brief）正文或其真实缺失状态。页面 MUST 优先呈现实际阶段、结论、问题及未覆盖范围，MUST NOT 堆叠重复标题、无内容栏目或内部结果摘要值。历史通过 MUST 明确表达为最近保存的结论，不能推导当前版本通过。任务唯一说明与零到多个 Change 的兼容说明 MUST 区分来源，不互相覆盖。

#### Scenario: 对照方案与实现
- **WHEN** 用户选择设计文档，切到开发实现，再返回方案设计
- **THEN** 页面 MUST保持所选设计文档和阅读位置，不退回默认提案

#### Scenario: 多份需求名称相同
- **WHEN** 旧任务关联多个变更且均有 brief，而尚无独立 Task Brief 引用
- **THEN** 兼容内容选项 MUST 用关联变更名称及来源区分，并标明它们不是已建立的独立任务说明；单文件 MUST 直接显示其历史正文
- **AND** 有明确 Task Brief 引用时 MUST 默认读取唯一引用，MUST NOT 合并旧 brief 或推断主 Change

#### Scenario: 收尾中确认成果
- **WHEN** 任务具有验收事项或答复记录
- **THEN** 历史答复数据仍可由记录面读取；任务收尾目录 MUST NOT提供常驻「用户确认」阅读项
- **AND** 保存意见与任务完成动作的既有约束不因本项调整而改变

### Requirement: 任务阅读优先加载所需内容
任务详情 MUST 优先呈现任务主体和当前阅读节点；独立任务材料 MUST 按需加载，未打开节点的审查、验证、协调、Change 读取及改动与提交扫描 MUST NOT 成为当前正文显示的前置条件。按需读取 MUST 保持读取中、缺失、错误和重试可见，快速切换任务 MUST NOT 显示上一任务的响应。相同任务和材料引用的重复详情读取 MUST 复用已加载材料；返回已读任务 MUST 可立即复用同一工作空间中本次会话的材料并重新核对。主动刷新 MUST 等待取得已打开内容的当前事实，包括材料关联、实际正文及已加载专业结果，MUST NOT 因缓存或只刷新 Task Record 保留旧材料。

#### Scenario: 返回已读说明并主动刷新
- **WHEN** 用户返回已读任务，随后点击刷新任务
- **THEN** 页面 MUST可立即展示该任务的已读说明并重核，刷新完成时 MUST呈现最新正文
- **AND** 切换、取消和失败 MUST不将其他任务或失败响应缓存为成功正文

#### Scenario: 打开普通任务需求
- **WHEN** 用户打开普通任务并查看任务需求
- **THEN** 页面 MUST 读取独立 Task Brief 引用及正文，MUST NOT 主动请求尚未查看的审查、验证、组合协调信息或改动与提交扫描
- **AND** 材料尚未返回时 MUST 明确显示加载而非提前显示缺失；MUST NOT 因没有 Change 而跳过任务材料读取

#### Scenario: 阅读报告并快速切换任务
- **WHEN** 用户打开开发实现后切换另一任务
- **THEN** 所需报告 MUST按需读取，旧任务响应 MUST NOT覆盖新任务；已读节点返回时 MUST复用当前任务内容

#### Scenario: 主动刷新材料与结果
- **WHEN** 正文、关联或已加载专业结果由其他入口更新后，用户明确刷新
- **THEN** 页面 MUST 重读相关当前事实并显示对应来源及版本，不把旧缓存当作当前正文
- **AND** 刷新 MUST 不写文件、不变更 Task 状态、不生成专业结果

### Requirement: intent 的产品定位是短目标而非完整需求
Buildr 面向用户的目标字段（`intent`）MUST 表达一句话级别的任务目标与入口定位；问题、背景、必要范围与非目标、完成依据等完整任务说明 MUST 由独立任务说明（Task Brief）正文承载，与 Task 的零到多个 OpenSpec Change 无关。任务记录（Task Record）、列表与详情展示 MUST 基于该定位呈现，不通过拉长 intent 或仅依赖关联 Change `brief.md` 充当任务正文。原有 intent 中的普通具名文档链接 MUST 保留其只读导航用途，不自动成为正式材料关联。

#### Scenario: intent 保持短目标定位
- **WHEN** Agent 为用户任务编写 intent，且任务需求包含多个目标、复杂边界或验收条件
- **THEN** intent MUST 保持一句话级概括并把完整任务需求交给唯一 Task Brief
- **AND** Agent MUST NOT 把实现步骤、逐条验收或长篇正文写入 intent 替代任务说明

#### Scenario: 简单任务也有真实正文
- **WHEN** 新正式任务没有关联 Change 且目标简单
- **THEN** 页面 MUST 能通过正式材料关联直接显示真实短 Task Brief，不要求长模板或 Change
- **AND** 只有 intent 时 MUST 如实显示独立说明缺失，而非称其不适用

## ADDED Requirements

### Requirement: 任务专业结果必须保持缺失与适用性语义
任务页面 MUST 分别展示方案审查（Planning Review）、实现审查（Implementation Review，兼容接口类型 `completion`）和任务验证（Task Verification）的真实保存结果与未覆盖范围。没有报告 MUST 只表示未记录，不能推断通过、失败或不适用；检查需要及不适用理由 MUST 来自实际方案或工作摘要，MUST NOT 由页面依据 `changes` 或节点存在自动决定。必要但未完成 MUST 不被表述为不适用；页面 MUST 不新增专业状态或统一推进许可。

#### Scenario: 必要检查尚未记录
- **WHEN** 既有方案或工作摘要说明某项检查需要，但对应结果不存在
- **THEN** 页面 MUST 显示未记录及可读的真实缺口理由，MUST NOT 标记为已通过或不适用
- **AND** Task 主体及其他材料 MUST 继续可读，不生成占位报告

#### Scenario: 未执行与失败分别表达
- **WHEN** 验证报告含已执行失败的 checks，或 gaps 说明未执行、环境不可用或缺少测试
- **THEN** 页面 MUST 保留现有 checks、gaps 和结论的各自语义，并逐项展示真实原因
- **AND** MUST NOT 把未执行、不可用、缺少测试和执行失败统一渲染为“未通过”，也不得新增检查枚举或把缺口变成不适用

#### Scenario: 旧结论与当前对象不同
- **WHEN** 已保存审查或验证结果与当前阅读的材料对象不同
- **THEN** 页面 MUST 保留原结论及来源，不以旧通过推断当前对象通过
- **AND** 当前适用性与后续动作 MUST 由智能体（Agent）核对真实目标、方案和风险，不生成统一 stale 状态
