## MODIFIED Requirements

### Requirement: 完整内置接入交付

系统 SHALL 随包提供 `mysql-connection`、`kibana-connection` 和 `xxl-job-connection`，各自包含接入声明、专业方法和必要程序。安装与投射 SHALL 使用现有技能（Skill）机制；程序 MUST 不运行时导入旧连接模块，不按名称或类别接管旧实例。依赖缺失 SHALL 只影响相关动作，帮助 SHALL 离线且不接收认证。

#### Scenario: 安装并发现三个接入
- **WHEN** 在隔离工作空间（Workspace）安装三个内置接入
- **THEN** 可通过通用声明发现准确绑定并读取无认证帮助，完整附件在正式包中可用，不读取或导入旧实例及认证
