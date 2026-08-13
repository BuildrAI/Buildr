## ADDED Requirements

### Requirement: npm Buildr Web Launcher 必须提供显式可恢复 lifecycle
Buildr MUST 只从 formal npm installation 提供 `buildr web launcher install|status|repair|uninstall`。普通 npm install MUST NOT 修改 Applications、Desktop 或 Start Menu；所有 Launcher mutation MUST 由显式命令或同 ownership npm update 后的受限 refresh 触发。

#### Scenario: 显式安装 Launcher
- **WHEN** 用户从 formal npm installation 执行 `buildr web launcher install`
- **THEN** Buildr MUST 原子创建本机 Launcher 与 closed binding，并返回 ownership、target、Host Node、package entry、prefix 与 payload identity
- **AND** target 已由 foreign installation 管理时 MUST fail closed 且不得覆盖

#### Scenario: 查询与修复 Launcher
- **WHEN** 用户执行 `launcher status` 或 `launcher repair`
- **THEN** status MUST 只读返回 `ready|stale|invalid|absent` 与精确诊断，repair MUST 只从当前已验证 npm installation 重建同 ownership binding
- **AND** repair MUST NOT 从 PATH 搜索 Node、npm 或 Buildr，也不得改绑另一个 prefix

#### Scenario: 卸载 Launcher
- **WHEN** 用户执行 `launcher uninstall`
- **THEN** Buildr MUST 只删除 binding 与 target ownership identity 精确匹配的 `.app` 或 shortcut
- **AND** MUST 保留 npm package、Workspace Registry、SQLite、日志、Workspace data 与 Agent runtime

### Requirement: npm 用户必须能够启动和退出本机 Buildr Web
普通 npm 用户 MUST 能通过 `buildr web` 或显式安装的 `Buildr Web` Launcher 启动同一 npm Buildr Web Runtime，并 MUST 能通过公开退出动作停止实例。图形 Launcher MUST 只执行其 binding 记录的 Host Node + package entry + `web`；当前产品 MUST NOT 要求或声称存在平台 installer、Product Node 或 SEA。

#### Scenario: 命令行启动
- **WHEN** 用户从 npm installation 执行 `buildr web`
- **THEN** Buildr MUST 启动或复用本机单实例 HTTP runtime，并在 ready 后按选项打开浏览器
- **AND** 非 Web CLI MUST NOT 启动 HTTP 服务

#### Scenario: 图形入口启动
- **WHEN** 用户点击已验证的 `Buildr Web` 本机 Launcher
- **THEN** wrapper MUST 使用绝对 Host Node 与 package entry 执行 `web --launcher-binding <binding>`，由同一Buildr runtime等待health/readiness并打开浏览器
- **AND** MUST NOT 启动第二份 Buildr、复制 runtime、使用 shell PATH 或嵌入桌面 WebView

#### Scenario: binding 已漂移
- **WHEN** Launcher 记录的 Node、entry、package root、prefix、payload 或 ownership identity 与当前文件事实不符
- **THEN** Launcher MUST fail closed、写入可诊断日志并提示 `buildr web launcher repair`
- **AND** MUST NOT 尝试 PATH 中的另一个 `buildr`

### Requirement: npm Launcher 必须暴露可诊断身份和失败反馈
Buildr MUST 让 Launcher status 展示 channel、Buildr version、Host Node version/executable identity、package entry、npm prefix、protocol/payload identity、ownership identity与target，并让图形启动失败在平台可见输出中提示status/repair动作。输出 MUST 不泄露 token、完整环境变量或 Workspace secret。

#### Scenario: Launcher ready
- **WHEN** binding、target、Host Node、entry 与 formal npm origin 全部匹配
- **THEN** `launcher status --json` MUST 报告 `ready` 和稳定 closed identity fields
- **AND** CLI version、Web health 与 Launcher binding MUST 报告相同 Buildr/protocol/payload/installation identity

#### Scenario: 图形启动失败
- **WHEN** Host Node 不兼容、entry 不存在、payload 漂移或 Web readiness 失败
- **THEN** wrapper MUST 给出用户可见的简短失败反馈、日志位置和 repair/retry 动作
- **AND** MUST NOT 静默启动未知安装或暴露敏感参数

### Requirement: development 与 npm Launcher 必须安全独立更新
Development launcher MUST 继续以 checkout-backed `Buildr Web Dev` 独立存在，并 MUST 与 npm-owned `Buildr Web` 使用不同名称、binding schema、target 与 ownership identity。两者都 MUST 是无 Node/源码复制的薄投射。

#### Scenario: 重建 development launcher
- **WHEN** 当前 checkout identity 改变并执行 canonical development launcher 更新
- **THEN** Buildr MUST 在 staging 验证 checkout、development Host Node、entry 与 Web readiness 后原子替换 `Buildr Web Dev`
- **AND** MUST NOT 修改 npm-owned Launcher

#### Scenario: npm Launcher 更新
- **WHEN** npm package update 刷新已存在 Launcher
- **THEN** Buildr MUST 只刷新同 ownership npm binding
- **AND** MUST NOT 修改 development checkout、runtime 或 `Buildr Web Dev`

### Requirement: npm Launcher 卸载必须保留用户工作资产
Launcher uninstall MUST 只移除 Launcher target、binding、owned shortcut metadata 与 Launcher 自身日志索引，并 MUST 保留 npm installation 与全部 Workspace/Agent/user data。

#### Scenario: npm Launcher 卸载
- **WHEN** matching npm installation 执行 `buildr web launcher uninstall`
- **THEN** Buildr MUST 删除其拥有的 `Buildr Web.app` 或 Start Menu shortcut 与 binding
- **AND** npm package、Workspace Registry、Workspace SQLite、Workspace assets、Agent runtime 与日志内容 MUST 保留

#### Scenario: ownership 无法证明
- **WHEN** target 或 binding 缺失、损坏或属于另一 installation
- **THEN** uninstall MUST fail closed 并列出未删除的精确 target
- **AND** MUST NOT 递归清理 Applications、Start Menu、npm prefix 或 user data root

### Requirement: 旧 Launcher 入口必须由 closed ownership 控制
新 npm Launcher install/repair MUST NOT 自动接管旧 development、SEA、平台 installer或foreign wrapper。只有当前closed npm Launcher binding与同installation slot ownership精确匹配时才能原子刷新；其他旧入口 MUST 原样保留并要求用户决定。

#### Scenario: 刷新现有 npm wrapper
- **WHEN** install或npm update发现现有入口持有当前schema且绑定同一 npm package root/prefix installation slot
- **THEN** Buildr MUST 先验证新binding与wrapper结构，再原子替换现有投射
- **AND** MUST NOT复制旧Node、源码或runtime到新Launcher

#### Scenario: 发现平台或 foreign 入口
- **WHEN** target 由旧平台 installer、legacy无closed binding入口、其他 npm prefix、development channel 或外部应用拥有
- **THEN** install/repair MUST fail closed 并报告冲突 ownership
- **AND** MUST NOT 删除、覆盖或重新签名该入口

### Requirement: Buildr 当前必须只通过 npm 提供完整 Web
Buildr 当前 MUST NOT 提供或宣传平台安装。完整 Buildr Web MUST 由 npm package 提供；图形 Launcher 只作为 npm installation 的显式本机投射，并 MUST 在缺少兼容 Host Node 或 formal npm origin 时拒绝安装。

#### Scenario: 普通 npm 安装
- **WHEN** 用户完成 `npm install -g @buildr-ai/buildr`
- **THEN** 完整 CLI 与 `buildr web` MUST 可用
- **AND** 系统 MUST NOT 自动生成 `.app`、Start Menu shortcut、SEA、PKG/MSI 或登录启动项

#### Scenario: 请求无需 Node 的平台安装
- **WHEN** 用户请求当前不支持的 self-contained 平台安装
- **THEN** 文档与诊断 MUST 明确当前正式渠道需要兼容 Node/npm
- **AND** MUST NOT 提供未验证的下载链接、unsigned installer 或隐藏 SEA fallback

### Requirement: npm Buildr Web runtime 必须只按显式 web 命令启动
npm Buildr Web HTTP/runtime MUST 只在图形 Launcher 或用户显式执行 `buildr web` 时启动。`buildr --help`、version、Doctor、status、Task 与其他普通 CLI 命令 MUST NOT 启动、探测复用或遗留 HTTP listener，除非公开契约明确要求访问现有 Web instance。

#### Scenario: 图形入口启动 Web
- **WHEN** 用户打开 npm-owned `Buildr Web` Launcher
- **THEN** wrapper MUST 通过 binding 执行同一 npm package 的 `web` command 并等待 health/readiness 后打开浏览器
- **AND** MUST NOT 启动第二份 runtime executable 或桌面 WebView

#### Scenario: 普通 CLI 不启动服务
- **WHEN** 用户在无现有实例的环境执行 `buildr --help` 或代表性非 Web CLI
- **THEN** 命令 MUST 正常完成且没有 Buildr HTTP listener 或后台 server process
- **AND** 退出后 MUST 不留下 Web instance identity、port receipt 或 launcher-owned process

## REMOVED Requirements

### Requirement: 普通用户必须能够启动和退出本机 Web 应用
**Reason**: 旧要求没有明确当前只支持 npm 用户和 Host Node。
**Migration**: 使用新增的 npm Buildr Web 启停要求。

#### Scenario: 迁移到 npm Web 入口
- **WHEN** 用户启动 Buildr Web
- **THEN** MUST 使用 npm CLI 或 npm-owned Launcher

### Requirement: Launcher 必须暴露可诊断的运行身份和失败反馈
**Reason**: 当前 Launcher 是 npm installation 的本机投射，不是独立平台产品。
**Migration**: 使用新增的 npm Launcher identity 与反馈要求。

#### Scenario: 迁移到 npm Launcher 诊断
- **WHEN** Launcher 启动或 status 检测失败
- **THEN** MUST 报告绑定的 npm installation identity 与恢复动作

### Requirement: 开发 launcher 必须支持安全的重复构建和本机更新
**Reason**: development 与 npm Launcher 现在必须显式隔离 ownership。
**Migration**: 使用新增的双 Launcher 独立更新要求。

#### Scenario: 隔离两类 Launcher
- **WHEN** development 或 npm Launcher 更新
- **THEN** MUST NOT 修改另一 channel 的 target 或 binding

### Requirement: Launcher 卸载必须保留用户工作资产
**Reason**: 当前卸载对象是 npm-owned Launcher，不是平台产品单元。
**Migration**: 使用新增的 npm Launcher 卸载要求。

#### Scenario: 卸载本机投射
- **WHEN** 用户卸载 npm-owned Launcher
- **THEN** MUST 保留 npm package 与 Workspace/user data

### Requirement: Buildr Web Launcher 必须受控迁移 Buildr-owned 旧入口
**Reason**: 当前不会自动迁移旧平台或无 closed binding 的入口。
**Migration**: 只允许同 schema、同 npm installation slot 的原子刷新。

#### Scenario: 拒绝自动迁移旧入口
- **WHEN** 旧入口没有 matching closed npm binding
- **THEN** install/repair MUST fail closed 且不得接管

### Requirement: 平台安装必须提供完整且可解释的 Buildr Web
**Reason**: 当前不提供平台安装，完整 Web 由 npm package 承载。
**Migration**: 使用新增的 npm-only Buildr Web 要求。

#### Scenario: 移除平台 Web 安装
- **WHEN** 用户安装正式 Buildr
- **THEN** MUST 通过 npm package 获得完整 CLI 与 Web

### Requirement: 平台 HTTP runtime 必须只按显式 web 命令启动
**Reason**: 当前 HTTP runtime 属于 npm Buildr，而非平台安装。
**Migration**: 使用新增的 npm Web 显式启动要求。

#### Scenario: npm Web 显式启动
- **WHEN** 用户没有执行 `buildr web` 或打开 owned Launcher
- **THEN** Buildr MUST NOT 启动 HTTP runtime
