## ADDED Requirements

### Requirement: 正式与开发入口使用相应 Harness

正式插件 SHALL 核对本机正式安装与启动身份，通过受认证桌面桥连接对应 Harness；开发插件 SHALL 显示 Buildr Harness Dev 并连接已明确配置的开发域。缺失、漂移或不兼容时 MUST 提供修复及复查入口，不静默安装、升级或接管其他实例。

#### Scenario: 先装插件后装 Harness

- **WHEN** 用户打开正式插件而正式 Harness 未就绪，随后按提示安装并重试
- **THEN** 插件 MUST 从缺失状态转为连接核验后的正式 Harness，无须重装插件

### Requirement: 以能力判断 DSH 兼容并保全开发更新

开发和正式插件 MUST 将宿主兼容范围及准确验收版本分别记录，不把一个精确 RC 写成唯一允许版本；缺少必要能力 MUST 不阻断 DSH 原生工作。开发 Harness 的兼容更新 MUST 不依赖重装 DSH 插件或重启 DSH；已打开页面换版 MUST 保全草稿、未保存编辑与活动执行。

#### Scenario: 开发 Harness 更新而插件不变

- **WHEN** 已明确绑定的开发 Harness 完成兼容激活
- **THEN** 新打开的页面 MUST 可用新版，已打开页面 MUST 在安全时采用或提示保留现有工作，不重启 DSH
