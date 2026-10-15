## ADDED Requirements

### Requirement: 代码导航与独立操作入口

代码区域导航 MUST 按源代码管理（Source Control）、资源管理器（Explorer）的顺序展示，导航选中与页面恢复 MUST 保持实际路径语义。具体工作树（Worktree）的操作菜单（Menu） MUST 提供同步（Sync）及单库获取远程（Fetch），目录标题的操作菜单（Menu） MUST 提供全部获取远程（Fetch）；各入口 MUST 有可访问名称与键盘操作。点击分支（Branch）名称或操作菜单（Menu） MUST NOT 意外改变当前阅读来源、触发行选择或展开折叠；只读刷新 MUST 继续独立提供且不触发 Git 写入。

#### Scenario: 导航与来源行的独立动作
- **WHEN** 用户进入代码区域，点击来源名称后的分支（Branch），然后打开同一来源行末的三个点
- **THEN** 源代码管理（Source Control） MUST 位于资源管理器（Explorer）之前；分支（Branch）名称 MUST 打开原分支（Branch）管理浮层（Popover），三个点 MUST 打开该来源的操作菜单（Menu）
- **AND** 当前阅读来源、固定文件及折叠状态 MUST 保持，各图标 MUST 可见可点击，长名称及窄栏 MUST 不覆盖它们

## MODIFIED Requirements

### Requirement: 全部代码库真实清单

源代码管理的缺省目录 MUST 展示当前工作空间全部已登记代码库实例，每个稳定身份只列一次，不按服务数量或远端地址归并。清单 MUST 表达已观察目录、当前分支或游离提交、按路径去重的未提交文件数、可得的本机上游领先／落后数、读取时间及局部诊断；未知数量 MUST NOT 表达为零或“已同步”。普通入口 MUST NOT 自动限定任务范围。

每个代码库 MUST 展示Git实际登记的主目录及全部关联工作树（Worktree），分别表达真实分支、目录、分层变更和观察版本，不因没有Buildr任务登记而遗漏。工作树计数 MUST 在本来源内按路径去重，代码库汇总 MUST 保留不同工作树的同名路径。代码库、工作树和比较层 MUST 可折叠展开，折叠 MUST NOT 清除仍有效的文件选择或已打开正文。

代码库（Repository）行 MUST 同时代表其主工作树（Main Worktree），选择该行即选择该真实来源，不再重复显示主工作树（Main Worktree）子行；行前图标 MUST 独立控制关联工作树（Worktree）的折叠展开。整个代码库（Repository）目录区域的头部 MUST 支持折叠展开。页面 MUST 使用一个当前具体来源同步控制未提交变更（Uncommitted Changes）和提交历史（Commit History），两种模式 MUST NOT 再提供独立的代码库（Repository）或工作树（Worktree）过滤入口；提交历史（Commit History）可独立指定本地或远程分支（Branch）及作者（Author），只改变读取范围。目录清单仍展示全部已登记实例和可发现来源，任务（Task）预选不得隐藏无关来源。

每个来源行右侧 MUST 紧凑组合远程状态与未提交文件状态，只常驻有意义的非零数量。上游（Upstream）数量已知且存在差异时 MUST 分别用向上箭头及数量表达未推送提交（Commit）、向下箭头及数量表达本机远程跟踪引用中尚未同步的提交（Commit）；零数量 MUST NOT 占用常驻空间。没有上游（Upstream）跟踪时 MUST 显示明确未跟踪标识，数量不可确定或不可读取时 MUST 分别表达未知或不可读取，MUST NOT 表达为干净。文件数量大于零时 MUST 显示实心文件标识及去重数量，单方面确认无差异时 MAY 省略对应标识；两方面均已确认无差异时 MUST 合并为一个可展开的干净标记。非零上下箭头及数量 MUST 提供同步（Sync）快捷按钮，鼠标点击或键盘聚焦后按回车 MUST 发起该具体工作树（Worktree）的显式同步（Sync）；悬停及可访问名称 MUST 说明同步（Sync）作用与目标，执行中 MUST 防止重复请求。文件状态与干净标记 MUST 保留独立详情入口，鼠标点击或键盘聚焦后按回车 MUST 可查看远程与文件两方面的完整事实（包括零值）；未知及未跟踪状态 MUST 保留真实说明，不以箭头同步（Sync）冒充可用操作。远程状态本身 MUST 表达本机已观察引用，普通查看或刷新 MUST NOT 隐式抓取远程。

来源列表 MUST 优先展示名称及树层级，各工作位置的当前分支（Branch）名称 MUST 紧随来源名称，点击分支（Branch）名称 MUST 打开该具体工作树（Worktree）的既有分支（Branch）管理浮层（Popover），提供检出（Checkout）及切换。分支（Branch）名称 MUST 在名称区域内按可用宽度收缩、省略，完整名称仍 MUST 可按需查看；MUST NOT 侵占或覆盖状态、任务（Task）和末尾操作图标区域。各来源行最右侧 MUST 提供固定宽度、父子来源共用对齐边界的三个点操作菜单（Menu）入口。游离提交（Detached HEAD）使用明确提交（Commit）标识；实际分支（Branch）或完整提交（Commit）标识 MUST 保留在现有按需信息层和阅读标题中。状态与任务（Task）入口 MUST 按实际信息自然占位，没有任务时 MUST NOT 保留空槽；图标尺寸 MUST 一致，远程状态与任务（Task）标识 MUST 明显区分。完整路径 MUST 按需在可移入、选择和复制的悬停层（Hover Card）显示，MUST NOT 固定展开占用来源目录高度。下方未提交变更（Uncommitted Changes）及提交历史（Commit History） MUST NOT 再重复显示代码库（Repository）及分支（Branch）来源栏，当前来源仍 MUST 能由选中行或阅读标题核对。

目录父来源 MUST 使用可辨认的代码库（Repository）图标，折叠展开状态 MUST 可区分；子工作树（Worktree）的图标及名称 MUST 以一致缩进表达父子层级。主来源与子来源的末尾操作入口 MUST 共用右侧对齐边界，MUST NOT 随名称缩进而错位；状态与任务（Task）入口 MUST 紧凑相邻，MUST NOT 为其他行的大数量或空任务预留固定列。来源名称 MUST 在所属层级尽量利用剩余宽度，窄栏下信息较多时 MAY 将该行状态移至名称下方，保留完整数字与名称空间。目录信息层 MUST 以准确任务（Task）标题或真实未关联／未确认状态为首行，第二行 MUST 统一表达“代码库名称 · 工作树 · 工作树名称”，尚未读取的身份 MUST 明示。

#### Scenario: 多个服务引用一个实例
- **WHEN** 多个服务引用相同代码库实例
- **THEN** 清单 MUST 只展示该实例一次，保留其实际身份和目录

#### Scenario: 单库不可读取
- **WHEN** 登记中的一个目录缺失、身份变化或Git状态暂不可读取
- **THEN** 清单 MUST 保留该实例及原因，其他库已读取内容仍可查看，不把错误表达为干净目录

#### Scenario: 同库多个工作树
- **WHEN** 同一登记代码库具有主目录及多个Git关联工作树，包括未登记为Buildr任务的来源
- **THEN** 清单 MUST 在同一代码库下列出全部来源，各自展示实际分支和分层变更
- **AND** 一个工作树不可读取 MUST 只影响该来源，其他来源的变更仍可查看

#### Scenario: 折叠后继续阅读
- **WHEN** 用户打开文件后折叠代码库、工作树或暂存／未暂存分组，再展开或刷新
- **THEN** 系统 MUST 保留仍有效的选择、已打开正文及分组状态，不因折叠改读其他来源

#### Scenario: 跨代码库工作树过滤
- **WHEN** 两个登记代码库（Repository）具有同名工作树（Worktree），用户选择其中一个来源
- **THEN** 未提交变更（Uncommitted Changes）及提交历史（Commit History） MUST 只读取该代码库（Repository）与工作树（Worktree）身份对应的内容
- **AND** 相同显示名称 MUST NOT 聚合阅读范围、替代具体来源标识或形成任务（Task）关联

#### Scenario: 代码库行选择主工作树
- **WHEN** 用户选择代码库（Repository）行，再操作该行前方的折叠图标
- **THEN** 两种阅读模式 MUST 继续使用该主工作树（Main Worktree），图标操作 MUST 只折叠或展开子来源
- **AND** 目录 MUST 没有重复的主工作树（Main Worktree）子行，折叠 MUST 保留有效文件或提交（Commit）阅读

#### Scenario: 未跟踪和未知状态分别表达
- **WHEN** 一个来源没有上游（Upstream）跟踪，另一个来源已有跟踪但提交（Commit）数量不可读取
- **THEN** 两者 MUST 分别显示未跟踪与未知状态，MUST NOT 显示零数量或无差异图标
- **AND** 一个来源的状态失败 MUST NOT 阻止其他来源的数量和阅读

#### Scenario: 两组无差异状态
- **WHEN** 所选来源上游（Upstream）领先与落后数量均为零且未提交文件数量为零
- **THEN** 来源行 MUST 合并为一个可展开的干净标记，完整详情 MUST 分别说明本机与远程没有提交（Commit）差异以及没有未提交文件

#### Scenario: 来源切换统一两种阅读模式
- **WHEN** 用户在任一模式选择另一工作树（Worktree），再切换到另一模式
- **THEN** 两种模式 MUST 都只读取新来源，旧来源的迟到响应 MUST NOT 覆盖当前内容
- **AND** 页面 MUST 明确所选分支（Branch）或游离提交（Detached HEAD），失效来源 MUST 显示局部错误，不静默读取另一个来源

#### Scenario: 来源摘要与按需完整路径
- **WHEN** 用户查看来源目录并悬停来源名称，再移入路径信息层
- **THEN** 来源名称及其后的当前分支（Branch）名称 MUST 在名称区域共同使用剩余身份空间且不保留行末分支（Branch）列，三个点操作入口 MUST 等宽靠右；状态与任务（Task）按实际信息紧凑占位且图标可区分，信息层 MUST 显示真实分支（Branch）或完整提交（Commit）标识并支持复制
- **AND** 完整路径 MUST 可选择和点击复制，下方模式内容 MUST 不重复来源栏，悬停及复制 MUST 不改变所选来源或固定文件阅读
- **AND** 键盘聚焦来源行 MUST 能查看路径；点击来源行 MUST 保留选择动作并立即关闭路径信息层，同次指针停留及延迟悬停 MUST NOT 重新打开并遮挡其他来源或模式操作；离开后再次悬停或键盘重新聚焦 MUST 可以查看，MUST NOT 要求先点击空白；移入信息层及聚焦复制操作 MUST 保持可操作
- **AND** 仅悬停打开而尚未点击时，路径信息层 MUST 位于来源列表右边界之外，用户沿同一文字列向上或向下移动并选择相邻行 MUST 不被遮挡；正常宽度及300px右侧阅读区 MUST 同样成立，信息层 MUST 按实际可用宽度收窄，并跟随尺寸及滚动变化保持此边界

#### Scenario: 树状层级和状态列
- **WHEN** 同一代码库（Repository）展开多个关联工作树（Worktree），包括长名称和窄分屏
- **THEN** 父来源 MUST 使用代码库（Repository）图标，子工作树（Worktree）图标和名称 MUST 向右缩进，当前分支（Branch）名称 MUST 紧随各自来源名称，三个点操作入口 MUST 与父来源等宽并对齐右沿
- **AND** 状态与任务（Task）MUST 自然紧凑占位，选择、折叠和按需完整路径 MUST 保持原行为，MUST NOT 以整行缩进破坏末尾操作入口对齐或使分支（Branch）名称遮挡图标


#### Scenario: 远程箭头同步与文件详情独立
- **WHEN** 来源行同时存在非零上下箭头及未提交文件数量，用户依次悬停并点击两个入口
- **THEN** 箭头及数量 MUST 提供带目标说明的同步（Sync）快捷操作，文件入口 MUST 只打开完整状态详情，MUST NOT 触发同步（Sync）
- **AND** 键盘 MUST 能分别访问两个入口，执行等待中 MUST 防止重复同步（Sync）；没有差异的干净标记 MUST 继续查看详情，三个点 MUST 仍能发现同步（Sync）入口
