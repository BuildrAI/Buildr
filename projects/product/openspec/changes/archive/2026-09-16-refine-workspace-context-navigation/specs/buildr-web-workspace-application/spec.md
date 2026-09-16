## MODIFIED Requirements

### Requirement: 资源详情与修改必须使用独立操作
Buildr 本机应用 MUST 将 Project 与 Service 的详情呈现保持为只读，并以统一的标签和值展示资源身份、稳定 metadata 与来源事实；技术信息 MUST 在折叠区内沿用相同的标签和值形式。Project 与 Service 常用编辑入口 MUST 使用右侧抽屉，且 MUST NOT 改变当前页面 URL；既有独立编辑 URL MUST 保持兼容。Project 与 Service 详情 MUST NOT 内嵌所属关联资源的目录、卡片或跳转入口。Project 列表行 MUST 只展示标题与说明；Service 关联资源跳转 MUST 由服务目录行的操作列提供。

#### Scenario: 查看只读资源详情
- **WHEN** 用户打开 Project 或 Service 详情
- **THEN** 页面 MUST 展示资源身份、说明、稳定 metadata 与技术信息
- **AND** 主事实与展开的技术信息 MUST 使用统一的标签和值形式
- **AND** 页面 MUST NOT 直接展示可编辑 input、textarea、保存按钮或关联资源跳转入口

#### Scenario: 从资源目录开始修改
- **WHEN** 用户在 Service 目录中选择“编辑”操作
- **THEN** 页面 MUST 在当前目录打开对应资源的右侧编辑抽屉
- **AND** 编辑页面 MUST 保持现有 metadata 白名单、revision CAS、迁移只读与反馈语义

#### Scenario: 从项目详情开始修改
- **WHEN** 用户打开项目详情
- **THEN** 详情右上角 MUST 提供“编辑项目”操作
- **AND** 该操作 MUST 打开右侧编辑抽屉且不离开当前详情 URL
- **AND** 项目列表 MUST NOT 再提供编辑入口

#### Scenario: 从资源目录访问关联资源
- **WHEN** 用户查看任一 Project 行
- **THEN** 该行 MUST 只展示项目标题与说明
- **AND** 进入详情 MUST 通过选择该行完成
- **WHEN** 用户查看任一 Service 行
- **THEN** 操作列 MUST 提供所属 Project 详情入口
- **AND** Project 与 Service 详情 MUST NOT 重复提供这些关联资源跳转

#### Scenario: 侧边栏指示当前资源
- **WHEN** 用户打开项目、服务目录或其详情/编辑页
- **THEN** 相应顶部区域与左侧对象 MUST 显示明显的当前状态
- **AND** 其他导航项的样式 MUST NOT 取代当前资源项的高亮

#### Scenario: 编辑抽屉保存与关闭
- **WHEN** 用户编辑项目或服务
- **THEN** 抽屉 MUST 明确显示对象名称并在底部固定保存和取消操作
- **AND** 保存成功 MUST 关闭抽屉并原位更新当前页面，不重置阅读位置
- **AND** 保存失败 MUST 保持抽屉和当前输入，沿用原有并发冲突保护

#### Scenario: 保护未保存内容
- **WHEN** 有未保存修改时用户点击取消、关闭、遮罩或按 Escape
- **THEN** MUST 直接关闭抽屉，不再显示放弃修改二次确认，未保存内容不得写入数据
- **AND** 保存中 MUST 阻止重复提交和关闭
- **AND** 无修改时 MUST 可直接关闭

#### Scenario: 手机编辑
- **WHEN** viewport 宽度为390px
- **THEN** 编辑抽屉 MUST 使用屏幕全宽，表单可滚动且底部操作仍可达
