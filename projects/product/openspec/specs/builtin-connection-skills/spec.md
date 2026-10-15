# builtin-connection-skills Specification

## Purpose
让用户和不同智能体（Agent）通过可独立安装和接续的完整 MySQL、Kibana 与 XXL-JOB 内置连接技能（Connection Skill），复用新连接架构的明确实例、认证与观察版本执行专业操作，并准确核验结果和局限。

## Requirements

### Requirement: 完整内置接入交付

系统 SHALL 随包提供 `mysql-connection`、`kibana-connection` 和 `xxl-job-connection`，各自包含接入声明、专业方法和必要程序。安装与投射 SHALL 使用现有技能（Skill）机制；程序 MUST 不运行时导入旧连接模块，不按名称或类别接管旧实例。依赖缺失 SHALL 只影响相关动作，帮助 SHALL 离线且不接收认证。

#### Scenario: 安装并发现三个接入
- **WHEN** 在隔离工作空间（Workspace）安装三个内置接入
- **THEN** 可通过通用声明发现准确绑定并读取无认证帮助，完整附件在正式包中可用，旧实例及认证保持原状

### Requirement: MySQL 接入与查询职责独立

MySQL 连接技能（Connection Skill） SHALL 维护目标、完整认证、连接测试及数据库发现。查询工具 MUST 保持独立内置能力（Builtin），不得将查询编辑、结果或本机偏好变成团队连接配置。MySQL 专业接入程序 SHALL 随 Buildr 安装，无需用户猜测开发检出路径或额外安装数据库客户端。

#### Scenario: 配置后查询
- **WHEN** 用户保存新 MySQL 实例并打开查询工具
- **THEN** 工具使用明确实例与当前版本访问，测试和查询分别核验，密码不进入页面、参数或普通输出

### Requirement: Kibana 独立只读调查

Kibana 技能（Skill） SHALL 提供视图、字段、搜索、统计及真实查询通道测试，保留现有时间、条数、字节、字段验证、遮蔽与不完整结果边界。程序 SHALL 使用明确接口地址，保留代理前缀及网站空间（Space），不根据原网站链接猜测另一认证目标。方法 SHALL 说明如何从服务线索、环境与部署事实定位字段及有界时间。

#### Scenario: 登录可用但查询不可用
- **WHEN** 认证成功而查询通道失败或响应不完整
- **THEN** 测试明确报告未验证，不以登录或零命中冒充查询成功

### Requirement: XXL-JOB 专业状态与副作用保护

XXL-JOB 技能（Skill） SHALL 保留 2.3.0 代码处理器模式（BEAN）的执行器发现、服务关联、任务查询、预演、配置维护、启停、触发和日志。专业本机关联与授权记录 SHALL 由技能私有状态维护，并按实例隔离；操作前 MUST 核验已登记服务与远端执行器身份。生产每次实际动作 MUST 使用具体目标和差异或有效参数的单次授权；外部写入前 MUST 复核连接上下文与远端观察，未知创建或触发不得盲目重试。

#### Scenario: 关联后远端身份漂移
- **WHEN** 已关联执行器编号对应的 AppName 改变
- **THEN** 相关动作明确停止，不按同名重选；其他连接仍可使用

#### Scenario: 生产触发结果未知
- **WHEN** 一次授权的触发请求超时
- **THEN** 返回未知及调查指引，不重复触发，不把请求受理表述为业务执行成功
