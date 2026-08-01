## MODIFIED Requirements

### Requirement: 本机应用必须提供 Change 管理视图
Buildr 本机应用 MUST 在资源导航中提供独立的变更（Change）管理视图，并 MUST 使用明确的表格操作栏、过滤和详情入口展示真实 Project Change。

#### Scenario: 打开 Change 表格
- **WHEN** 用户访问 `/changes`
- **THEN** 页面 MUST 展示 Change 名称、所属项目、生命周期、任务进度、更新时间和操作栏
- **AND** 页面 MUST 提供项目与 active/archived 生命周期过滤

#### Scenario: 使用表格操作栏
- **WHEN** 用户查看任一 Change 行
- **THEN** 操作栏 MUST 提供详情和交给 Agent 的明确行为
- **AND** 表格行本身 MUST NOT 是唯一的信息或行为入口

#### Scenario: 创建 Change
- **WHEN** 用户点击“创建变更”
- **THEN** 页面 MUST 使用抽屉或弹窗，从当前 Workspace 已登记 Project 中选择所属项目，并收集目标说明
- **AND** MUST NOT 允许自由输入未登记的项目代码
- **AND** 当上下文提供的 Project code 属于已登记 Project 时，所属项目 MUST 默认选中该 Project
- **AND** MUST 展示可复制的 Agent prompt，不得直接写入 OpenSpec

#### Scenario: 无已登记 Project 时创建 Change
- **WHEN** 用户打开“创建变更”且当前 Workspace 没有已登记 Project
- **THEN** 页面 MUST 展示明确空态（例如“请先创建项目”）
- **AND** MUST NOT 生成创建变更 prompt

#### Scenario: 异步加载期间切换抽屉
- **WHEN** 用户打开“创建变更”后，在项目列表请求完成前关闭抽屉或切换到其他 Agent Action 表单
- **THEN** 过期的项目列表响应 MUST NOT 修改当前可见表单中的同名控件
- **AND** MUST NOT 向当前表单额外绑定“创建变更”提交处理器
- **AND** MUST NOT 把错误展示到当前其他表单
