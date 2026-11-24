# harness-product Specification

## Purpose
定义 Buildr Harness 与 Buildr Development 的产品责任、共享执行和私有数据边界，使同一用户能从独立网页或工作空间入口使用同一份真实对话与执行，同时保留业务权威、配置隔离以及原生内核的真实能力限制。

## Requirements

### Requirement: 双产品必须保持独立责任与可组合入口

Buildr Harness MUST 拥有原生执行内核接入、受支持的订阅与自带密钥（BYOK）模型来源、跨内核编排、完整交互、私有交互数据及以资源管理器和源代码管理组成的目录级工作环境。Buildr Development MUST 拥有工程工作空间、项目、服务与代码库登记、任务及任务工作树的分配和安全清理、知识、工程验证与交付。Development CLI 与技能 MUST 能被外部智能体使用，不以运行 Harness 或 Development Web 为前提；默认网页组合 MUST 通过公开入口装配同一 Harness 能力。DSH 插件 MUST NOT 成为独立使用的前提或另一个工程记录权威。Harness 核心 MUST 能由其交付负载和公开契约在不加载 Development、未建立业务工作空间或任务的情况下完成目录内工作，MUST NOT 创建替代的任务系统或业务数据库。两者 MUST 保留代码、文件和外部系统作为实际成果的权威来源。

#### Scenario: 仅使用目录型宿主
- **WHEN** 目录型客户端只消费 Harness 交付负载并选择一个明确目录及已支持执行组合
- **THEN** 系统 MUST 能开始对话、执行工具、处理待回应及读取结果，不要求安装 Development 或创建任务

#### Scenario: Development 使用 Harness 交付业务工作
- **WHEN** 用户从任务或工程现场使用嵌入式对话
- **THEN** Harness MUST 维护执行事实，任务状态与业务写入 MUST 继续由 Development 或原业务系统维护
- **AND** 对话结束 MUST NOT 自动证明任务完成或交付成功

### Requirement: 工程业务与执行接入必须保持可分离

Development MUST 保持工作空间、任务、知识、仓库及验证等工程业务的独立模型与公开操作；与 Harness 的对话、生成及执行协作 MUST 经明确的接入和应用装配完成，工程业务 MUST NOT 直接依赖 Harness 私有数据、运行代次或厂家 SDK。当前独立 Development MUST 默认集成兼容 Harness，但这种发行组合 MUST NOT 成为既有非执行业务可用的前提。接入不可用时，依赖它的执行功能 MUST 局部报告不可用，不静默改投其他内核或伪造执行能力。

#### Scenario: 单独验证工程能力
- **WHEN** 在不装配 Harness 接入的组件环境中调用既有任务、知识或仓库业务操作
- **THEN** 这些非执行操作 MUST 可按自身权限和真实数据边界使用，不因缺少模型账号或对话服务而被拒绝
- **AND** 该组件验证 MUST 不被宣称为已交付另一套无 Harness 的独立产品或 DSH 插件

#### Scenario: 默认独立产品使用 Harness
- **WHEN** 用户通过当前 Development 独立产品发起对话或需要执行的功能
- **THEN** 产品装配 MUST 使用 Harness 公开能力，保持当前共享服务与完整 UI，不在工程模块内另建执行循环或账号库

#### Scenario: 执行接入暂不可用
- **WHEN** Harness 接入不可用而用户读取工程事实或请求新的执行
- **THEN** 工程事实 MUST 仍按自身可用性返回，新的执行明确报告局部不可用，不能以替换来源或创建另一执行后台绕过

### Requirement: 同一 Development 工作空间必须可以承载两产品研发

产品拆分 MUST NOT 强制把 Development 与 Harness 的源码、项目、任务或验证放入不同工作空间或不同仓库。同一 Development 工作空间 MUST 能按真实服务归属管理两产品源码、组织跨产品任务并选择相应构建与验证；Harness 的独立产品身份 MUST 不使其源码退出 Development 的工程现场。候选预览 MUST 核对准确工作树、构建及隔离数据域，不得为开发其中一个产品而替换日常执行后台或自动借用其秘密。

#### Scenario: 在现有自举空间开发 Harness
- **WHEN** 用户在既有 Development 工作空间选择 Harness 服务源码开展已授权任务
- **THEN** 项目、任务、代码、构建与验证能力 MUST 可继续使用，无需创建另一个工作空间或复制任务系统

#### Scenario: 同空间联调两个产品
- **WHEN** 同一任务需要修改 Development 的集成与 Harness 的契约或界面
- **THEN** 系统 MUST 保留两边准确来源及共同任务引用，并使用隔离的候选运行身份验证，不覆盖承担日常工作的已采用运行单元

### Requirement: 同一用户和配置域必须共享逻辑服务与私有数据

本次两独立产品所使用的 Harness，在同一操作系统用户、准确数据根与配置域内 MUST 复用一个逻辑服务、一份对话库和同一套账号配置，MUST NOT 因产品入口不同复制数据或启动互相竞争的后台。稳态 MUST 只有一个接收新工作的协调后台，共享账号与配置 MUST 只有一个维护者，每轮执行 MUST 只有一个持有者。兼容更新时旧代次 MUST 仅维护原工作直至安全释放；厂家子进程与兼容退役代次 MUST NOT 被误判为按产品复制运行时。不同用户、开发渠道及预览数据域 MUST 保持隔离。该共享承诺 MUST 不被解释为强制把不经 Harness 承载的外部原生对话导入此库。

#### Scenario: 两产品同时启动
- **WHEN** 两入口并发请求连接同一配置域
- **THEN** 系统 MUST 发现或互斥创建同一逻辑服务，不新建第二份账号及对话

#### Scenario: 兼容版本更新
- **WHEN** 新版具备明确并行兼容能力且旧代次仍持有工作
- **THEN** 新版 MUST 可接收新工作，旧轮继续由原代次控制，配置维护权不双写
- **AND** 旧代次 MUST 在其工作和资源准确释放后退出，不迁移或重放原轮

#### Scenario: 不同用户或预览
- **WHEN** 另一用户或显式隔离预览请求接入
- **THEN** 系统 MUST 使用自己的数据域，不因同机或同品牌自动借用日常账号和历史

### Requirement: 入口退出不得隐式停止共享工作

关闭浏览器或退出任一产品宿主 MUST 只释放该入口的连接，MUST NOT 删除账号、对话、待发送内容或停止仍由服务持有的工作。明确关闭共享后台 MUST 核验准确服务代次、实际活动与动作范围，并说明对其他入口的影响。执行未知、停止已请求、模型结束与原生工具退出 MUST 保持不同事实。

#### Scenario: Development 重启
- **WHEN** Development 退出或升级而 Harness 仍持有执行
- **THEN** 原执行、待回应和结果保存 MUST 继续，重连只观察原事实，不创建新轮

#### Scenario: 请求关闭共享后台但仍有工作
- **WHEN** 调用方请求空闲关闭而后台仍有活动或未知持有者
- **THEN** 系统 MUST 拒绝该关闭并保留控制入口，不因另一产品已退出而推断空闲

### Requirement: 通用启动激活必须由 Harness 独立提供

Harness MUST 提供不依赖 Development 业务模块的运行负载准备、实例发现、兼容激活和准确就绪观察能力。两个产品入口 MUST 消费同一能力，不各自启动执行核心或实现版本选择。普通连接 MUST 优先复用兼容实例；明确激活 MUST 核对目标负载和当前受理者，不以进程被创建代替成功。Development 专用来源和工作空间探针 MUST 留在其宿主适配中。

#### Scenario: Development 未运行时冷启动
- **WHEN** 目录型入口在干净测试配置域中请求准备并连接 Harness
- **THEN** 系统 MUST 从自己的交付负载准备并启动服务，返回准确实例、代次和运行摘要，不加载 Development 或依赖其默认工作空间

#### Scenario: 并发请求与激活失败
- **WHEN** 两入口同时启动，或目标运行单元不能确认已启用
- **THEN** 系统 MUST 互斥采用同一服务；未确认激活必须报告失败或待定并保留原工作，不能用另一个产品名创建第二份核心
