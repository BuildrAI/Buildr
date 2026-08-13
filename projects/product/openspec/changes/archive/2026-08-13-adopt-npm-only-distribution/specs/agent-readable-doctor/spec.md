## ADDED Requirements

### Requirement: Doctor 与 status 必须投影 npm 安装、Launcher 与运行时身份
Doctor 与 installation/Launcher status MUST 从 formal npm installation registry、development identity、Launcher bindings 与当前 instance receipt 分别投影 npm、development、当前运行实例和本地图形 Launcher。每项 MUST 显示版本、路径、runtime role/source、protocol、payload 与 ownership identity；不得扫描 PATH、根据文件名猜来源或报告当前不存在的 platform channel。

#### Scenario: npm 与 development 并存
- **WHEN** 同一用户登记了 npm installation、npm-owned Launcher 与 development launcher
- **THEN** Doctor/status MUST 分别展示 npm package/prefix/Host Node、npm Launcher binding、development checkout/runtime 与当前 instance
- **AND** 版本相同 MUST NOT 合并 installation 或 ownership lifecycle

#### Scenario: Launcher binding 漂移
- **WHEN** binding 的 Host Node、entry、package root、prefix、payload 或 ownership receipt 与文件事实不符
- **THEN** Doctor/status MUST 将 Launcher 标记为 stale 或 invalid 并提供 `launcher repair|uninstall` 下一步
- **AND** MUST NOT 用 PATH 中可运行的另一个 Buildr 将状态修正为 ready

#### Scenario: 当前 Web instance
- **WHEN** current instance receipt 指向 canonical loopback 并能通过 secret-protected health probe
- **THEN** status MUST 展示 readiness、PID、npm/development channel、Host/development runtime 与完整 product identity
- **AND** MUST NOT 泄露 instance secret

## REMOVED Requirements

### Requirement: Doctor 与 status 必须分别投影所有 Buildr channel
**Reason**: 当前正式渠道已收敛为 npm，platform channel 不再是可报告的当前产品事实。

**Migration**: 使用新增的 npm installation、Launcher、development 与 current instance 投影；未来平台渠道必须通过新的 Change 重新加入。

#### Scenario: 移除 platform channel 投影
- **WHEN** Doctor/status 构建当前 installation inventory
- **THEN** MUST 只投影 npm、development、Launcher 与 current instance
