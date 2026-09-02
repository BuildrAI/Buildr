# task-retrospectives Specification

## Purpose

定义终态 Task 的单一当前执行效率复盘、SQLite 所有权、Skill 写入边界和 Buildr Web 只读投影。

## Requirements

### Requirement: Task Retrospective 保存单一当前执行效率复盘
Buildr MUST 为每个 terminal Task 在 Workspace SQLite 中保存至多一份 current Task Retrospective Result；Result MUST 使用 closed `buildr.task-retrospective-result/v1`，只包含 `taskId`、固定 `focus: agent-execution-efficiency`、非空 `reportMarkdown` 与 `completedAt`。

#### Scenario: 首次记录终态 Task 复盘
- **WHEN** Agent 为 `completed` 或 `abandoned` Task 提交合法 Result
- **THEN** Task Retrospective Application MUST 在 SQLite 中原子写入该 Task 的 current row
- **AND** operation result MUST 返回已保存的规范化 Result

#### Scenario: 重复复盘完整替换
- **WHEN** 同一 terminal Task 已有 current Result 且 Agent 再次提交合法 Result
- **THEN** Application MUST 在单一事务中完整替换旧 row
- **AND** MUST NOT 创建 revision、history、candidate 或第二个 current slot

#### Scenario: active Task 拒绝记录
- **WHEN** Agent 尝试为 active Task 写入复盘
- **THEN** Application MUST fail closed 且不改变既有 current row
- **AND** Task status MUST保持不变

### Requirement: Task Retrospective 只基于当前可见证据
`task-retrospective` Skill MUST 让 Agent 基于当前 session/runtime 可访问的任务步骤与结果，识别执行时间、token 消耗、重复尝试、等待和人机协作中的高成本点，并推理可落地的优化方向；Skill MUST NOT 要求或声称读取隐藏推理、完整对话、完整工具日志或后台任务事件，也 MUST NOT 为补齐 Token 数字新增上下文回放、强制估算或采集流程。

#### Scenario: 可见精确成本数据
- **WHEN** 当前上下文提供可信的 Token 数
- **THEN** Agent MUST 在报告中记录该数值、数据来源和覆盖范围
- **AND** MUST 只把该覆盖范围内的数据用于定量判断

#### Scenario: Token 数据部分可得
- **WHEN** 当前上下文只提供部分步骤、阶段或模型调用的可信 Token 数
- **THEN** Agent MUST 记录可得数值、数据来源和实际覆盖范围
- **AND** MUST 明确该数值不代表完整 Task 消耗

#### Scenario: Token 数据不可得
- **WHEN** 当前上下文不能提供可信 Token 数
- **THEN** Agent MUST 将 Token 数据标记为缺失
- **AND** MUST 继续使用可观察的耗时、重复尝试、等待、工具调用和人机协作事实完成复盘
- **AND** MUST NOT 伪造精确数值或仅为补齐 Token 数据增加任务消耗

#### Scenario: 精确成本数据不可见
- **WHEN** 当前上下文不能提供完整耗时或其他精确成本数据
- **THEN** Agent MUST 明确数据缺口并只使用可观察事实与标明的推断
- **AND** MUST NOT 伪造精确数值

#### Scenario: 保持自由推理空间
- **WHEN** Agent 生成第一版复盘
- **THEN** capability MUST 只要求一份自由 Markdown 报告
- **AND** MUST NOT 强制评分、固定问题分类、候选列表或结构化优化项

### Requirement: 旧 observation 保持不可见且不迁移
Task Retrospective implementation MUST NOT 读取、迁移、删除或双写既有 `.buildr/asset-review/` 内容；该目录可继续由 `.gitignore` 排除，但不得成为 current capability 的数据源。

#### Scenario: Workspace 存在旧 observation
- **WHEN** Workspace 升级后仍包含 `.buildr/asset-review/` 文件
- **THEN** Task Retrospective inspect/record 与 Buildr Web MUST 忽略这些文件
- **AND** package update/sync MUST 保留其字节内容

### Requirement: Task Retrospective 必须维护复盘处置 current metadata
Buildr MUST 在同一 `task_retrospective_current` current row 中为每份现有 Retrospective Result 维护 `pending | handled | no-action` 处置状态；处置元数据 MUST 由 Task Retrospective Application 独占读写，并 MUST NOT 进入 Task Record 或第二个 current store。

#### Scenario: 首次或迁移后的复盘待处理
- **WHEN** Agent 首次记录复盘，或 Workspace migration 遇到既有合法 Retrospective Result
- **THEN** current row 的处置状态 MUST 为 `pending`
- **AND** 处置说明与处置时间 MUST 为空

#### Scenario: 标记已处理
- **WHEN** Agent 或 Buildr Web 对 current 复盘提交 `handled`、非空处置说明与匹配的 expected current digest
- **THEN** Application MUST 在单一事务中保存 `handled`、规范化说明与系统处置时间
- **AND** MUST 保持 Retrospective Result、Task Record 与其他专业 current records 不变

#### Scenario: 标记无需处理
- **WHEN** 用户从 Buildr Web 的“无需处理”入口或 Agent 对 current 复盘提交 `no-action`、非空理由与匹配的 expected current digest
- **THEN** Application MUST 保存 `no-action`、规范化理由与系统处置时间
- **AND** MUST 将该状态解释为复盘已形成无需后续行动的处置决定

#### Scenario: 重新打开处置
- **WHEN** Agent 或 Buildr Web 对 `handled` 或 `no-action` current 复盘提交 `pending` 与匹配的 expected current digest
- **THEN** Application MUST 将状态改为 `pending` 并清空处置说明与处置时间
- **AND** MUST NOT 重开 terminal Task 或修改复盘报告

#### Scenario: 无复盘时尝试处置
- **WHEN** Task 没有 current Retrospective Result而调用方提交处置 mutation
- **THEN** Application MUST fail closed 且不得创建空复盘或处置占位 row

### Requirement: 复盘处置 mutation 必须防止陈旧覆盖
Task Retrospective inspect MUST 返回 response-only `currentDigest`，其 identity MUST 同时绑定规范化 Result 与处置元数据；所有处置 mutation MUST 提交 `expectedCurrentDigest`，且 MUST 在同一写事务中校验。

#### Scenario: current digest 匹配
- **WHEN** 处置 mutation 的 `expectedCurrentDigest` 与事务内 current row 匹配
- **THEN** Application MUST 执行合法状态变化并返回新的 `currentDigest`

#### Scenario: current digest 陈旧
- **WHEN** 复盘报告或处置状态已变化，导致 `expectedCurrentDigest` 不再匹配
- **THEN** Application MUST 返回稳定冲突诊断并要求刷新
- **AND** MUST 保持 current row 完整不变，不自动合并或覆盖

### Requirement: 重做复盘必须重置处置状态
Task Retrospective Application `record` MUST 在完整替换同一 Task 的 current Result 时，同事务把处置状态重置为 `pending`，并清空旧处置说明与时间。

#### Scenario: 已处理复盘被重新记录
- **WHEN** 同一 terminal Task 的 current 复盘状态为 `handled` 或 `no-action`，且 Agent 再次成功执行 `record`
- **THEN** 新 current Result 与 `pending` 处置状态 MUST 原子保存
- **AND** 旧处置说明与时间 MUST 不再作为 current 事实返回

### Requirement: 处理复盘必须形成基于当前事实的完整意见
Task Retrospective provider MUST 在处置 current Retrospective Result 前返回原始复盘正文或其不可变 current digest 引用，检查原问题与建议在当前 Project 中是否仍存在或有效，并基于当前事实重新拆分行动方向。它 MUST NOT 只复述旧报告、机械沿用旧建议或生成 action item ID。

#### Scenario: 旧建议仍然有效
- **WHEN** 当前实现、规范或流程证明原问题仍存在且改进方向仍有效
- **THEN** 处理报告 MUST 说明当前证据、重新表述的改进方向及其 Task 承接结果
- **AND** MUST 将来源关系写入已有或新建的 todo/active Task

#### Scenario: 建议已失效或不再需要
- **WHEN** 当前事实证明问题已解决、建议已过时、收益不足或不再适用
- **THEN** 处理报告 MUST 说明丢弃理由与当前证据
- **AND** MUST NOT 为该事项创建 Task 或 action item

### Requirement: 有效复盘事项必须由 Task Record 承接
处理复盘时，Agent MUST 对每个仍有效的改进方向选择已有 todo/active Task 或创建新的 todo Task，并通过 Task Record 来源关系关联 source Task。多个方向 MAY 合并到一个目标 Task，一个来源 MAY 关联多个目标 Task；关系粒度 MUST 停止在 source Task ID。

#### Scenario: 已有 Task 覆盖改进方向
- **WHEN** 当前 Workspace 已有 todo 或 active Task 覆盖同一目标
- **THEN** Agent MUST 复用该 Task 并增加来源关系
- **AND** MUST NOT重复创建 Task

#### Scenario: 新建待办承接意向
- **WHEN** 有效方向尚无 Task 承接且用户同意保留该意向
- **THEN** Agent MUST 只创建带来源关系的 todo Task Record
- **AND** MUST NOT创建 Environment、Change、proposal、design 或其他任务文件

#### Scenario: 标记处理完成
- **WHEN** 所有有效方向均已关联承接 Task，且所有丢弃方向均有理由
- **THEN** Agent MUST 将 disposition 标记为 handled，并在说明中记录完整处理意见与目标 Task ID
- **AND** 若没有任何有效方向，MUST 使用 no-action 而非 handled

### Requirement: 复盘 inspect 必须展示当前承接 Task
Task Retrospective inspect 与 Buildr Web 复盘视图 MUST 通过 Task Record 的反向轻量查询返回 source Task 当前关联的承接 Task ID、title 与 status；MUST NOT 将该投影复制进 Retrospective current row。

#### Scenario: 承接 Task 状态变化
- **WHEN** 已关联目标 Task 从 todo 激活或进入终态
- **THEN** 下一次复盘 inspect MUST 显示目标 Task 的当前状态
- **AND** MUST NOT 重写原始 Retrospective Result 或 disposition metadata

### Requirement: Agent 处置复盘必须取得针对具体写入的明确授权
`task-retrospective` provider MUST 将 current 复盘的只读检查、当前事实重判与最终 mutation 授权分离。用户只要求“处理、检查、查看、分析复盘”且未明确选择 disposition 或 Task 关系 effects 时，provider MUST 只返回原始报告或引用、当前证据、拟 disposition、理由与拟 Task effects，并 MUST 保持 current disposition 和 Task Record rows 不变。只有用户直接指定完整 mutation，或明确接受 provider 已展示且未发生实质变化的完整方案后，provider 才可调用 Task Record mutation 或 Task Retrospective `handle`。

#### Scenario: 宽泛处理请求只进入讨论
- **WHEN** 用户要求“处理这个复盘”，但没有明确选择 `handled`、`no-action`、`pending` 或任何 Task 创建、关联 effects
- **THEN** provider MUST 执行只读 inspect 与当前事实重判，并向用户展示拟处置方案
- **AND** MUST NOT 调用 Task Record create/update 或 Task Retrospective handle，current disposition MUST 保持 `pending`

#### Scenario: 用户直接指定完整处置动作
- **WHEN** 用户直接要求把 current 复盘标记为具体 disposition，并提供或接受对应理由与完整 Task effects
- **THEN** provider MAY 将该表达视为本次精确 mutation 的授权并直接执行
- **AND** MUST NOT 因已经具备明确授权而机械要求第二次确认

#### Scenario: 用户接受已展示且未变化的方案
- **WHEN** provider 已展示拟 disposition、理由、目标 Task IDs 与关系 effects，用户明确同意该完整方案，且重新 inspect 后这些 facts 未实质变化
- **THEN** provider MUST 只执行已授权的 Task Record 与 disposition mutations
- **AND** MUST 返回实际 effects、最终 disposition 与新的 current digest

#### Scenario: 拟写入事实发生变化
- **WHEN** 用户授权后 current digest、拟 disposition、处置理由、目标 Task 或关系 effects 发生实质变化
- **THEN** provider MUST 停止写入、重新展示变化后的完整方案并取得新授权
- **AND** MUST 保持 current disposition 不变，不得用旧授权提交新的 Task 或 disposition mutation
- **AND** 若已有部分已授权 effects 成功，MUST 原样报告实际 effects，不得把部分落地冒充完整处置

#### Scenario: 用户继续讨论或提出异议
- **WHEN** provider 展示拟处置方案后，用户继续讨论、要求调整、提出异议或未明确接受
- **THEN** provider MUST 保持只读讨论阶段
- **AND** MUST NOT 创建或关联承接 Task，也 MUST NOT提交 `handled`、`no-action` 或 `pending` mutation

### Requirement: Task Retrospective Application 必须是 Buildr Web 与 CLI 的唯一读写 authority
Task Retrospective Application MUST 通过 Task Record Application 验证 Task identity/status，并通过专用 repository 事务读写 SQLite current row；Skill、Buildr Web 和其他 lifecycle 模块 MUST NOT 直接访问该表。Buildr Web MAY 通过受控 HTTP mutation 调用 Application 维护处置元数据，但 MUST NOT 写入或生成复盘报告。

#### Scenario: Skill 记录复盘
- **WHEN** Agent 完成语义复盘
- **THEN** selected `buildr.task-retrospective/v1` provider MUST 通过随包内部 driver 调用 Application `record`
- **AND** driver MUST 返回结构化 operation evidence

#### Scenario: Agent 处置复盘
- **WHEN** Agent 已检查 current 复盘并形成处置决定
- **THEN** selected provider MUST 通过随包内部 driver 调用 Application `handle`
- **AND** MUST 提交处置状态、适用的非空说明与 inspect 返回的 expected current digest

#### Scenario: Buildr Web 读取复盘
- **WHEN** 用户打开 Task 详情的“复盘”Tab
- **THEN** Buildr Web MUST 通过 Application `inspect` 取得 current Result 与处置元数据
- **AND** MUST NOT直接访问 SQLite 或生成复盘 Markdown

#### Scenario: Buildr Web 处置复盘
- **WHEN** 用户在“复盘”Tab 标记已处理、无需处理或重新打开
- **THEN** HTTP interface MUST 验证同源、session、JSON、body size、字段白名单和 expected current digest，再调用 Application `handle`
- **AND** MUST NOT修改 Task 顶层状态或其他专业 current records

### Requirement: Buildr Web 展示只读复盘 Tab
Buildr Web Task 详情 MUST 提供“复盘”Tab，只读展示 current Result 的完成时间与 Markdown 报告，并展示和受控维护 current 处置元数据；该 Tab MUST 对有无复盘记录都可访问，且 MUST 至少提供明确的“无需处理”入口。

#### Scenario: Task 已有复盘
- **WHEN** `inspect` 返回 current Result
- **THEN** Tab MUST 安全渲染 `reportMarkdown` 与 `completedAt`
- **AND** MUST 展示 current 处置状态，但不得改写 Markdown Result

#### Scenario: Task 已有待处理复盘
- **WHEN** `inspect` 返回 current Result 且处置状态为 `pending`
- **THEN** Tab MUST 安全渲染 `reportMarkdown`、`completedAt` 与“待处理”状态
- **AND** MUST 提供“已处理”和“无需处理”入口，并在提交前要求非空说明或理由

#### Scenario: Task 复盘已有处置结论
- **WHEN** `inspect` 返回 `handled` 或 `no-action`
- **THEN** Tab MUST 展示处置状态、说明与处置时间
- **AND** MUST 提供“重新打开”入口，但 MUST NOT把处置状态解释为后续改进已经完成

#### Scenario: Task 尚无复盘
- **WHEN** `inspect` 返回 absent
- **THEN** Tab MUST 显示“尚未复盘”且 MUST 不展示处置 mutation
- **AND** MUST NOT把缺失解释为 blocked、failed 或 Task 未完成

### Requirement: Task Retrospective 必须提供有界批量只读检查
Task Retrospective Application MUST 复用 Task Record current query 与单 Task Retrospective inspect 语义，为内部 Agent provider 提供同时受数量与固定 UTF-8 字节预算约束的批量只读检查；该操作 MUST 不新增存储、不修改 Task 或 Retrospective current、不生成分析、评分或处置决定。

#### Scenario: 默认读取待处理复盘摘要
- **WHEN** Agent 调用批量检查且未指定处置状态、正文、数量或字节上限
- **THEN** Application MUST 查询 `pending` current 复盘并按 Task ID 稳定排序
- **AND** MUST在默认数量与字节预算内返回完整摘要项、完整匹配数、返回数、UTF-8返回字节数与 `truncated` 状态
- **AND** 每项摘要 MUST 包含 Task identity/title/status、完成时间、result/current digest、disposition 与 current follow-up Task 摘要
- **AND** operation result MUST 返回 `effects: []`

#### Scenario: 按状态和显式 Task 集合过滤
- **WHEN** Agent 指定 `pending|handled|no-action|all` 状态、一个或多个 Task ID、合法 limit与合法字节预算
- **THEN** Application MUST 对 current Task query、状态与显式 Task 集合取交集
- **AND** MUST 不从旧文件、历史记录或 `.buildr/asset-review/` 补齐结果

#### Scenario: 显式包含复盘正文
- **WHEN** Agent 明确请求批量结果包含报告正文
- **THEN** Application MUST只追加能作为完整 item 落入当前字节预算的 current `reportMarkdown`
- **AND** 不能完整容纳的正文 MUST省略并使批量结果标记 truncated，调用方可用单 Task inspect读取
- **AND** 未明确请求时 MUST 省略正文而不是返回空字符串或截断内容

#### Scenario: 单项复盘读取失败
- **WHEN** 匹配集合中的一个 Task 无法形成合法 current inspect 结果
- **THEN** 批量操作 MUST 为该 Task 返回 item-level diagnostic并在剩余字节预算内继续读取其他匹配 Task
- **AND** MUST NOT修复、删除、处置或隐藏损坏的 current row

#### Scenario: 批量输入越界
- **WHEN** status、Task ID、limit或字节预算非法，limit超过500或字节预算超过固定公共最大值
- **THEN** Application MUST 在读取结果前 fail closed 并返回稳定诊断
- **AND** Task Record、Retrospective current 与其他专业事实 MUST 保持不变

### Requirement: 内部 Task Retrospective driver 必须开放批量 list action
随包内部 Task Retrospective driver MUST 提供 `list` action，并 MUST 将 status、重复 Task ID、limit 与是否包含正文作为显式参数交给同一次 Application operation；现有单 Task `inspect|record|handle` 行为 MUST 保持兼容。

#### Scenario: Agent 使用批量 list
- **WHEN** Agent 需要枚举一组 current 复盘
- **THEN** driver MUST 通过单次进程调用返回闭合 `buildr.task-retrospective-list-result/v1`
- **AND** MUST 不循环调用自身、不写临时导出文件或调用任何 mutation action

#### Scenario: Agent 只需查看个别完整报告
- **WHEN** 批量摘要已定位少量需要进一步判断的 Task
- **THEN** provider MUST 允许 Agent继续使用既有单 Task `inspect` 读取完整 current Result
- **AND** MUST NOT要求批量 list 成为记录、处置或 Task lifecycle 的前置门禁

### Requirement: Task Retrospective 必须探索并共同确认确定性流程候选
Task Retrospective provider MUST在生成或处理复盘时，从当前session/runtime可访问的任务执行过程事实与已有current复盘中主动探索确定性流程候选。候选 MUST基于重复或高成本/高风险证据，说明closed输入、Owner、停止条件、结果证据、可恢复性、预期收益、仍由人和Agent保留的判断与建议资产落点；不存在可信候选时 MUST如实说明。候选 MUST NOT把推荐路径变成唯一合法路径、通用许可层或Task生命周期门禁，也 MUST NOT自动创建/关联Task、修改Rule/Skill/workflow、建立审批/事件/history平台，或把专业判断收回Buildr状态机。

#### Scenario: 从任务执行过程发现候选
- **WHEN** 当前可见的Task Record时点、Development/Review/Verification/Execution Record/Finish timing、工具结果或重复尝试证明一组机械步骤具有稳定输入和结果
- **THEN** Agent MUST评估该步骤是否具备closed输入、唯一Owner、明确停止条件、可验证结果与幂等恢复边界
- **AND** 可信候选 MUST说明仍保留给人和Agent的目标、业务判断、风险取舍与授权

#### Scenario: 既有复盘提供候选证据
- **WHEN** 同一Task已有current复盘，或批量处理的多份current复盘描述相同或相近的重复步骤、等待、错误恢复或高成本边界
- **THEN** Agent MUST结合当前事实重新评估并按实际目标聚类、合并或丢弃候选
- **AND** MUST NOT机械复述旧报告、按关键词自动聚类或把旧候选视为仍有效

#### Scenario: 候选违反Buildr产品哲学
- **WHEN** 候选要求普通Agent动作必须经过Buildr、扩大为通用许可层、自动替代业务判断、建立新生命周期gate，或把推荐流程变成唯一合法路径
- **THEN** provider MUST拒绝把它作为可固化候选
- **AND** MUST说明违反的权威/判断边界，并保留Agent可在现有授权与安全边界内直接执行的路径

#### Scenario: 候选交给人共同确认
- **WHEN** Agent已形成一项或多项可信确定性流程候选
- **THEN** provider MUST向一人或多人展示候选证据、边界、预期收益、风险、建议落点与完整拟Task effects
- **AND** 只有人明确接受且重新inspect后事实与effects未实质变化，Agent才可按既有Task Retrospective授权规则创建或关联承接Task并处置来源复盘

#### Scenario: 没有可信候选
- **WHEN** 可见证据不足、步骤仍依赖业务语义、输入或停止条件无法闭合，或预期收益不足
- **THEN** 复盘 MUST如实保留普通优化方向或说明没有可信确定性流程候选
- **AND** MUST NOT为了填充候选而估算隐藏事实、创建分析状态或扩大任务调查范围

#### Scenario: 候选选择正确资产落点
- **WHEN** 人确认继续探索或承接一项确定性流程候选
- **THEN** Agent MUST区分价值观/边界的Rule、Agent判断方法的Skill、固定机械顺序的Application/CLI workflow与不变量/跨版本边界的checker/test
- **AND** MUST尽量把重叠方向合并为少量纵向Task，不自动修改任何目标资产

### Requirement: Task Retrospective 不成为任何任务动作门禁
Task Record、Review、Verification、Environment、OpenSpec、交付、清理与Parent Coordination MUST NOT required消费Task Retrospective capability或检查Result是否存在。

#### Scenario: Task没有复盘结果
- **WHEN** Agent执行任一其他任务动作
- **THEN** 该动作 MUST不因Retrospective缺失而失败
