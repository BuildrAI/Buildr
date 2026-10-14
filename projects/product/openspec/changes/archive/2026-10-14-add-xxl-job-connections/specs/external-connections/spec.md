## ADDED Requirements

### Requirement: XXL-JOB 调度器连接

系统 SHALL 支持 `scheduling/xxl-job`，复用现有本机身份、SQLite 版本和加密认证。专用配置 SHALL 包含网站、用户名、独立生产标识、适配版本与可为空的本机服务关联。网站与身份变化 MUST 要求新认证；关联变化 SHALL 不改变认证目标。

#### Scenario: 登记不同环境
- **WHEN** 用户分别创建 QA 与生产 XXL-JOB 连接
- **THEN** 两条连接保留独立环境和真实目标，共用同一专业能力，不内置客户地址或密码

### Requirement: XXL-JOB 原网站查看

页面 SHALL 沿用统一连接列表与抽屉（Drawer）管理 XXL-JOB 网站和认证，并在新标签页打开原站。页面 MUST 不展示另一套任务控制台或将认证附加到网址。测试 SHALL 验证登录与有界读取，不运行任务；测试失败 SHALL 不阻止保存其他字段合法的配置。

#### Scenario: 打开原站
- **WHEN** 用户打开已保存 XXL-JOB 连接
- **THEN** 新标签页打开规范网站，连接页保留，不携带密码或登录凭据（Cookie）
