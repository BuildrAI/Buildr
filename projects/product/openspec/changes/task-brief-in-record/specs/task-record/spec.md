## MODIFIED Requirements

### Requirement: Task Record 必须与独立任务材料保持边界
任务记录（Task Record）MUST 遵守 closed `buildr.task-record/v4`，在已有顶层事实之外保存可空的任务说明正文 `brief`；`intent` MUST 仅表达一句话级短目标与入口定位。任务说明（Task Brief）MUST 由任务记录维护唯一正文，独立于 OpenSpec；方案、实施和交付材料引用 MUST 继续由独立任务材料应用维护，MUST NOT 复制进记录正文。任务材料与专业审查、验证 MUST 不改变合法记录动作的既有前置条件、授权、副作用或完成语义，也不得变成统一就绪门禁。

#### Scenario: 无 Change 的正式任务
- **WHEN** 正式任务的 `changes` 为空而具有独立任务说明或其他材料
- **THEN** Task Record MUST 保持原有空引用集合与合法记录语义，说明 MUST 从 `brief` 读取，其他材料 MUST 可通过独立入口读取
- **AND** MUST NOT 因需要说明而创建虚假 Change

#### Scenario: 多变更及共享引用
- **WHEN** 一个 Task 关联多个真实 `project/change`，或多个 Task 引用同一 Change 或文档
- **THEN** Task Record MUST 保留现有 `0..N`、记录内去重与跨 Task 非排他引用语义
- **AND** MUST NOT 因 Task Brief 唯一正文而强制 Task 与 Change 一对一

#### Scenario: 正文或材料关联更新
- **WHEN** Task Brief 正文或其他材料清单改变
- **THEN** 正文更新 MUST 校验当前 recordDigest 并更新记录版本；其他材料清单更新 MUST 保持 Task Record 和记录版本不变
- **AND** 正文变化 MUST 纳入终态更正历史及适用的父任务验收观察；其他文件正文及材料清单 MUST 继续使用各自版本，不保存到 Task Record

#### Scenario: 材料读取异常
- **WHEN** 任务材料缺失、失效、版本冲突或读取失败，但 Task Record 自身结构有效
- **THEN** Task Record MUST 继续完整可读，异常 MUST 只由材料入口报告局部诊断
- **AND** MUST NOT 自动修改任务状态、删除引用、否定已成立结果或阻塞无关合法记录动作

#### Scenario: 旧记录与专业历史
- **WHEN** 新材料能力开始服务已有任务
- **THEN** 原 Task identity、历史系统时间、已有结果历史、Change 引用与专业历史 MUST 保留；显式导入说明只记录本次真实变化
- **AND** MUST NOT 在读取中迁移、批量生成占位说明或把本次关联伪装成历史已有事实

### Requirement: 分页 Task 列表必须保持轻量 stored-state projection
分页与未分页 Task 列表 MUST 只从 canonical Workspace SQLite Task authority 读取不含 `brief` 正文或结果历史载荷的摘要字段、stored references 与直接关系。完整正文与历史 MUST 各自通过内部摘要参与同一记录版本；列表 MUST NOT 读取 filesystem registry 或调用 Git、Worktree、OpenSpec Change resolver、Development、Review、Verification 或 Finish reader；实时引用可用性 MUST 只在具体详情入口解析。

#### Scenario: 数百条 Task 中读取一批
- **WHEN** Workspace 包含数百个 Task 和 stored Change references，调用方请求 50 条分页结果
- **THEN** repository MUST 只对当前批次执行有限批量参数化查询与组装
- **AND** Application MUST NOT 按 Task 或 Change reference 执行实时当前性解析

#### Scenario: 列表返回 stored Change reference
- **WHEN** 当前批次 Task 保存了 `project/change` reference
- **THEN** projection MUST 原样返回 stored reference，使 Buildr Web 能构造详情链接
- **AND** 列表 MUST NOT 声称该引用当前 available、active、archived 或来自 matching Worktree

#### Scenario: 正文较长的任务列表
- **WHEN** 调用方查询具有长 Markdown 说明的任务列表
- **THEN** 列表 MUST 不读取或返回正文，但同一任务的 recordDigest MUST 与单任务详情一致
- **AND** 详情 MUST 返回当前真实 `brief`，正文变更 MUST 改变记录版本

### Requirement: Buildr Web Task API 必须保持 Workspace 写安全边界
Buildr MUST 在 Workspace-scoped Task 路径提供 list、detail、update、complete、abandon 与单项复盘文档只读接口。接口 MUST 解析 canonical root，复用同源、session、JSON、body size、字段白名单与 record digest 边界，MUST 不接受文件路径。任务更新正文 MUST 接受受控的 brief 字符串；正文大小限制 MUST 按实际 UTF-8 内容校验，更新请求的 JSON 体积上限 MUST 覆盖合法正文的转义开销，不扩大其他路由的请求边界。

#### Scenario: Task API 使用已登记 Workspace
- **WHEN** workspaceId 已登记且有效
- **THEN** HTTP MUST 只把真实 root 和明确 input 交给 Application
- **AND** MUST 不混入其他 Workspace 事实

#### Scenario: Task list 使用合法 query
- **WHEN** collection GET 使用 q、project、service、status、hasChildren 或 retrospectiveState
- **THEN** HTTP MUST 通过 closed Schema 和 mapping 调用 Task query
- **AND** MUST 拒绝 hasRetrospective 与旧处置状态值

#### Scenario: Task API 提交路径或越界字段
- **WHEN** query/body 包含 target、root、path、未知字段或专业正文
- **THEN** HTTP MUST 在读取或写入前拒绝
- **AND** MUST 不回退 cwd 或调用方路径

#### Scenario: Task API 写请求不可信
- **WHEN** mutation 缺少 Origin/session、合法 JSON、body boundary 或必需字段
- **THEN** HTTP MUST 拒绝并保持 Task 不变
- **AND** MUST 返回稳定错误 envelope

#### Scenario: Task API 输入校验不变异
- **WHEN** DTO 含类型错误、缺失或未知字段
- **THEN** validator MUST 不转换、填充或删除字段
- **AND** writer MUST 不被调用

#### Scenario: Task API 返回既有 result family
- **WHEN** Task 操作或复盘文档读取成功，或 Application 返回业务错误
- **THEN** response MUST 匹配对应 Schema
- **AND** Task mutation 使用 v5，detail 使用 v3，轻量 list 使用 v7，复盘文档读取使用独立 v1 响应；其中完整记录 MUST 使用 task-record/v4

#### Scenario: 较大合法正文更新
- **WHEN** 同源调用方提交不超过 1 MiB UTF-8 的真实 Markdown 正文及当前版本
- **THEN** 更新 MUST 支持合法 JSON 转义后的请求并保存同一内容
- **AND** 非法 Unicode、超限正文或其他路由原有上限 MUST 继续拒绝

### Requirement: Task Record v3必须保存最小复盘文档事实
任务记录 v4 MUST 继续保留 v3 引入的可空 retrospective，其中只允许 documentDigest 与 state: pending-decision|decided；MUST 不恢复 retrospectiveSourceTaskIds。Task Record MUST 把固定本机 documentPath 作为只读派生值返回，MUST 不在 SQLite 保存复盘正文或路径。该边界 MUST 不影响独立任务说明 brief 的记录归属。

#### Scenario: 读取没有复盘文档的Task
- **WHEN** Task 没有登记本机复盘文档
- **THEN** record 的 retrospective MUST 为 null
- **AND** 该值 MUST 不产生失败、待办或自动提示

#### Scenario: 读取已登记文档
- **WHEN** 终态 Task 已登记合法文档摘要和决定状态
- **THEN** record MUST 返回 closed 复盘文档事实和固定派生路径
- **AND** MUST 不返回复盘 Markdown 正文、旧处置字段或后续来源关系

### Requirement: todo Task 必须保持最小数据意向边界
`buildr.task-record/v4` MUST 允许显式 `todo` 且要求 Change 为空；每个任务具有可空的 `brief` 字段，不因待办意向生成占位正文。Review与Verification只接受各自合法Task状态；复盘文档只能登记到terminal Task。reader MUST不因todo存在创建目录、current row或执行事实。

#### Scenario: 读取todo Task
- **WHEN** caller inspect一个todo Task
- **THEN** MUST只返回Task Record事实且`retrospective`为`null`
- **AND** MUST产生零专业写入和零环境副作用

## ADDED Requirements

### Requirement: 任务说明必须作为记录正文受控保存
所有任务记录 MUST 具有 `brief: string | null`；正文 MUST 保存真实 Markdown，保留其格式与内容，按明确体积边界校验；空值 MUST 表达尚未填写，MUST NOT 用 intent、聊天或变更说明替代。创建和更新 MUST 使用同一任务应用，更新 MUST 校验已观察 recordDigest；终态更正 MUST 保留旧正文，目标变化 MUST 使陈旧组合验收观察失效。正文 MUST 随任务数据库保存，不随代码分支选择变化。

#### Scenario: 无 OpenSpec 的说明读写
- **WHEN** 调用方创建或更新一个 code-only 或文档任务的真实说明
- **THEN** CLI、HTTP 和页面 MUST 读取同一当前 brief；MUST 不要求材料关联或 Change
- **AND** 保存正文 MUST 不修改其他材料或专业结论

#### Scenario: 正文并发更新
- **WHEN** 两个入口基于同一记录版本更新正文
- **THEN** 后完成的陈旧写入 MUST 被拒绝并保持已成立内容，调用方 MUST 重读并判断

#### Scenario: 终态目标更正
- **WHEN** 调用方按已有更正规则修改终态任务说明
- **THEN** 系统 MUST 保存更正前的正文及已有历史事实，MUST 不重写历史结果

### Requirement: 旧独立说明必须显式导入并保全来源
系统 MUST 提供显式导入单任务或明确批次旧说明的产品动作，观察 Task Record、唯一旧 brief 关联和真实正文版本后核验写入；MUST 不在列表或详情读取中迁移。导入 MUST 保留原文件和其他角色关联，释放已迁移的旧说明关联，不允许另一份当前可编辑正文。已存在正文、缺失来源、安全失败、并发变化和部分完成 MUST 分别报告，MUST 不选主 Change、扫描同名文件或覆盖新正文。

#### Scenario: 导入可读的旧独立说明
- **WHEN** 用户明确请求导入，记录、关联和实际文档版本与观察一致且 brief 为空
- **THEN** 系统 MUST 导入实际正文，解除旧说明关联并保留原文件及其他材料
- **AND** 可证明的相对文档链接 MUST 转为明确引用；未知链接 MUST 如实报告，不能扩大读取范围

#### Scenario: 导入来源发生变化
- **WHEN** 记录、关联或文档在观察后变化
- **THEN** 系统 MUST 拒绝对应迁移写入并保留当前现场，不自动重放旧输入

#### Scenario: 缺失独立说明或已编辑新正文
- **WHEN** 历史任务没有可读取的独立说明，或记录 brief 已有内容
- **THEN** 系统 MUST 报告缺失或已存在，MUST 不用 intent 或 Change Brief 填充，也不覆盖已有正文
- **AND** 已有正文且仍有旧关联时，显式迁移 MUST 只核对当前记录与关联版本并释放旧关联，保持正文和原文件不变

#### Scenario: 终态组合任务导入真实旧正文
- **WHEN** 终态组合任务的 brief 为空且显式导入来源与三份观察版本一致
- **THEN** 专用导入 MUST 补入真实正文，保持任务状态、结果、过去历史与系统时间，并记录本次真实变化
- **AND** 普通用户更正 MUST 继续遵守组合任务验收保护

#### Scenario: 分页批次导入
- **WHEN** 明确批次涵盖超过一页的任务，导入会改变任务更新时间
- **THEN** 系统 MUST 先收集完整任务身份再逐项重新观察并导入，MUST 不因分页排序变化跳过任务
