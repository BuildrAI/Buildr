## Why

上一轮重构统一了一级目录，但每日演进归属、分散生成输出、根目录转发文件、宽泛模块方法集合及工程检查混入产品应用的问题仍增加定位与维护成本。用户已确认进一步收敛职责，并要求用逐层目录树说明真实代码；本轮保持单机版公开行为，不引入企业版任务主导汇总。

## What Changes

- 每日演进迁入 `src/modules/task/daily-progress/`，仍以 Git 提交为主并关联本地任务；数据存储和公开命令、接口保持不变。
- 普通生成物统一到服务 `build/` 并忽略，前端托管保留 `web-dist/`；公开测试上下文入口由 package exports 直接映射生成入口，移除手写根转发。
- 用明确协作者收窄工作空间、资产与诊断的跨模块依赖，移出产品源码中的开发工程检查。
- 前端工作空间设置和业务客户端归入对应功能，公共传输层不装配全部业务。
- 用项目、服务、模块内部目录树更新现有代码地图、调用和技术图，并校验最终路径。
- 不改变用户数据、安全边界、业务行为或公开主入口；构建物理路径变化必须同步全部消费者和发布物边界。

## Capabilities

### New Capabilities

无新增用户能力。

### Modified Capabilities

- `workspace-daily-progress-module-architecture`: 每日演进转属任务模块子能力。
- `product-source-layout`: 明确生成目录、任务子能力与工程检查归属。
- `buildr-service-typescript-execution`: 收敛生成入口与公开薄入口允许清单。
- `cli-modular-architecture`: 更新每日演进命令归属和工程命令装配。
- `buildr-web-service`: 功能客户端、设置归属及生成类型位置。
- `product-knowledge-organization`: 以目录树连接四层代码地图。

## Impact

涉及 Product 下 `buildr`、`buildr-web` 两个服务、代码生成、打包、测试、当前知识与结构规范。既有准备及测试命令保持稳定，不新增依赖。没有正式版本发布、父任务完成或企业版数据模型变更。
