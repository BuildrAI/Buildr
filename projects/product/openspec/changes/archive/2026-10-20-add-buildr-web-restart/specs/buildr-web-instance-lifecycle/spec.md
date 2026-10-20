## ADDED Requirements

### Requirement: 默认实例必须支持同身份重启接管
Buildr MUST 在网页唯一生命周期能力中提供默认实例的同身份重启：经会话授权的 restart 请求由当前实例启动同产品入口的后继进程，后继进程携带已观察实例摘要与原访问端口，在启动锁内复用既有认证退出、启动锁、记录清理与健康验证完成接管。接管 MUST 适用于 released 与 development 渠道，MUST NOT 要求 npm 安装槽位或版本变化证明。适用时 MUST 保留原访问端口以便原地址继续访问；端口不可用时 MUST 诚实报告实际地址，不冒称原页面已恢复。

#### Scenario: 同身份实例被重启
- **WHEN** released 或 development 渠道的当前健康默认实例收到已授权 restart 请求
- **THEN** 当前实例 MUST 先建立响应，再以同产品入口 spawn 后继进程并传递实例观察摘要与原端口
- **AND** 后继进程 MUST 在启动锁内重新核对记录实例身份与摘要，只对仍匹配观察的实例发起认证退出，并在旧实例确认退出后绑定原端口、写入新实例回执

#### Scenario: 接管期间实例已变化
- **WHEN** 后继进程取得启动锁后实际实例与观察摘要不再一致
- **THEN** 生命周期 MUST 保留现场并报告冲突
- **AND** MUST NOT 依据旧观察停止后来出现的外来实例

#### Scenario: 重启接管失败保留旧实例
- **WHEN** 后继进程未能在约定预算内完成认证退出与健康接管
- **THEN** 旧实例 MUST 继续运行或如实报告其已退出，接管失败 MUST NOT 静默产生第二个常驻实例
- **AND** 已成立的实例回执与启动锁事实 MUST 保持可诊断

#### Scenario: Preview 实例不适用重启
- **WHEN** 生命周期入口处理 Preview owner 实例的 restart 请求
- **THEN** MUST 拒绝该请求并保持 Preview 实例运行
- **AND** Preview 生命周期事实与默认实例维护策略 MUST 保持不变
