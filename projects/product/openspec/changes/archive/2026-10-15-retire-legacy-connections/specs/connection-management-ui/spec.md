## MODIFIED Requirements

### Requirement: 新页面只管理新路径实例
系统 SHALL 在 `/connection-skills` 提供新连接目录与编辑入口，导航名称统一为“连接”。页面 SHALL 只管理技能声明实例，展示名称、类别、所绑定技能（Skill）、共享文件来源、启用状态、认证来源及必要专业摘要，不因同名或同类型合并实例。

#### Scenario: 打开新连接页面
- **WHEN** 用户访问 `/connection-skills`
- **THEN** 页面读取所选工作空间（Workspace）目录当前的新实例并展示来源，当前文件缺失时显示未配置，不自动从其他分支（Branch）恢复

旧 `/connections` 页面地址 SHALL 跳转到 `/connection-skills`；已保存的新旧连接标签 SHALL 归一并去重，不恢复失效页面。

#### Scenario: 恢复历史连接标签
- **WHEN** 浏览器恢复旧连接地址或同时包含新旧连接标签
- **THEN** 打开唯一连接目录且只保留一个连接标签，不调用旧接口

### Requirement: 网站入口与 Nacos 首版范围受限
网站入口 SHALL 来自声明并由应用验证为不含认证信息的 HTTP/HTTPS 地址，通过新标签页打开。Nacos 首版 SHALL 仅声明连接字段、命名空间（Namespace）动态发现、只读测试、摘要及网站入口，不提供专用配置控制台。页面 SHALL 不统一生成发布、部署或回滚动作；MySQL 查询 SHALL 由独立查询工具承接。

#### Scenario: 打开 Nacos 原网站
- **WHEN** 用户点击合法 Nacos 网站入口
- **THEN** 新标签页打开原网站，地址不携带团队或个人密码，页面不执行配置发布

#### Scenario: 旧 MySQL 功能继续访问
- **WHEN** 用户打开旧 MySQL 连接页面地址
- **THEN** 页面跳转到现行连接目录，查询仅接受用户明确选定的技能绑定实例，不继续调用旧查询接口
