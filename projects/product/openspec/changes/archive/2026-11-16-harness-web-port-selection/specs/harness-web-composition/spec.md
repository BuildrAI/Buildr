## ADDED Requirements

### Requirement: 独立网页必须按渠道使用固定端口并安全更换已有端点

独立 Harness CLI 与启动器 MUST 默认在 development 使用9519、released使用9518，显式 --port 可以覆盖。Development自身的端口与入口 MUST 保持不变。已绑定其他端口时，本机第一方 Harness 管理者 MUST 使用已观察端点、原端口和协调代次进行换绑。系统 MUST 先取得新回环监听，再按版本与持有者校验更新网页端点；占用、陈旧观察或协调身份变化 MUST 保留原端点，不抢占其他服务、不重启或停止Agent执行。成功换绑 MUST 撤销旧网页登录并仅关闭旧网页连接；账号、历史和执行归属 MUST 保持，未知工作 MUST NOT 重放。

#### Scenario: 开发与发布入口
- **WHEN** 用户分别启动开发版或发布版独立Harness且未覆盖端口
- **THEN** 前者 MUST 使用9519，后者 MUST 使用9518，Development自身入口保持不变

#### Scenario: 已有端点安全换绑
- **WHEN** 本机第一方以准确观察请求更换独立网页端口
- **THEN** 系统 MUST 在新端口就绪后提交换绑并关闭旧网页连接，原执行继续由原持有者管理

#### Scenario: 端口占用或陈旧请求
- **WHEN** 新端口被占用或端点/原端口/代次观察已过期
- **THEN** 系统 MUST 拒绝并保留原网页及运行，不冒充9519或9518就绪
