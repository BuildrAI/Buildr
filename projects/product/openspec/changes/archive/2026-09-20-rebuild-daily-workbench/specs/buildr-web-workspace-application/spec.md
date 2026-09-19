## MODIFIED Requirements

### Requirement: Buildr Web 必须提供独立文章入口

Buildr Web MUST 在 Workspace 级工作空间区域左侧提供独立的“文章”导航入口，并 MUST 提供文章列表页与文章详情页；文章页面 MUST 保持只读，不得提供文章编辑、发布或平台同步操作。

#### Scenario: 从工作空间导航打开文章

- **WHEN** 用户在已选定 Workspace 的 Buildr Web 中点击“文章”
- **THEN** 应用 MUST 导航到该 Workspace scoped 的文章列表页
- **AND** 导航项 MUST 在文章列表或详情页保持 active 状态

#### Scenario: 打开文章详情

- **WHEN** 用户从文章列表选择一篇有效文章
- **THEN** 应用 MUST 展示文章标题、发布状态、发布目标和渲染后的 Markdown 正文
- **AND** 页面 MUST 提供返回文章列表的可用链接
- **AND** 页面 MUST NOT 提供修改文章正文或发布状态的写操作

### Requirement: Buildr Web任务目录必须默认展示四态信息流
Buildr Web Task列表首次进入和清除筛选 MUST使用`status=open`，并 MUST按进行中、待办顺序连续展示；显式`all`时 MUST按进行中、待办、已完成、已放弃顺序连续展示；`open|todo|active|completed|abandoned` MUST继续作为显式状态筛选。选择复盘筛选时 MUST保持`all`，除非用户随后主动选择其他状态。

#### Scenario: 首次进入列表
- **WHEN** Workspace同时包含todo、active、completed与abandoned Tasks
- **THEN** 页面首个Task list请求 MUST携带`status=open`
- **AND** 信息流 MUST按active、todo顺序展示首批与后续批次，用户可显式选择全部历史

#### Scenario: 清除筛选
- **WHEN** 用户清除Task列表筛选
- **THEN** 页面 MUST恢复`status=open`并从未结束信息流首批重新读取

#### Scenario: 显式查看未结束任务
- **WHEN** 用户选择“未结束”筛选
- **THEN** 页面 MUST提交`status=open`并只显示active与todo
- **AND** 排序 MUST保持active先于todo
