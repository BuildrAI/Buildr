## ADDED Requirements

### Requirement: 显式请求可替换来源不匹配的开发实例
`buildr web` SHALL 提供显式的 development 实例替换请求（`--replace-mismatched-development`）。仅 development profile 接受该请求；npm/released profile、npm Launcher binding 或更新交接 MUST NOT 接受该请求并失败关闭。来源匹配的健康 development 实例 MUST 正常复用，不执行替换。来源不匹配或缺少来源证明的健康 development 实例 MUST 在取得启动锁后复用既有认证退出、有界等待与实例记录清理，再按当前产品身份启动新实例；过程 MUST NOT 终止进程（kill）、MUST NOT 无界等待、MUST NOT 在未确认旧实例退出前启动新实例。

#### Scenario: 来源不匹配时替换旧实例
- **WHEN** 健康 development 实例的开发来源内容与当前来源不匹配，且调用方显式请求替换
- **THEN** Web 生命周期 MUST 在启动锁内请求旧实例认证退出、有界等待其 receipt 移除，再启动并写入新实例 receipt
- **AND** 新实例 health 身份 MUST 证明属于当前开发来源后才返回成功

#### Scenario: 退出失败或等待超时
- **WHEN** 旧实例拒绝认证退出、有界等待内未退出，或等待期间实例 receipt 被其他实例替换
- **THEN** 启动 MUST 保留现场并返回明确诊断
- **AND** MUST NOT 启动第二个实例或接管后来出现的实例

#### Scenario: 来源已匹配或实例不可用
- **WHEN** 当前实例匹配当前开发来源，或没有可证明健康的不匹配实例
- **THEN** 前者 MUST 正常复用不重启；后者 MUST 按既有 absent/stale/unreachable 路径处理

#### Scenario: 非 development 或组合冲突
- **WHEN** npm/released profile、Launcher binding、更新交接或不兼容选项携带替换请求
- **THEN** 启动 MUST 明确拒绝并不执行任何实例替换

### Requirement: development 实例替换不改变既有生命周期语义
实例替换 MUST 复用默认实例既有的启动锁、实例 receipt schema、健康探测、端口策略、maintenance 与信号退出语义；MUST NOT 引入第二套实例记录、绕过启动锁或跳过 Workspace 登记。

#### Scenario: 替换后的默认实例语义
- **WHEN** development 实例完成替换并写入新 receipt
- **THEN** 新实例的 registry 写入、浏览器打开策略、端口选择与 maintenance MUST 与普通启动一致
- **AND** released/development 双 profile 隔离 MUST 保持
