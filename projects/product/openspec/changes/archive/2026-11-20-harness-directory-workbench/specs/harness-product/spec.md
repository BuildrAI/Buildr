## MODIFIED Requirements

### Requirement: 双产品必须保持独立责任与可组合入口

Buildr Harness MUST 拥有原生执行内核接入、受支持的订阅与自带密钥（BYOK）模型来源、跨内核编排、完整交互、私有交互数据及以资源管理器和源代码管理组成的目录级工作环境。Buildr Development MUST 拥有工程工作空间、项目、服务与代码库登记、任务及任务工作树的分配和安全清理、知识、工程验证与交付。Development CLI 与技能 MUST 能被外部智能体使用，不以运行 Harness 或 Development Web 为前提；默认网页组合 MUST 通过公开入口装配同一 Harness 能力。DSH 插件 MUST NOT 成为独立使用的前提或另一个工程记录权威。Harness 核心 MUST 能由其交付负载和公开契约在不加载 Development、未建立业务工作空间或任务的情况下完成目录内工作，MUST NOT 创建替代的任务系统或业务数据库。两者 MUST 保留代码、文件和外部系统作为实际成果的权威来源。

#### Scenario: 仅使用目录型宿主
- **WHEN** 目录型客户端只消费 Harness 交付负载并选择一个明确目录及已支持执行组合
- **THEN** 系统 MUST 能开始对话、执行工具、处理待回应及读取结果，不要求安装 Development 或创建任务

#### Scenario: Development 使用 Harness 交付业务工作
- **WHEN** 用户从任务或工程现场使用嵌入式对话
- **THEN** Harness MUST 维护执行事实，任务状态与业务写入 MUST 继续由 Development 或原业务系统维护
- **AND** 对话结束 MUST NOT 自动证明任务完成或交付成功
