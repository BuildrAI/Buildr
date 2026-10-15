## Why

用户在代码区域执行同步（Sync）和获取远程（Fetch）时持续失败，结果常驻占用源代码管理（Source Control）目录空间；资源管理器（Explorer）默认展开全部根目录并为路径另占一行，降低多代码库（Repository）浏览效率。初始 Git 进程强制设置 `GIT_CONFIG_NOSYSTEM=1`，屏蔽了本机系统配置中的凭证助手（Credential Helper）；已在用户现场通过只读远端观察确认恢复系统配置后认证成功。页面还需优先保留完整来源名称，并让正常远程操作静默，以减少浏览时的遮挡和干扰。

## What Changes

- 点击顶部“代码”导航时默认进入源代码管理（Source Control），不再记忆上次资源管理器（Explorer）页面；显式文件定位和返回入口继续使用自身目标。
- 全部正常的同步（Sync）及单库、批量获取远程（Fetch）静默完成；仅异常或部分失败使用约 6 秒驻留、悬停暂停且可关闭的通知浮窗（Notification），以清楚边框与背景沿用主题，保留真实逐库与逐阶段详情，不再占用代码库（Repository）目录的常驻空间。
- 来源行先保留完整代码库（Repository）或工作树（Worktree）名称，再显示分支（Branch）；宽度不足时先用剩余空间渐进缩短分支（Branch）并显示省略号，低于可辨认的最小宽度时才隐藏整段分支（Branch），随后收起后部快捷图标，最后才省略来源名称。三个点菜单（Menu）始终可达，检出（Checkout）／切换分支（Branch）、打开已核实关联任务（Task）及原有快捷能力均可从该来源菜单（Menu）使用。
- 普通打开或重新进入资源管理器（Explorer）时默认折叠所有代码库（Repository）根与文件夹；显式文件定位只展开该文件所在根和父目录，同文件再次定位也生效。
- 资源管理器（Explorer）的代码库（Repository）根只常驻名称，完整查看路径改在可移入、选择和复制的悬停层（Hover Card）提供。
- Git 观察与写执行保留本机有效系统、用户及代码库（Repository）配置，尊重调用环境明确选择的配置文件及系统配置禁用，不硬编码平台凭证助手（Credential Helper），继续清理外部 Git 定位和配置注入变量、禁用交互式认证、隐式获取和无关副作用，并保留现有身份、配置漂移及写入安全检查。
- 不包含破坏性接口变更；不修改用户凭证、Git 配置或业务代码库（Repository）的工作内容，不增加自动同步（Sync）或自动重试。
- 检查获取远程（Fetch）和同步（Sync）的执行链及实际耗时，区分网络、认证、重复本机读取及完成刷新；对确认的无效重复读取做必要优化，继续在真实写入前后核对来源、配置和工作内容版本，不以陈旧缓存替代安全观察。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `code-source-control`：明确顶部代码入口默认进入源代码管理（Source Control），规定来源名称优先、逐级收起及菜单（Menu）保留快捷能力的语义。
- `repository-file-explorer`：规定普通入口默认折叠、显式定位局部展开以及根路径按需可复制展示。
- `code-remote-fetch`：规定正常结果静默、异常短时逐库通知浮窗（Notification）及有效本机 Git 配置的一致观察和执行。
- `code-worktree-sync`：规定正常结果静默、异常短时逐阶段通知浮窗（Notification）及同步（Sync）观察、阶段执行使用一致配置。

## Impact

- Buildr Web 前端（Frontend）：`services/buildr-web/src/app/AppLayout.tsx`，`src/features/code/` 的源代码管理（Source Control）页面、获取与同步钩子（Hook）、结果组件（Component），以及共享 `RepositoryFileBrowser.tsx` 的资源管理器（Explorer）目录交互；复用 Ant Design 现有通知和浮层（Popover）能力。
- Buildr 后端（Backend）：`services/buildr/src/modules/code/infrastructure/` 的 Git 观察与写进程环境装配，以及相关配置观察来源；网页接口（API）结构及写入授权保持兼容。
- 验证包含系统配置中的测试凭证助手（Credential Helper）、只读观察与写执行的一致配置、已存在的获取及同步（Sync）安全回归，以及浏览器（Browser）中的导航、目录折叠、路径选择复制与通知生命周期。
- macOS 用户现场的只读认证已确认；Windows 使用相同跨平台配置原则，本次不将自动化验证冒充 Windows 实机认证验证。
