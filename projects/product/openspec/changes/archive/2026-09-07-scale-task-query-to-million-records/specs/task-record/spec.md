## REMOVED Requirements

### Requirement: Buildr Web Task 列表必须支持 open 与封闭 SQLite 过滤
**Reason**: 默认状态从open改为all，关键词增加百万级索引边界，原Requirement名称和行为不再准确。

**Migration**: 由新增“Task列表必须支持四态默认查询与索引化过滤”替代；open继续作为显式过滤值。

## ADDED Requirements

### Requirement: Task列表必须支持四态默认查询与索引化过滤
Task query projection MUST支持关键词、Project、Service、`open|todo|active|completed|abandoned|all` status、是否有直接 Child 与复盘文档 `missing|pending-decision|decided|all` 的参数化过滤。关键词 MUST对 title、intent 与 task_id 使用索引化搜索，与其他条件使用 AND；普通关键词的每个有效分词 MUST至少包含3个Unicode字符，`#<完整-task-id>` MUST支持不受该长度限制的精确Task ID查询。空白关键词 MUST等同未过滤，FTS grammar 与SQL注入输入 MUST按普通文本安全处理。Application/repository 未传 status 时 MUST保持 `all` 语义，Buildr Web 首次进入和清除页面筛选 MUST显式使用 `all`。

#### Scenario: 组合过滤
- **WHEN** 调用方同时提供关键词、Project、Service、status、hasChildren 与 retrospectiveState
- **THEN** Task list read repository MUST使用参数绑定和索引化SQL按 AND 组合过滤维度
- **AND** MUST NOT先读取完整Project/Service Task ID集合、构造无界`IN (...)`或回退为全表关键词扫描
- **AND** `status=open` MUST只匹配 active 与 todo

#### Scenario: Buildr Web 默认 all
- **WHEN** 用户首次进入 Task 列表且未在页面选择其他状态
- **THEN** Web feature MUST显式请求 `status=all`
- **AND** Application/repository 在未传 status 时 MUST保持返回全部状态Task的语义

#### Scenario: 复盘筛选查看终态
- **WHEN** 用户选择 `pending-decision` 或 `decided` 复盘筛选
- **THEN** Web MUST保持页面状态筛选为 `all` 并按其他条件显示匹配的terminal Tasks
- **AND** 用户仍 MUST可主动选择其他合法 status

#### Scenario: Project 与 Service 选项
- **WHEN** 页面首次生成 Project/Service 下拉选项
- **THEN** Application MUST从 Task SQLite scope rows 读取 distinct identities，选择 Project 后页面 MUST只展示该 Project 的 Service
- **AND** cursor后续批次 MUST不重复读取或覆盖首批筛选选项，也不得读取 Project/Service filesystem registry

#### Scenario: 普通关键词分词不足三个字符
- **WHEN** 调用方提交的非空普通关键词包含不足3个Unicode字符的有效分词、并且不是`#<完整-task-id>`
- **THEN** Application MUST零写入拒绝并提示每个有效分词至少输入3个字符
- **AND** MUST NOT执行FTS或全表回退扫描

#### Scenario: 搜索请求发生竞态
- **WHEN** 新筛选请求在旧请求完成前发出
- **THEN** 页面 MUST显示明确 loading，并 MUST防止旧响应覆盖新条件结果
- **AND** 空结果 MUST区分 Workspace 没有 Task 与当前筛选无结果

### Requirement: Task list read model 必须具有百万级有界查询结构
Task Query Application MUST通过独立只读Task list repository取得分页边界和最多51个Task identity，再通过现有Domain repositories批量组装最多50条Task、scope、stored Change references与直接关系。查询 MUST不使用OFFSET、完整候选ID数组、逐Task SQL、逐页重复count/options或无索引关键词扫描。

#### Scenario: 百万条默认信息流
- **WHEN** Workspace包含1,000,000条代表性四态Task且调用方请求任意50条默认分页
- **THEN**首批主查询 MUST使用声明的feed index，跨状态续载 MUST从cursor所在状态开始执行最多4个有界键集查询并合并取得最多51个边界row
- **AND**Application MUST只为返回批次批量读取关联数据

#### Scenario: 百万条结构过滤
- **WHEN**调用方组合Project、Service、Child、复盘或单状态过滤
- **THEN**repository MUST在SQL中通过适用索引和EXISTS求交
- **AND**进程内存与SQL参数数量 MUST只受固定pageSize和固定查询结构约束，不得随完整匹配量线性增长

#### Scenario: 百万条关键词过滤
- **WHEN**调用方提交至少3个Unicode字符的普通关键词
- **THEN**repository MUST通过FTS5 trigram派生索引筛选title、intent与task_id
- **AND**Task返回内容 MUST仍从canonical tasks及关系表组装

## MODIFIED Requirements

### Requirement: Task query projection 必须支持稳定的可选游标分页
Task Record Application MUST 支持调用方以可选 `pageSize` 和不透明 `cursor` 分批读取完整筛选结果。`pageSize` MUST 是有界正整数；提供分页时，响应 MUST 返回当前批次大小、首批完整匹配数量、是否仍有后续结果和下一游标。未提供 `pageSize` 的 Application 调用 MUST 保持返回全部匹配 Task 的兼容语义。

#### Scenario: 读取第一批 Task
- **WHEN** 调用方提交合法筛选和 `pageSize=50`，且匹配结果超过50条
- **THEN** Application MUST按`active → todo → completed → abandoned`、`updatedAt DESC`、`taskId ASC`返回前50条、完整匹配数量、`hasMore=true`与非空`nextCursor`
- **AND** 首批 MUST返回 Workspace total、matching count和filter options

#### Scenario: 使用游标读取下一批
- **WHEN** 调用方以同一筛选和第一页返回的`nextCursor`请求下一批
- **THEN** Application MUST从上一批最后一条确定排序键之后继续返回结果
- **AND** 相同排序键的Task MUST以`taskId`确定边界，不得重复或遗漏
- **AND** MUST复用cursor内首批计数并返回`filterOptions=null`，不得重复执行count或distinct options查询

#### Scenario: 最后一批 Task
- **WHEN** 当前批次已经包含当前查询边界后的最后一条匹配Task
- **THEN** Application MUST返回`hasMore=false`与空`nextCursor`

#### Scenario: 拒绝不匹配的游标
- **WHEN** cursor非法、内部版本陈旧、pageSize越界或cursor与当前筛选条件不匹配
- **THEN** Application MUST零写入拒绝请求并返回封闭的Task list filter diagnostic

#### Scenario: 未分页调用保持兼容
- **WHEN** Application调用方未提供`pageSize`和`cursor`
- **THEN** Application MUST返回全部匹配Task，并保持既有过滤与stored-state projection语义
