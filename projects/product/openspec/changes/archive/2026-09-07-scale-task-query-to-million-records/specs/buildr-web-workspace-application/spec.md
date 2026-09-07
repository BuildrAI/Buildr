## REMOVED Requirements

### Requirement: Buildr Web 任务目录必须默认聚焦未结束任务
**Reason**: 用户确认 standalone 默认信息流应按进行中、待办、已完成、已放弃展示全部状态，而不是隐藏终态历史。

**Migration**: 由新增“Buildr Web任务目录必须默认展示四态信息流”替代；`open`仍保留为显式筛选。

## ADDED Requirements

### Requirement: Buildr Web任务目录必须默认展示四态信息流
Buildr Web Task列表首次进入和清除筛选 MUST使用`status=all`，并 MUST按进行中、待办、已完成、已放弃顺序连续展示；`open|todo|active|completed|abandoned` MUST继续作为显式状态筛选。选择复盘筛选时 MUST保持`all`，除非用户随后主动选择其他状态。

#### Scenario: 首次进入列表
- **WHEN** Workspace同时包含todo、active、completed与abandoned Tasks
- **THEN** 页面首个Task list请求 MUST携带`status=all`
- **AND** 信息流 MUST按active、todo、completed、abandoned顺序展示首批与后续批次

#### Scenario: 清除筛选
- **WHEN** 用户清除Task列表筛选
- **THEN** 页面 MUST恢复`status=all`并从四态信息流首批重新读取

#### Scenario: 显式查看未结束任务
- **WHEN** 用户选择“未结束”筛选
- **THEN** 页面 MUST提交`status=open`并只显示active与todo
- **AND** 排序 MUST保持active先于todo

### Requirement: Task搜索必须保持百万级索引边界
Buildr Web MUST只在普通搜索关键词达到3个Unicode字符后提交服务端查询；不足3个字符时 MUST显示简短提示并保留当前结果，不得发起全表回退搜索。以`#`开头的完整合法Task ID MUST允许立即精确查询。

#### Scenario: 输入短关键词
- **WHEN** 用户输入1至2个Unicode字符且不是完整`#task-id`
- **THEN** 页面 MUST提示“至少输入3个字符”并停止新的搜索请求
- **AND** MUST不清空或替换当前已加载信息流

#### Scenario: 输入可索引关键词
- **WHEN** 用户输入至少3个Unicode字符且短防抖结束
- **THEN** 页面 MUST从第一批请求服务端FTS筛选结果

## MODIFIED Requirements

### Requirement: Task 信息流排序必须由服务端保持跨批一致
分页查询 MUST在服务端按`active → todo → completed → abandoned`状态优先、`updatedAt DESC`和`taskId ASC`排序，并使用同一顺序的索引与cursor。客户端 MUST按批次顺序追加，不得在单批或已加载集合中重新排序而破坏全局顺序。

#### Scenario: 多批次包含不同状态和相同更新时间
- **WHEN** 完整筛选结果跨越多个批次，并包含四种状态或相同`updatedAt`的Task
- **THEN** 用户观察到的完整信息流 MUST保持active、todo、completed、abandoned，再按`updatedAt`倒序和`taskId`正序排列
- **AND** 批次边界 MUST不产生重复或遗漏

#### Scenario: 后续批次不覆盖首批元数据
- **WHEN** Web使用cursor追加第二批及以后Task
- **THEN** Hook MUST保留首批filter options和匹配计数，并只追加当前批次Task与更新hasMore/nextCursor
- **AND** 后续响应的空filter options MUST不清空筛选控件
