# task-materials Specification

## Purpose
为正式任务提供独立于 OpenSpec 的人类可读说明和过程材料关联，使任务拥有可接续、可核对当前版本的真实正文，统一命令行、智能体与页面阅读，并保护既有任务、变更、归档及专业记录的历史事实。

## Requirements

### Requirement: Task 必须拥有独立说明正文

每个新建或主动接续的正式执行任务 MUST 形成适用于当前目标的任务说明（Task Brief），至少真实表达问题或需求、目标、必要范围与非目标和完成依据。说明 MUST 根据复杂度逐步补充，简单任务 MAY 使用短正文；未明确事实 MUST 明示，MUST NOT 凑模板编造。任务 `intent` MUST 仅承担一句话短目标与入口定位，MUST NOT 作为说明正文。任务说明 MUST 独立于零到多个 OpenSpec Change，仅维护一份权威正文。

#### Scenario: 无 OpenSpec 的简单修复
- **WHEN** 智能体登记一个不关联 Change 的正式简单修复任务
- **THEN** 智能体 MUST 保存真实简短任务说明并建立正式材料关联
- **AND** 说明 MUST 能从任务说明节点直接阅读，不依赖顶部目标的普通链接

#### Scenario: 只有 intent 没有正文
- **WHEN** 任务尚无说明正文或关联材料缺失
- **THEN** 页面 MUST 如实显示缺失，MUST NOT 用 intent、聊天或占位正文表述说明已齐备

### Requirement: 材料引用与正文必须分离

Buildr MUST 为任务提供稳定保存位置与独立材料关联能力。关联 MUST 至多包含一份独立任务说明，并支持零到多个方案、实施和交付文档；正文 MUST 以唯一文件为权威，不复制进关联清单或 Task Record。材料 MUST 可引用任务本机 Markdown 或当前任务作用域中的真实项目 Markdown；多任务和多变更 MAY 引用同一正文。关联 MUST 不保存另一套任务状态、审查适用性、正文副本或工作树物理路径。

#### Scenario: 仅工作空间任务
- **WHEN** 任务没有项目与变更范围
- **THEN** Buildr MUST 允许其关联固定任务本机目录中的说明及必要过程正文
- **AND** MUST NOT 要求注册虚假项目或 Change

#### Scenario: 引用已有项目文档
- **WHEN** 当前任务关联已有合法项目 Markdown
- **THEN** Buildr MUST 读取同一文件的当前正文并清楚表达来源，不复制或移动原文

#### Scenario: 正文可被多处引用
- **WHEN** 两个任务或多个变更引用同一合法说明
- **THEN** 每个入口 MUST 读取同一当前正文，MUST NOT 创建排他所有者假设或双份长期编辑正文

### Requirement: 材料动作必须局部安全且显式版本保护

命令行与 HTTP MUST 调用同一材料应用。读取 MUST 零写入，返回材料关联观察版本、实际正文摘要、内容及逐项来源或诊断；任务列表 MUST NOT 扫描正文。关联更新 MUST 校验已观察关联版本，本机正文写入 MUST 校验已观察正文版本；陈旧或并发冲突 MUST 拒绝对应写入并保留现有事实。引用修改与正文修改 MUST 使用各自观察版本，不把一项文件变化升级为任务全局门禁。

#### Scenario: 正文更新后重新阅读
- **WHEN** 正文已被合法更新，用户刷新节点或智能体再次读取
- **THEN** 各入口 MUST 返回新正文和对应实际摘要，不把旧缓存当作当前事实

#### Scenario: 两个入口使用旧版本写入
- **WHEN** 两个调用方通过材料应用的受控 record 或本机 write 入口，基于同一旧关联或本机正文版本分别更新
- **THEN** 至多一个对应写入 MUST 成功，另一个 MUST 获得明确冲突并重新读取判断
- **AND** MUST NOT 静默覆盖或自动重放；项目正文通过外部文件工具更新时 MUST 先重新观察内容，应用 MUST NOT 声称其锁保护所有外部写入

#### Scenario: 一条旧引用失效
- **WHEN** 旧引用不可读但其他来源仍合法，或用户解除该引用
- **THEN** Buildr MUST 保留逻辑引用与局部诊断或允许解除关联，MUST NOT 阻塞其他安全材料读取、任务记录或专业动作

### Requirement: 材料读取必须保持实际文件现场与安全边界

材料应用 MUST 验证任务身份、项目作用域与受管工作树身份，并有界读取普通 Markdown。路径穿越、绝对路径、符号链接、非普通文件、非法编码及超限文件 MUST 被拒绝。匹配任务工作树存在时项目材料 MUST 来自该候选工作根；缺失或身份漂移 MUST NOT 静默回退主目录同名旧正文。任务本机材料 MUST 来自 canonical Workspace 固定任务目录，MUST NOT 随意扫描工作空间或跟随其他任务目录。

#### Scenario: 未提交的任务候选正文
- **WHEN** 正文只存在于有效 matching Worktree 的项目源
- **THEN** 页面和命令行 MUST 读取该真实候选，并明确工作树来源

#### Scenario: 候选缺失或非法路径
- **WHEN** 候选正文缺失、身份漂移或目标越过合法文件边界
- **THEN** Buildr MUST 返回真实缺失或安全诊断，不展示 retained 或其他任务的替代正文

### Requirement: 旧任务与 OpenSpec 材料必须只读兼容且来源明确

旧 Task identity、系统时间、结果历史、Change 关联和专业报告 MUST 保留。没有独立任务说明关联时，页面 MAY 保留关联 Change brief 的兼容阅读，但 MUST 标明它是历史变更说明、不是已建立的独立 Task Brief，MUST NOT 合并多个 brief、选主 Change、读取时迁移或补写。显式独立说明关联 MUST 优先且不可被 Change brief 覆盖；关联缺失 MUST 不通过兼容回退掩盖。Change 归档 MUST 不移动或删除任务说明，旧 brief 及归档 MUST 原样保留。

#### Scenario: 多个变更与归档
- **WHEN** 历史任务关联多个 active 或 archived Change
- **THEN** 页面 MUST 保持每个来源可读或明确不可用，不合成一份任务说明

#### Scenario: 新变更引用任务正文后归档
- **WHEN** 新 Change Brief 使用项目根逻辑 Markdown 引用独立任务正文，随后 Change 被合法归档
- **THEN** 点击该引用 MUST 仍读取同一项目任务正文，不因归档目录深度而失效，也不得为此改写既有历史 brief
- **AND** 活跃变更 brief 的会移动物理路径 MUST 不被误登记为稳定独立任务说明；既有逻辑 Change 引用继续提供历史兼容阅读

#### Scenario: 显式说明缺失
- **WHEN** 已关联的任务说明当前缺失而 Change brief 存在
- **THEN** 页面 MUST 明确报告独立说明缺失，MUST NOT 以 Change brief 或 intent 冒充已齐备

#### Scenario: 接续旧任务建立关联
- **WHEN** 智能体经核对决定引用适用旧文档或新写说明
- **THEN** 它 MUST 显式保存本次关联并说明补写或关联的当前事实，MUST NOT 更改过去历史或批量生成占位

### Requirement: 材料与专业结论不得相互冒充

Task Brief、方案、实施清单与交付文档 MUST 只展示其真实内容，审查与验证 MUST 继续由各自应用维护当前结果、历史及版本。材料存在、节点存在或报告存在 MUST NOT 自动证明任务完成；缺失、未执行、不适用、执行失败与通过 MUST 按实际事实分别表达。必要但未完成的检查 MUST 不被标记不适用，也 MUST 不因没有 OpenSpec 被跳过。

#### Scenario: 非 OpenSpec 任务专业检查
- **WHEN** 无 Change 任务的目标、方案或修改风险需要审查或验证
- **THEN** 智能体 MUST 独立选择相关检查并保存真实证据，页面 MUST 直接展示对应专业记录

#### Scenario: 未执行与执行失败
- **WHEN** 验证报告包含实际失败检查，或未覆盖项说明未执行、能力不可用、缺少测试等真实原因
- **THEN** 页面 MUST 分别呈现实际检查结论与未覆盖理由，MUST NOT 将未执行、不适用或缺失统一表述为失败或通过
