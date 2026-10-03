## MODIFIED Requirements

### Requirement: 全部代码库真实清单

源代码管理 MUST 展示当前工作空间全部已登记代码库实例，每个稳定身份只列一次，不按服务数量或远端地址归并。清单 MUST 表达已观察目录、当前分支或游离提交、按路径去重的未提交文件数、可得的本机上游领先／落后数、读取时间及局部诊断；未知数量 MUST NOT 表达为零或“已同步”。普通入口 MUST NOT 自动限定任务范围。

每个代码库 MUST 展示Git实际登记的主目录及全部关联工作树（Worktree），分别表达真实分支、目录、分层变更和观察版本，不因没有Buildr任务登记而遗漏。工作树计数 MUST 在本来源内按路径去重，代码库汇总 MUST 保留不同工作树的同名路径。代码库、工作树和比较层 MUST 可折叠展开，折叠 MUST NOT 清除仍有效的文件选择或已打开正文。

代码库（Repository）行 MUST 同时代表其主工作树（Main Worktree），选择该行即选择该真实来源，不再重复显示主工作树（Main Worktree）子行；行前图标 MUST 独立控制关联工作树（Worktree）的折叠展开。整个代码库（Repository）目录区域的头部 MUST 支持折叠展开。页面 MUST 使用一个当前具体来源同步控制未提交变更（Uncommitted Changes）和提交历史（Commit History），两种模式 MUST NOT 再提供独立的代码库（Repository）、工作树（Worktree）或分支（Branch）过滤入口。目录清单仍展示全部已登记实例和可发现来源，任务（Task）预选不得隐藏无关来源。

每个来源行右侧 MUST 分列远程状态与未提交文件状态。上游（Upstream）数量已知且存在差异时 MUST 分别用向上箭头及数量表达未推送提交（Commit）、向下箭头及数量表达本机远程跟踪引用中尚未同步的提交（Commit）；没有上游（Upstream）跟踪时 MUST 显示明确未跟踪标识，数量不可确定时 MUST 显示未知标识。文件数量大于零时 MUST 显示去重后的数量，确认无变更时 MUST 显示干净标识。两方面均无差异时 MUST 使用两个可区分的无差异图标，不能用一个总标记代替；各状态 MUST 提供可理解的可访问名称和按需说明，并保持行内对齐。远程状态 MUST 表达本机已观察引用，不隐式抓取远程。

来源列表 MUST 以名称及状态展示各真实来源，MUST NOT 常驻分支（Branch）或游离提交（Detached HEAD）摘要列；实际分支（Branch）或完整提交（Commit）标识 MUST 保留在现有按需信息层和阅读标题中；右侧远程、文件及任务（Task）列 MUST 使用一致的图标尺寸和固定对齐，远程跟踪图标与任务（Task）标识 MUST 明显区分。完整路径 MUST 按需在可移入、选择和复制的悬停层（Hover Card）显示，MUST NOT 固定展开占用来源目录高度。下方未提交变更（Uncommitted Changes）及提交历史（Commit History） MUST NOT 再重复显示代码库（Repository）及分支（Branch）来源栏，当前来源仍 MUST 能由选中行或阅读标题核对。

目录主来源及子来源 MUST 共用图标、来源身份、远程、文件及任务（Task）列的对齐边界；来源名称 MUST 使用统一身份栏并利用分支（Branch）列释放的宽度，远程和文件列 MUST 按目录已观察数字统一宽度，数量与无差异标识混排 MUST 保持紧凑对齐。有未提交文件 MUST 使用实心文件标识及数量，确认无变更 MUST 使用轮廓文件标识，未知 MUST 保留独立表达，MUST NOT 反转图标含义。目录信息层 MUST 以准确任务（Task）标题或真实未关联／未确认状态为首行，第二行 MUST 统一表达“代码库名称 · 工作树 · 工作树名称”，尚未读取的身份 MUST 明示。

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
- **THEN** 来源行 MUST 使用两个可区分的标识，分别说明本机与远程没有提交（Commit）差异以及没有未提交文件

#### Scenario: 来源切换统一两种阅读模式
- **WHEN** 用户在任一模式选择另一工作树（Worktree），再切换到另一模式
- **THEN** 两种模式 MUST 都只读取新来源，旧来源的迟到响应 MUST NOT 覆盖当前内容
- **AND** 页面 MUST 明确所选分支（Branch）或游离提交（Detached HEAD），失效来源 MUST 显示局部错误，不静默读取另一个来源

#### Scenario: 来源摘要与按需完整路径
- **WHEN** 用户查看来源目录并悬停来源名称，再移入路径信息层
- **THEN** 来源名称 MUST 使用统一身份栏且没有常驻分支（Branch）列，远程、文件及任务（Task）列 MUST 对齐且图标可区分；信息层 MUST 显示真实分支（Branch）或完整提交（Commit）标识并支持复制
- **AND** 完整路径 MUST 可选择和点击复制，下方模式内容 MUST 不重复来源栏，悬停及复制 MUST 不改变所选来源或固定文件阅读
- **AND** 键盘聚焦来源行 MUST 能查看路径；点击来源行 MUST 保留选择动作并立即关闭路径信息层，同次指针停留及延迟悬停 MUST NOT 重新打开并遮挡其他来源或模式操作；离开后再次悬停或键盘重新聚焦 MUST 可以查看，MUST NOT 要求先点击空白；移入信息层及聚焦复制操作 MUST 保持可操作
- **AND** 仅悬停打开而尚未点击时，路径信息层 MUST 位于来源列表右边界之外，用户沿同一文字列向上或向下移动并选择相邻行 MUST 不被遮挡；正常宽度及300px右侧阅读区 MUST 同样成立，信息层 MUST 按实际可用宽度收窄，并跟随尺寸及滚动变化保持此边界

### Requirement: 本机历史与固定提交

系统 MUST 按所选代码库（Repository）与工作树（Worktree）的当前分支（Branch）读取本机可达提交历史（Commit History），游离提交（Detached HEAD） MUST 使用该来源的当前完整提交（Commit）标识作为范围；页面 MUST 保留关键词查找和有限读取范围说明，不因移除独立过滤而退回全库全部引用。分支（Branch）范围 MUST 按其可达提交（Commit）确定，不能只匹配指向分支（Branch）尖端的标签，也不能按任务（Task）尾注排除共享祖先提交（Commit）。显式命令行接口（CLI）与网页接口（API）的已有本机分支（Branch）参数 MUST 继续兼容。提交 MUST 包含完整标识、说明、作者与时间及可得引用；选择提交后 MUST 按需读取其文件和明确比较基线，合并提交首版使用第一父提交。历史文件和差异 MUST 固定到完整提交标识；缺失对象 MUST 明示，不静默改读当前版本。

网页关键词 MUST 去除两端空白，至少两个非空白Unicode字符时才执行搜索；单字符输入 MUST 显示门槛说明并回到当前来源的未过滤历史，不继续显示旧关键词匹配结果。清除搜索 MUST 恢复当前来源历史；命令行接口（CLI）和网页接口（API） MUST 仍兼容明确的单字符查询。搜索目标 MUST 与可搜索字段一致，不承诺无法实际匹配的任务（Task）名称。

用户点击提交（Commit）行 MUST 就地展开或折叠该提交（Commit）的变更文件；首次展开 MUST 按需读取并表达加载、错误、截断或无文件状态。点击展开后的文件 MUST 使用与未提交文件相同的差异（Diff）阅读和完整文件入口；折叠提交（Commit） MUST 保留仍有效的已打开文件及固定版本，不把文件改读为当前磁盘内容。

历史列表 MUST 以简洁标题展示记录，MUST NOT 常驻短提交标识和时间列；完整提交（Commit）标识及时间 MUST 在悬停或键盘聚焦的摘要和选中后的右侧正式详情中可读取，引用与任务（Task）关联 MUST 以图标和可访问摘要按需表达，MUST NOT 常驻多行引用标签及完整任务（Task）名称。首次选择或改选不同提交（Commit） MUST 在右侧显示该记录的正式详情，并独立管理该行文件展开；各行 MUST 允许同时展开。点击文件后，折叠同一提交（Commit） MUST 保留仍有效的文件差异（Diff），改选不同提交（Commit） MUST 切换到新提交（Commit）详情。

#### Scenario: 分支包含祖先提交
- **WHEN** 用户选择一个本机分支
- **THEN** 历史 MUST 包含其读取范围内的祖先提交，不仅列出带该分支名的尖端提交

#### Scenario: 合并或根提交
- **WHEN** 用户选择合并提交或无父提交的根提交
- **THEN** 系统 MUST 返回适用的文件变化及可解释比较基线，不能因无普通父提交而显示假空历史

#### Scenario: 其他分支提交不混入当前历史
- **WHEN** 同一代码库（Repository）的另一个分支（Branch）包含当前所选工作树（Worktree）不可达的独有提交（Commit）
- **THEN** 当前历史 MUST 不包含该独有提交（Commit），切换来源后 MUST 按新的可达范围更新

#### Scenario: 游离来源与空历史
- **WHEN** 用户选择游离提交（Detached HEAD）的工作树（Worktree）或尚无提交（Commit）的来源
- **THEN** 前者 MUST 展示其当前完整提交（Commit）标识及可达祖先，后者 MUST 明确显示空历史
- **AND** 两者 MUST NOT 回退到其他本机分支（Branch）的历史

#### Scenario: 两字符搜索门槛与清除
- **WHEN** 用户将历史关键词从两个字符改为单字符或清空
- **THEN** 系统 MUST 不执行单字符网页搜索，恢复当前来源未过滤历史；单字符时 MUST 提示最小输入长度
- **AND** 来源身份、已打开的固定文件以及命令行接口（CLI）和网页接口（API）显式短查询兼容性 MUST 保持

#### Scenario: 展开提交并阅读变更文件
- **WHEN** 用户点击一个提交（Commit），再点击展开后的变更文件，随后折叠该提交（Commit）
- **THEN** 文件清单 MUST 在该提交（Commit）行下展开，右侧 MUST 按其完整提交（Commit）标识和比较基线阅读差异（Diff）
- **AND** 折叠 MUST 只隐藏文件清单，不清除仍有效的阅读或改读其他版本

#### Scenario: 简洁历史与正式详情切换
- **WHEN** 用户悬停历史记录，再点击该提交（Commit），随后选择文件并改选另一个提交（Commit）
- **THEN** 列表 MUST 保持标题及引用、任务（Task）和展开操作，没有常驻短提交标识和时间列；悬停层（Hover Card） MUST 提供完整提交（Commit）标识和时间等可选择复制的轻量信息；点击记录 MUST 展示其右侧正式详情及按需文件清单
- **AND** 文件 MUST 使用固定版本差异（Diff），改选提交（Commit） MUST 展示新记录详情，其他已展开行及仍有效的固定文件状态 MUST 保留
- **AND** 标题相同的记录 MUST 继续按完整提交（Commit）身份分别选择与展开，MUST NOT 按标题归并或改读另一记录
