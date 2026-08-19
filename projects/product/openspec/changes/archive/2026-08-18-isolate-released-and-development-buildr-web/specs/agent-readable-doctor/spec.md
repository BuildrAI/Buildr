## MODIFIED Requirements

### Requirement: Doctor 与 status 必须投影 npm 安装、Launcher 与运行时身份
Doctor 与 installation/Launcher status MUST从formal npm installation registry、development identity、Launcher bindings及released/development各自instance receipt分别投影npm安装、development安装、两种当前普通Web实例和本地图形Launcher。每项 MUST显示版本、路径、runtime role/source、protocol、payload、ownership identity与适用Web Data Root；不得扫描PATH、根据文件名或Root名字猜来源，也不得把另一channel instance合并为current。

#### Scenario: npm 与 development 并存
- **WHEN** 同一用户登记了npm installation、npm-owned Launcher、development launcher且两种普通Web实例都健康
- **THEN** Doctor/status MUST分别展示npm package/prefix/Host Node、npm Launcher binding、development checkout/runtime，以及released与development实例的不同PID、URL和Data Root
- **AND** 版本或protocol相同 MUST NOT合并installation、instance或ownership lifecycle

#### Scenario: Launcher binding 漂移
- **WHEN** binding的Host Node、entry、package root、prefix、payload、channel/runtime role或ownership receipt与文件/产品事实不符
- **THEN** Doctor/status MUST将Launcher标记为stale或invalid并提供matching repair/uninstall下一步
- **AND** MUST NOT用PATH中可运行的另一个Buildr或另一channel实例将状态修正为ready

#### Scenario: 当前 Web instance
- **WHEN** released或development instance receipt指向canonical loopback并能通过secret-protected health probe
- **THEN** status MUST在对应channel下展示readiness、PID、Data Root、npm/development channel、Host/development runtime与完整product identity
- **AND** MUST NOT泄露instance secret或把该实例报告到另一channel

#### Scenario: Workspace管理冲突
- **WHEN** Doctor观察到同一canonical real root或Workspace UUID同时出现在两种registry，或Workspace-local manager与当前channel冲突
- **THEN** Doctor MUST在不打开Workspace SQLite的情况下报告路径、当前channel、冲突channel和损坏/冲突authority
- **AND** repair plan MUST建议使用隔离副本或从错误registry移除，不能建议force、SQLite降级或静默ownership转移
