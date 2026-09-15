# Delta Spec：buildr-web-client

## MODIFIED Requirements

### Requirement: Buildr Web 壳层必须采用上下结构
Buildr Web App Shell MUST 在顶部提供品牌、共同工作空间范围、“工作台”和“工作空间”两个区域及交给 Agent 操作，工作台 MUST 排在工作空间之前。选定范围的两个区域 MUST 共享相同 workspaceId。工作台 MUST 沿用任务列表与详情，并保留文章入口；工作空间 MUST 使用常驻左侧导航承载项目、服务、技能和设置四个平级入口，导航标签 MUST 使用中文，四个入口 MUST 采用一致的行式呈现（图标 + 文案、相同行高），MUST NOT 在左侧导航内展开项目树或所属服务列表。项目详情与服务详情 MUST 保留右上角编辑入口；视觉 token、Ant Design 5 与离线 CSP 边界 MUST 保持既有约束。

工作空间区域的内容区 MUST 采用双栏组页签模型：
- 左组 MUST 提供页面级页签条：项目目录、项目全景、服务目录、服务全景各自以页签呈现；打开新页面 MUST 追加或激活对应页签；页签 MUST 支持关闭，关闭当前页对应页签时 MUST 切换到剩余页签或回到目录兜底；页面级页签集合 MUST 在同一会话的页面间保持。
- 右组 MUST 提供对象级页签条：在项目全景或服务全景内点开服务、文档、变更等对象时，MUST 在右组以页签就地展开，MUST NOT 跳离当前领域页面；右组页签全部关闭时右组 MUST 退场，左组恢复独占。
- 两组之间 MUST 为贯连的分隔线，MUST 支持拖拽调整右组宽度；两组的页签条在分隔线处 MUST 视觉连通；两组内容区 MUST 各自独立滚动。
- 左组内容 MUST 限宽居中；右组打开时左组内容限宽 MUST 收窄以保持密度均衡。
- 修改项目、修改服务与交给 Agent 等动作 MUST 统一在抽屉层完成，抽屉 MUST 采用一致的壳结构（标识行、标题、副标题、关闭与底部状态区）。
- 壳层与内容区 MUST 使用统一的白底，不得以不同区域底色分割主要分区。

#### Scenario: 顶栏承载主导航
- **WHEN** 用户在选定 Workspace 中切换工作台和工作空间
- **THEN** 顶部 MUST 依次呈现“工作台”“工作空间”，保持同一工作空间范围
- **AND** 工作台 MUST 展示现有任务页面；工作空间 MUST 展示工作空间内容
- **AND** 主菜单 MUST NOT 展示环境维护分组或智能体配置入口

#### Scenario: 进入 Workspace 直接打开任务列表
- **WHEN** 用户进入可用 Workspace、点击品牌或切换工作空间
- **THEN** MUST 打开该 Workspace 的任务列表并选中工作台
- **AND** `/workspaces/:workspaceId/` 与 `/workspaces/:workspaceId/overview` MUST 继续重定向到任务列表

#### Scenario: 平级领域导航
- **WHEN** 用户查看工作空间左侧导航
- **THEN** MUST 呈现项目、服务、技能、设置四个平级入口，行式一致
- **AND** MUST NOT 在导航内展开项目树或项目所属服务列表
- **AND** 当前领域入口 MUST 有可辨认的选中态

#### Scenario: 页面级页签生命周期
- **WHEN** 用户从项目目录进入项目全景，或从服务目录进入服务全景
- **THEN** 左组页签条 MUST 追加对应全景页签并激活，目录页签保持存在
- **AND** 点击既有页签 MUST 切换回对应页面
- **AND** 关闭页签 MUST 将其移除；关闭当前页对应页签时 MUST 切换到剩余页签，全部关闭时 MUST 回到对应目录
- **AND** 页面级页签集合 MUST 在会话内跨页面保持

#### Scenario: 项目与服务上下文导航
- **WHEN** 用户从项目目录或服务目录选择某个项目或服务
- **THEN** MUST 以页面级页签打开对应全景，左侧导航 MUST 保持平级四项且正确标记当前领域
- **AND** MUST NOT 在左侧导航展开项目树或所属服务列表

#### Scenario: 独立展开与折叠
- **WHEN** 用户在全景内点开或关闭某个服务、文档、变更对象
- **THEN** MUST 只在右组打开或关闭对应对象页签，不跳转当前页面
- **AND** 关闭对象页签 MUST NOT 影响左组全景的选中与滚动状态
- **AND** 页签与关闭控件 MUST 支持键盘操作并提供可访问名称

#### Scenario: 领域内对象在右组就地展开
- **WHEN** 用户在项目全景点击服务卡片或文档行，或在服务全景点击文档或变更行
- **THEN** 右组 MUST 出现并以新页签展示该对象内容，左组全景 MUST 保持可见可交互
- **AND** 左组中已打开的对象 MUST 有可辨认的“阅读中”标记
- **AND** MUST NOT 跳转离开当前领域页面，MUST NOT 提供“打开完整页面”式跳走出口
- **AND** 右组页签全部关闭时右组 MUST 退场

#### Scenario: 贯连分隔线可调宽
- **WHEN** 右组存在且用户拖拽两组之间的分隔线
- **THEN** 右组宽度 MUST 随拖拽在允许区间内调整
- **AND** 分隔线 MUST 贯通内容区高度，并在页签条高度处与两条页签条视觉连通
- **AND** 悬停与拖拽时分隔线 MUST 有可辨认的强调态

#### Scenario: 详情保持通栏
- **WHEN** 用户从服务或文章目录进入详情
- **THEN** 详情 MUST 替换对应区域的主要内容，不重复挂载旧资源列表宿主
- **AND** 当前区域的左侧导航 MUST 保持可达

#### Scenario: 项目与服务路由保持
- **WHEN** 用户通过 URL 直接访问项目或服务的详情及编辑地址
- **THEN** MUST 保留既有 `/projects`、`/projects/:projectCode`、`/services`、服务详情及编辑路由
- **AND** MUST NOT 改变项目和服务的身份、归属或关联语义

#### Scenario: 项目新增入口
- **WHEN** 用户点击项目目录的创建入口
- **THEN** MUST 打开既有项目创建指令交互（抽屉），不直接创建源资产

#### Scenario: 任务页宽屏并排列表与详情
- **WHEN** 用户在宽屏打开任务列表或详情
- **THEN** 工作台内容区 MUST 保留任务列表与详情并排行为
- **AND** `/tasks` 与 `/tasks/:taskId` 路由 MUST 保持不变

#### Scenario: 任务页窄屏避免横向溢出
- **WHEN** viewport 宽度为 390px 且用户打开任务详情
- **THEN** 详情 MUST 可见并可操作
- **AND** 页面主容器 MUST NOT 横向溢出
- **AND** 任务列表 MAY 暂时不与详情并排

#### Scenario: 项目页宽屏并排列表与详情
- **WHEN** 用户在宽屏打开项目目录或项目全景
- **THEN** 目录与全景 MUST 以页面级页签组织，项目全景 MUST 展示 hero、服务卡片与文档区
- **AND** 点开服务或文档时右组 MUST 与左组并排展示对象页签
- **AND** `/projects` 与 `/projects/:projectCode` 路由 MUST 保持不变

#### Scenario: 项目页窄屏避免横向溢出
- **WHEN** viewport 宽度为 390px 且用户打开项目全景
- **THEN** 详情 MUST 可见并可操作
- **AND** 页面主容器 MUST NOT 横向溢出
- **AND** 右组 MAY 降级为浮动层或暂不出现

#### Scenario: 列表筛选保持一行
- **WHEN** 用户打开任务列表或项目、服务目录
- **THEN** 搜索与筛选控件 MUST 出现在标题下方的同一工具行
- **AND** MUST NOT 使用独立竖排筛选表单卡作为默认布局

#### Scenario: 服务菜单名称
- **WHEN** 用户查看工作空间导航
- **THEN** 服务集合入口 MUST 显示“服务”，继续使用原有 `/services` 路由
- **AND** 本次 MUST NOT 改变项目和服务的身份、归属或关联语义

#### Scenario: 窄屏降级
- **WHEN** viewport 宽度不足以并排容纳双栏组（≤1440px）
- **THEN** 右组 MUST 降级为右侧浮动层，不挤压左组内容
- **WHEN** viewport 宽度为 390px 且用户打开任务详情或项目详情
- **THEN** 详情 MUST 可见并可操作，页面主容器 MUST NOT 横向溢出

#### Scenario: 克制的视觉反馈
- **WHEN** 用户悬停、聚焦或操作导航、页签与分隔线
- **THEN** MUST 能辨认可操作目标与当前选择，正文阅读区域 MUST 保持清晰层级
- **AND** 减少动态效果偏好 MUST 被尊重，装饰动效 MUST NOT 延迟内容或阻止操作
