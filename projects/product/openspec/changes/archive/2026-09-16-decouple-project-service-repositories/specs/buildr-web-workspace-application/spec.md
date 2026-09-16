## MODIFIED Requirements

### Requirement: 新增 Project 必须生成可复制 Agent prompt
Buildr MUST 保留“交给 Agent”的指令生成入口，生成或复制指令不代表执行；资源页面的直接登记遵循统一资产管理交互，代码克隆保持独立动作。

#### Scenario: 生成最小 Project 意图 prompt
- **WHEN** 用户选择“交给 Agent”入口，且用户填写 Project 名称和用途，并且没有填写 code、source 或 Git 声明
- **THEN** Application MUST 返回要求 Agent 核对当前 Workspace、提出可读 code、确认 source boundary、执行 canonical Project creation 并验证结果的 prompt
- **AND** 页面 MUST 明确说明复制 prompt 不会创建 Project
- **AND** 页面 MUST NOT 要求用户先理解 Project asset repo、remote 或 integration branch

#### Scenario: 生成 workspace Project prompt
- **WHEN** 用户选择“交给 Agent”入口，且用户填写名称、用途和可选 code，并明确选择 workspace source
- **THEN** prompt MUST 保留用户提供的声明并要求 Agent 确认目标 Workspace、物化路径和 root Git boundary
- **AND** prompt MUST 要求 Agent 使用 canonical Project creation 并验证结果

#### Scenario: 生成 Git Project prompt
- **WHEN** 用户选择“交给 Agent”入口，且用户提供独立 Project asset Git URL、remote 或 integration branch
- **THEN** prompt MUST 保留已经提供的声明并要求 Agent 校验 remote identity、路径、授权和稳定集成目标
- **AND** 未提供的技术声明 MUST 由 prompt 要求 Agent 解析或询问，不得由页面猜测
- **AND** prompt MUST NOT 要求 Buildr 盲目切换、stash 或重连既有 checkout

### Requirement: 新增 Service 必须生成可复制 Agent prompt
Buildr MUST 保留“交给 Agent”的指令生成入口，生成或复制指令不代表执行；资源页面的直接登记遵循统一资产管理交互，代码克隆保持独立动作。

#### Scenario: 生成最小 Service 意图 prompt
- **WHEN** 用户选择“交给 Agent”入口，且用户选择一个已登记 Project，填写 Service 名称和用途，并且没有填写 code、type 或 repo ref
- **THEN** 页面 MUST 生成要求 Agent 核对 Project identity、确认是否存在代码仓或可执行资产、补齐必要声明并调用 canonical CLI 的 prompt
- **AND** prompt MUST NOT 假设每个 Project 都必须创建 Service

#### Scenario: 生成本地来源 prompt
- **WHEN** 用户选择“交给 Agent”入口，且用户选择 canonical Project 并提供本地目录
- **THEN** 页面 MUST 生成要求 Agent 核对来源、物化路径、Git boundary、code/type 候选、调用 canonical CLI 并验证的完整 prompt
- **AND** 页面 MUST NOT 直接复制目录、创建外部链接或写 registry

#### Scenario: 生成 Git 来源 prompt
- **WHEN** 用户选择“交给 Agent”入口，且用户选择 canonical Project 并提供 Git URL、remote 或 integration branch
- **THEN** prompt MUST 保留已经提供的稳定声明并要求 Agent 在写入前检查既有 repo、metadata identity 和授权
- **AND** 未提供的 code、type、remote 或 integration branch MUST 由 Agent 解析或询问，不得由页面猜测

#### Scenario: 拒绝未知所属 Project
- **WHEN** 用户选择“交给 Agent”入口，且Service prompt 请求中的 Project 不属于当前 Workspace 或已经不存在
- **THEN** Application MUST 在生成 prompt 前拒绝请求
- **AND** MUST NOT 回退到第一个 Project 或其他 Workspace

### Requirement: 项目与服务创建必须使用抽屉式 Agent Action
Buildr MUST 将直接对象登记与“交给 Agent”入口区分。创建项目使用抽屉并支持可选服务，新增服务使用抽屉，内联新增代码库；顶栏继续提供不产生登记副作用的智能体动作。

#### Scenario: 从项目区域创建项目
- **WHEN** 用户点击项目目录的创建按钮
- **THEN** 系统 MUST 打开项目创建抽屉，允许选择已有服务、就地新增或不关联服务

#### Scenario: 从服务区域创建服务
- **WHEN** 用户点击服务目录或关联选择器的新增服务
- **THEN** 系统 MUST 打开服务抽屉，选择唯一代码库或内联填写新 Git 来源；不要求唯一父项目

#### Scenario: 用户未提供技术声明
- **WHEN** 用户选择智能体动作而缺少可靠代码来源
- **THEN** 系统 MUST 允许表达目标并让智能体查明必要信息，不编造地址、分支或代码位置

#### Scenario: 从工作空间内顶栏入口选择创建类型
- **WHEN** 用户打开顶栏“交给 Agent”
- **THEN** 系统 MUST 保留项目、服务及开始工作等指令入口，并说明生成或复制不代表执行

### Requirement: 本机应用必须以控制台级信息层级呈现资源
Buildr 本机应用 MUST 使用紧凑的工作控制台信息层级：中文为主语言、技术身份与 Git observation 为次级信息、稳定 metadata 编辑与资源目录分离，对象登记使用明确表单，代码准备等执行动作仍通过智能体（Agent）进行。

#### Scenario: 查看资源列表
- **WHEN** 用户打开项目、服务、代码库或技能目录
- **THEN** 页面 MUST 提供一致的标题、数量、过滤、刷新控件与“新增 xxx”主操作；技能受管内容仍通过智能体动作维护
- **AND** 表格操作 MUST 使用一致的低强调详情链接或按钮，资源行本身不得同时承担主编辑流程

#### Scenario: 查看资源详情
- **WHEN** 用户打开 Project、Service 或 Change 详情
- **THEN** 页面 MUST 按页头、概览、稳定 metadata、技术信息和关联资源的层级展示真实 read model
- **AND** UUID、revision、路径、source 和 Git observation MUST 不占用主标题或主概览视觉

#### Scenario: 反映真实导航层级
- **WHEN** 用户在工作空间内浏览目录或详情
- **THEN** 应用 shell MUST 在顶栏显示可理解的工作空间名称与当前区域导航高亮，并在左侧标记对应资源
- **AND** 工作空间切换器 MUST 展示当前名称，并提供返回工作空间目录的明确入口
