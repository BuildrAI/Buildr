## MODIFIED Requirements

### Requirement: Buildr Web 必须以单实例本机 Web 服务运行
Buildr MUST为npm/released与development各启动或复用一个只监听loopback的channel-scoped本机Web服务，并 MUST在服务就绪后按调用选项打开默认浏览器。同一channel内 MUST保持单实例；不同channel MUST拥有独立Data Root、instance、启动锁和Workspace registry，且 MUST允许同时运行。

#### Scenario: 首次启动 App
- **WHEN** 当前用户在目标channel没有健康的Buildr Web实例
- **THEN** `buildr web` MUST在该channel Root启动一个实例、记录可验证runtime state并打开默认浏览器
- **AND** MUST NOT复用或清理另一channel实例

#### Scenario: 重复启动 App
- **WHEN** 当前channel已经存在通过Buildr health handshake且profile匹配的实例
- **THEN** 启动入口 MUST复用已有实例并重新打开浏览器
- **AND** MUST NOT再启动同channel的第二个server

#### Scenario: 另一channel已有健康实例
- **WHEN** released与development中的另一channel已有协议兼容的健康实例
- **THEN** 当前channel MUST忽略该实例并在自己的Root启动或复用实例
- **AND** MUST返回不同PID和loopback URL

#### Scenario: 恢复陈旧实例状态
- **WHEN** 当前channel runtime state指向不存在、无法通过带实例secret的health handshake或profile不匹配的进程
- **THEN** Buildr MUST只在ownership可证明时安全替换当前channel陈旧状态并启动新实例
- **AND** MUST保留当前channel Workspace登记列表及另一channel全部状态

#### Scenario: 开发环境不打开浏览器
- **WHEN** 调用方使用`buildr web --no-open`
- **THEN** Buildr MUST启动或复用matching channel实例但 MUST NOT打开浏览器

#### Scenario: 兼容指定 Workspace 启动
- **WHEN** 调用方使用`buildr web --target <workspace>`
- **THEN** Buildr MUST先通过channel management fence验证并登记该Workspace，再启动或复用matching channel实例并打开其Workspace route
- **AND** 冲突时 MUST在任何Workspace SQLite打开或migration之前失败

### Requirement: development 与 npm Launcher 必须安全独立更新
Development launcher MUST继续以checkout-backed `Buildr Web Dev`独立存在，并 MUST与npm-owned `Buildr Web`使用不同名称、binding schema、target、ownership identity和默认Web Data Root。两者都 MUST是无Node/源码复制的薄投射，且 Launcher安装、更新、停止与重启 MUST只作用于matching channel实例。

#### Scenario: 重建 development launcher
- **WHEN** 当前checkout identity改变并执行canonical development launcher更新
- **THEN** Buildr MUST在staging验证checkout、development Host Node、entry、development profile与Web readiness后原子替换`Buildr Web Dev`
- **AND** MUST NOT修改npm-owned Launcher、released instance或released Workspace registry

#### Scenario: npm Launcher 更新
- **WHEN** npm package update刷新已存在Launcher
- **THEN** Buildr MUST只刷新同ownership npm binding并继续使用released默认Root
- **AND** MUST NOT修改development checkout、runtime、`Buildr Web Dev`或development instance
