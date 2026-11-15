# Buildr Harness

本服务（Service）维护独立账号接入、统一对话、执行控制、原生上下文及私有交互库；不拥有任务（Task）、工作空间（Workspace）登记、源文件成果或业务系统状态的写入权威。

- `src/index.ts` 与 `src/contracts.ts` 是私有包 `@buildr-ai/buildr-harness` 的公开边界。宿主（Host）只按公开包入口消费，不直接导入内部目录；宿主负责页面认证及已登记工作对象的权威解析；通用本机通信和独立执行进程属于本服务。
- `@buildr-ai/buildr-harness/profile` 提供无执行进程装配的配置域路径与身份计算；`@buildr-ai/buildr-harness/http-dto` 只导出生成类型。安装选择器不得因读取配置路径而装入执行核心。
- 各厂商原生进程属于执行器（Executor）；模型协议和套餐凭据属于对应模型来源适配器（Provider Adapter）或其委托的原生账号提供者，凭据必须保持唯一写入责任及独立配置；不得自动继承、覆盖或接管用户默认桌面配置。秘密不进入公开视图、事件、诊断、源资产或 Git。
- 统一对话可以关联任务（Task），但不是任务状态或实际成果的唯一权威。原生上下文按准确程序、配置和目录绑定；状态未知不等于可以重发，历史消息不授予新的工具许可。
- 该服务（Service）以私有包提供独立执行进程及公共客户端（Client），拥有独立 CLI 与启动器，并由 Development 按契约（Contract）接入及携带所需运行负载；同域入口复用后台，关闭或卸载入口不删除共享历史与账号。这不等于已经实现自研的 Buildr 智能体（Agent），单次生成复用统一模型能力，外部桌面关联已退役。

- 完整网页由 sibling `buildr-harness-web` 唯一维护；Development 只嵌入其产物，不消费对话 React 组件。源码/包名改变不迁移现有 agent-service 数据根。
