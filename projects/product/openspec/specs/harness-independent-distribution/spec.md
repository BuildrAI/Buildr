# harness-independent-distribution Specification

## Purpose
定义 Buildr Harness 独立安装与随 Development 组合交付的兼容责任，保全已有账号、对话、原生配置、程序凭据和活动执行，避免不同产品安装器形成双写后台或破坏性降级，并以真实许可及平台证据限制发行支持声明。

## Requirements

### Requirement: 独立安装必须后于共享边界且保留原用户入口

Harness MUST 可单独安装 CLI、本机网页与产品启动器，不要求 Development；Development MUST 继续携带兼容执行负载并开箱可用，不强迫已有用户另装服务或手动配置端口。Development MUST 保留 `@buildr-ai/buildr` 包名及 `buildr` 命令，并提供自己的产品启动器。独立安装 MUST 在目录宿主、共享协议/界面及双入口组合完成相应验收后提供；源码目录独立 MUST 不被视为已支持独立安装。

两个独立产品 MUST 不要求用户先安装 DSH 桌面或装载 DSH 插件。Development 随包组合 Harness MUST 由产品装配负责，不改变工程业务与执行接入可分离的边界；独立交付 MUST 不以未来 DSH 插件已实现或已验收为前提。

#### Scenario: 没有 DSH 插件宿主的独立安装
- **WHEN** 用户在没有 DSH 桌面和插件配置的环境中安装两个独立产品并使用已支持的非 DSH 执行路径
- **THEN** 产品 MUST 能按各自交付负载启动并使用，不为加载界面或工程环境而要求补装 DSH

#### Scenario: Development 原用户升级
- **WHEN** 用户只升级 Development
- **THEN** 既有命令、网页和 Harness 工作能力 MUST 保留，不新增必须手工安装或登录另一套服务的步骤

#### Scenario: 启动器消费公共准备与网页发现
- **WHEN** Harness 启动器发现 Development 未运行且没有活动 Harness 实例
- **THEN** 它 MUST 调用 Harness 的通用准备/激活和受认证网页发现能力，再完成登录引导；不能调用 Development 私有启动编排或硬编码端口猜测已成功

#### Scenario: 新用户仅安装 Harness
- **WHEN** 用户从独立包启动 CLI 和网页
- **THEN** 生产静态资源、执行负载及必要依赖 MUST 已完整可解析，不依赖 Development 私有源码或测试工具

### Requirement: 两个产品必须交付可区分且独立工作的启动器

系统 MUST 在声明支持的桌面平台交付 Buildr Harness 与 Buildr Development 两个可区分、可独立打开的产品启动器，不以两个 CLI 命令、网页链接或同一个入口的切换菜单替代。Harness 启动器 MUST 在 Development 未运行时打开独立 Harness Web；Development 启动器 MUST 打开工作现场并能自动接入兼容 Harness，不要求用户先开另一个启动器。启动器产品身份、渠道、安装来源、系统入口标识和打开目标 MUST 准确绑定；同域并发启动 MUST 复用共享逻辑服务，不互相覆盖入口或误开另一产品。

#### Scenario: 分别点击两个启动器
- **WHEN** 用户先独立点击 Harness 启动器，再在另一种安装顺序下独立点击 Development 启动器
- **THEN** 两者 MUST 分别打开独立 Harness Web 与 Development 工作现场，不要求手工补启另一产品

#### Scenario: 两个启动器同时或重复打开
- **WHEN** 同用户同配置域同时打开或重复点击两个启动器
- **THEN** 各入口 MUST 打开正确产品且复用同一逻辑 Harness 服务，不复制对话、账号或受理工作

#### Scenario: 产品与开发渠道不混淆
- **WHEN** 发布版和开发版启动器并存，或启动器身份指向错误产品
- **THEN** 合法入口 MUST 保持各自产品/渠道归属，错误绑定 MUST 被拒绝，不因产品名 Development 而自动使用开发配置

#### Scenario: 既有 Buildr 启动器兼容
- **WHEN** 升级遇到具有可证明原安装归属的旧 Buildr 启动器
- **THEN** 旧入口 MUST 保持映射到 Development 或通过受控更新替换，不覆盖归属未知的同名入口，也不改成独立 Harness 入口

### Requirement: 产品入口身份必须与共享数据域分开

产品 ID、安装来源和系统启动器标识 MUST 区分 Harness 与 Development；发布/开发渠道和数据域 MUST 沿原兼容映射解析，产品不同不得自动创建新数据根。网页实例复用、替换和退出 MUST 同时核验产品、渠道、安装归属及准确实例，不能只按相同 channel、runtime role 或端口替换。旧身份 MUST 仅兼容映射到 Development，不能冒充 Harness。

#### Scenario: 同渠道两个产品启动
- **WHEN** 两启动器均属于 development 渠道且访问同一配置域
- **THEN** 它们 MUST 共享 Harness 数据身份，但保留各自网页与启动器身份；Harness 不得复用现有 4458 绑定去关闭 Development

#### Scenario: 原启动器身份被当作新产品
- **WHEN** 只有旧 channel/role 证据而无法证明 Harness 产品绑定
- **THEN** 系统 MUST 拒绝误认，保留旧 Development 入口和原数据，不靠显示名升级身份

### Requirement: 首次共存必须发现原数据而不自动迁移改名

两个产品 MUST 采用一致、可核验的用户/渠道/配置域解析，明确发现并复用已有运行身份和数据根。首次拆分 MUST 保留旧 `agent-service/`、程序凭据位置、账号身份、对话/原生引用、任务关系及目录，不因品牌改名复制、搬迁、重新登录或重签全部凭据。同路径或端口 MUST 不被单独视为同一实例证明。

#### Scenario: 先装 Development 再装 Harness
- **WHEN** 同用户同渠道的既有资料与服务身份可核验
- **THEN** Harness MUST 采用同一数据域及兼容后台，不建立第二份历史或账号

#### Scenario: 数据根身份冲突
- **WHEN** 存在多个冲突记录、错误用户或不匹配的配置身份
- **THEN** 系统 MUST 局部拒绝接管并保留资料，不以最近使用或默认端口猜测目标

### Requirement: 运行负载兼容与升级必须由共享维护者控制

系统 MUST 分别观察产品版本、公开契约能力、数据兼容、运行内容及原生内核版本。安装另一产品 MUST NOT 自动覆盖活动运行负载或以包版本新旧替代兼容检查。兼容更新 MUST 保留旧轮归属及唯一配置维护责任；不兼容更新 MUST 等待准确释放或拒绝，不在同数据根启动第二个写入核心。新存储无法由旧程序理解时 MUST 拒绝降级写入。

#### Scenario: 两产品所带版本不同
- **WHEN** 第二个产品连接已有兼容实例
- **THEN** 系统 MUST 优先复用当前实例，更新通过明确的共享激活能力推进，不由宿主连接顺序决定

#### Scenario: 不兼容存储或协议
- **WHEN** 候选版本与当前资料或客户端能力不兼容
- **THEN** 系统 MUST 保留旧工作及可用观察控制，报告具体不兼容，不启动替代双写后台或覆盖资料

#### Scenario: 迁移失败
- **WHEN** 在已取得准确维护边界后进行的存储迁移失败
- **THEN** 系统 MUST 保留一致保全材料和失败事实，不将旧程序直接启动到较新不兼容资料上

### Requirement: 卸载产品不得删除另一入口依赖的共享资源

普通卸载 MUST 只处理该产品自有安装与入口；共享对话、账号、程序凭据、原生资料及活动或另一入口仍依赖的运行负载 MUST 保留。活动负载 MUST 不依赖已卸载 npm 目录才能继续。删除共享资料 MUST 是独立明确动作，按实际工作与保全情况核验，不由“最后一个窗口关闭”推断删除授权。

#### Scenario: 卸载 Development 但 Harness 仍在使用
- **WHEN** 用户卸载 Development 且共享后台仍有工作或独立 Harness 安装
- **THEN** 系统 MUST 保留共享资料及所需运行负载，原执行与独立入口继续可用

#### Scenario: 重装产品
- **WHEN** 用户重新安装同一配置域的产品
- **THEN** 系统 MUST 核验并复用保留资料，不因卸载过入口而重新创建空库覆盖旧历史

### Requirement: 独立发行必须保留真实许可及支持边界

每个独立发行物 MUST 核对准确依赖版本、二进制和第三方实现的分发许可，保留适用许可证与来源说明；订阅接入 MUST 另核对实际允许的使用方式。未知或不允许项 MUST 不进入该发行物的支持承诺；不能安全排除时 MUST 阻止受影响发行物。技术验证 MUST 区分替身、真实账号、模型路径及平台，不能宣称任意组合或未经验证平台支持。包元数据 `private` MUST 不被用作许可豁免理由。许可材料 MUST 区分 Agent 收集的事实证据与产品/发行负责人作出的分发、订阅使用及宣传决定；缺少该决定 MUST 保持发行限制，不以技术检查通过替代。

#### Scenario: 订阅跨内核方式尚未核对
- **WHEN** 某订阅来源技术可调用但使用条件或分发许可尚未核实
- **THEN** 新产品 MUST 不将该组合宣传为已支持；其他独立可验证能力不因此被判失败

#### Scenario: 仅有替身或单平台证据
- **WHEN** 组合或平台只有协议替身或其他平台测试结果
- **THEN** 支持矩阵 MUST 保留实际未验证项，不把包可构建当成真实原生接入通过
