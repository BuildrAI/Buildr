## Why

已配置的网站与账号密码应能供不同智能体（Agent）直接维护服务（Service）的调度任务（Job），减少依赖浏览器操作和重复人工定位。当前连接能力缺少 XXL-JOB；用户已确认按环境和服务定位执行器（Executor），并授权实现。

## What Changes

- 增加 `scheduling/xxl-job` 连接，复用本机 SQLite 身份、版本与加密认证。
- 连接页面沿用 Nacos：管理连接，在新标签页打开原网站。
- 提供执行器（Executor）发现及经远端核实的服务（Service）关联，智能体（Agent）根据已登记代码和该环境配置取得真实 `AppName`，不按显示名称猜测。
- 提供限定服务范围的任务查询、详情、代码处理器模式（BEAN）创建修改、启停、手动触发、调度记录与有界日志查看。
- 保留写前重读、生产本次操作授权、未知结果不自动重试及诚实结果说明。
- 本次不包含在线脚本（GLUE）编辑、终止运行、删除远端任务或清理日志；没有破坏性变更。

## Capabilities

### New Capabilities

- `xxl-job-management`: 服务定位、调度操作、日志与具体副作用边界。

### Modified Capabilities

- `external-connections`: 增加调度器（Scheduler）类型与连接配置/网页入口。

## Impact

影响 `services/buildr/src/modules/connections`、连接前端、随包 Buildr 技能（Skill）及专业测试。适配 2.3.0 管理接口（API），不增加外部依赖或通用请求代理；不修改现有 MySQL、Nacos、Kibana 语义。真实业务目标和认证不进入发布资源。
