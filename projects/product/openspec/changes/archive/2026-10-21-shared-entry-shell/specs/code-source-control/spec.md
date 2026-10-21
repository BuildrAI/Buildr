## MODIFIED Requirements

### Requirement: 代码导航与独立操作入口

代码区域导航 MUST 按源代码管理（Source Control）、资源管理器（Explorer）的顺序展示，导航选中与页面恢复 MUST 保持实际路径语义。顶部“代码”主导航 MUST 优先恢复当前工作空间（Workspace）上次有效的代码页签；没有有效代码页签时 MUST 进入源代码管理（Source Control），未指定子页的代码区域入口 MUST 使用相同兜底目标，MUST NOT 把找不到的旧位置替换成其他代码库或文件；明确指向文件、任务（Task）或原阅读现场的入口与返回 MUST 保持自身实际目标。

具体工作树（Worktree）的操作菜单（Menu） MUST 提供同步（Sync）及单库获取远程（Fetch），目录标题的操作菜单（Menu） MUST 提供全部获取远程（Fetch）；各入口 MUST 有可访问名称与键盘操作。点击分支（Branch）名称或操作菜单（Menu） MUST NOT 意外改变当前阅读来源、触发行选择或展开折叠；只读刷新 MUST 继续独立提供且不触发 Git 写入。

#### Scenario: 导航与来源行的独立动作
- **WHEN** 用户进入代码区域，点击来源名称后的分支（Branch），然后打开同一来源行末的三个点
- **THEN** 源代码管理（Source Control） MUST 位于资源管理器（Explorer）之前；分支（Branch）名称 MUST 打开原分支（Branch）管理浮层（Popover），三个点 MUST 打开该来源的操作菜单（Menu）
- **AND** 当前阅读来源、固定文件及折叠状态 MUST 保持；可见入口 MUST 可点击且不被长名称或窄栏遮挡，按密度规则收起的快捷入口 MUST 仍由该来源三个点菜单（Menu）访问，并保持准确来源及原选择

#### Scenario: 从任意区域点击代码
- **WHEN** 用户上次查看资源管理器（Explorer），之后从其他区域或资源管理器（Explorer）再次点击顶部“代码”
- **THEN** 页面 MUST 恢复该工作空间上次有效的代码页签；上次位置已不可恢复时 MUST 进入当前工作空间的源代码管理（Source Control），其默认导航选中 MUST 对应真实目标路径
- **AND** 显式文件定位及返回任务（Task）或源代码管理（Source Control）的动作 MUST 保持原有目标与有效阅读现场
