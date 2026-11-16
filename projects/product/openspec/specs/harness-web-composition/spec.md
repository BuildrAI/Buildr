# harness-web-composition Specification

## Purpose
定义完整 Harness 对话功能在独立网页、Development 专注及内嵌模式中的共享边界，以及独立回环网页的唯一监听、身份发现、登录和代次交接，使用户在两产品中使用同一事实而不复制核心行为。

## Requirements

### Requirement: Harness 必须提供完整唯一网页并由 Development 嵌入

系统 MUST 将对话导航、历史、消息、工具展示、输入、附件、发送、模型与账号设置、问题、审批、停止、接续和恢复全部实现在 buildr-harness-web。独立 buildr-harness-ui 包 MUST 删除；Development MUST NOT 导入或重组 Harness React 组件及执行状态容器。

Development 的 harness-ui 模块 MUST 只准备工程现场、选择工作空间、嵌入网页、维护任务关联和工程导航；任务选择控件 MUST 留在 Development 页面区域。Harness MUST 不管理工程任务状态。

#### Scenario: 相同网页服务两种产品
- **WHEN** 用户独立打开 Harness 或在 Development 使用内嵌/专注模式
- **THEN** 页面 MUST 消费同一完整网页产物，Development 不实现第二套对话控制

#### Scenario: 工程上下文交接
- **WHEN** Development 选择工作空间并新建对话
- **THEN** Development MUST 提供准确工作范围，Harness 自己创建对话并拥有执行交互；选择不自动发送模型消息

#### Scenario: 页面通信校验
- **WHEN** 页面接收非准确父/子窗口、错误 origin 或未知协议消息
- **THEN** 接收方 MUST 忽略消息，不改变选择或触发执行

#### Scenario: 显式工程操作只由 Harness 提交
- **WHEN** 用户在 Development 发起已授权的工程上下文交接
- **THEN** Development MUST 用准确请求身份交给 Harness 处理，Harness 自己维护首次提交及恢复；响应未知不得自动重发

#### Scenario: 工程业务独立工作
- **WHEN** 工程页面未装配 Harness 网页
- **THEN** 任务、知识和代码事实 MUST 可独立读取，不隐式创建执行

### Requirement: 多入口必须共享持久事实而不覆盖未提交输入

同一 Development 页面切换专注/内嵌或业务页面时 MUST 保留对话身份、未提交草稿、选择和阅读位置，不改执行目录。不同窗口及 origin MUST 通过服务端修订同步持久事实；未经明确设计的未提交本地文字 MUST 不跨窗口互相覆盖。缓存与事件 MUST 按稳定数据域、来源范围、对话和适用代次隔离。多入口重复答复、发送或停止 MUST 沿同一幂等和准确版本边界处理。

#### Scenario: 同页模式切换
- **WHEN** 用户在输入或阅读中切换专注与内嵌模式
- **THEN** 输入、滚动和当前对话 MUST 保持，模式变化不发起执行

#### Scenario: 两窗口各有草稿并共同答复
- **WHEN** 两窗口编辑各自未提交文字，并同时回复同一待决请求
- **THEN** 本地文字 MUST 不互相覆盖；准确请求只消费一次，另一请求明确返回已处理或版本冲突

### Requirement: 独立网页只能按明确入口意图启用

独立 Harness Web MUST 有可托管的生产静态产物，提供完整唯一网页和前置的唯一 API。仅使用 Development 时 MUST 默认不监听独立 Harness 网页端口，内嵌和专注 MUST 通过 Development 受认证的同源路径托管该网页并使用同一 API。用户显式打开独立 Harness 时，MUST 允许在同一逻辑服务中启用一个独立回环网页入口，包括两产品同装、同开；它 MUST 不创建第二个执行核心、目录宿主进程或对话库。内部通信和模型网关端口 MUST 不作为浏览器接口公开。

#### Scenario: 只打开 Development
- **WHEN** 用户仅从 Development 使用内嵌或专注模式
- **THEN** 浏览器 MUST 只访问 Development origin，独立 Harness 网页监听器默认不启动

#### Scenario: 同时打开独立网页
- **WHEN** 用户在 Development 已运行时显式打开独立 Harness
- **THEN** 两产品页面 MUST 能并存并观察同一服务资料；独立入口不得抢占 Development 端口、关闭其网页或被重定向成 Development 页面

### Requirement: 网页端点必须在兼容换代时唯一交接

独立网页端点 MUST 归逻辑数据域而非 npm 目录或临时执行代次；只有当前被授予监听权的代次能提供该入口。兼容升级 MUST 保持 origin 和未失效的页面会话，旧代次只保留原执行与私有控制通道，不保留第二个公开监听器。交接允许短暂断线，MUST 保留输入、准确请求身份和事件恢复基线；未知写入不得重发。不能确认释放或地址被其他程序占用时，MUST 报告局部入口不可用，不强杀占用者或发布虚假就绪。

#### Scenario: 旧轮仍运行时换代
- **WHEN** 兼容新版接收新工作而旧代次仍持有轮次
- **THEN** 网页 MUST 经交接后的同一 origin 观察并控制原轮，静态资源和会话保持声明的兼容性，不迁移或重放原执行

#### Scenario: 切换失败或端口被占用
- **WHEN** 新监听未就绪、旧监听释放未知或原地址由其他进程占用
- **THEN** 系统 MUST 保留准确失败和原工作，不宣称网页 ready、不并行争抢；仅在已证明监听权和兼容条件后恢复入口

### Requirement: 启动登录必须绑定准确网页入口而不泄露服务秘密

本机入口 MUST 从受保护的实例发现及就绪观察取得准确地址，不能只根据端口或 PID 信任页面。登录引导 MUST 使用短时单次、绑定产品/数据域/目标端点的票据或等价认证能力，不能向浏览器交出后台主令牌、模型凭据或宿主秘密。独立与 Development 页面会话 MUST 分离；鉴于回环地址不同端口的 Cookie 不隔离，独立入口 MUST 对会话命名和范围隔离并核验 Host/Origin，不能仅依赖 SameSite。有效会话在兼容换代后继续校验原有效期和撤销状态。

#### Scenario: 登录引导与重复打开
- **WHEN** 启动入口确认准确服务和网页已就绪并打开浏览器
- **THEN** 票据 MUST 只兑换一次有限页面会话；重复点击复用现有入口，不创建后台或重复工作
- **AND** 过期、被重复消费或目标不符的票据必须拒绝，日志、URL query 和转发头不得含长期秘密

#### Scenario: 同机另一 origin 冒用页面状态
- **WHEN** 另一端口页面携带同机 Cookie 或伪造 Host/Origin 访问独立 Harness
- **THEN** 系统 MUST 拒绝越权访问，不因同属回环或 Cookie 名相同获得管理能力

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
