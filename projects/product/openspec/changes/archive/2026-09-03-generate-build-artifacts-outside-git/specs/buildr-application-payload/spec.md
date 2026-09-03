## ADDED Requirements

### Requirement: Candidate 构建必须冻结闭合生成物集合
Buildr Candidate builder MUST只以当前人工源码、HTTP Schema、迁移、产品资源、锁文件和固定工具版本作为生成输入，并 MUST在隔离暂存中生成DTO、公共Test Context ESM/声明与Buildr Web静态资源，再从该matching集合生成Application Payload。Builder MUST为前置生成物写入排序、无绝对路径且无时间戳的manifest，Payload MUST拥有独立canonical manifest；最终release artifact MUST同时绑定生成物identity与`applicationPayloadDigest`。生成物 MUST NOT成为可人工修改的第二源码authority。

#### Scenario: 干净检出生成完整Candidate输入
- **WHEN** Candidate从不含任何目标生成文件的干净checkout开始构建
- **THEN** builder MUST生成后端/前端DTO、公共Test Context ESM/`.d.ts`、Web dist与Application Payload
- **AND** Git tracked tree MUST保持不变，正式下游 MUST只消费本次matching暂存或其冻结副本

#### Scenario: 相同输入重复生成
- **WHEN** builder以相同源码、Schema、锁文件和工具版本向两个全新暂存根生成
- **THEN** 两次逻辑文件集合、mode、size与SHA-256 MUST完全一致
- **AND** 任一差异 MUST在Candidate或发布消费前失败并指出逻辑产物与路径

#### Scenario: 显式输入缺失或漂移
- **WHEN** 下游收到的生成物目录缺失、包含不支持的entry或bytes与manifest不一致
- **THEN** 对应消费 MUST在打包、Browser启动或公开写入前失败
- **AND** MUST NOT回退到tracked文件、development cache或其他工作树

#### Scenario: Candidate失败清理
- **WHEN** 任一生成、验证或manifest步骤失败
- **THEN** builder MUST只清理本次拥有的隔离暂存
- **AND** MUST不删除开发者本地物化、其他Candidate或源码文件

## MODIFIED Requirements

### Requirement: Buildr 必须构建唯一 npm 应用负载
Buildr release preparation MUST只构建一次平台无关应用负载，并 MUST让唯一npm tarball消费该冻结payload。Payload builder MUST接收当前Candidate生成物集合中显式提供并已校验的Web dist根，不得从Git tracked或development本地`web-dist`复制。负载 MUST包含CLI、Core/Application、SQLite migrations、Buildr Web HTTP/runtime、冻结`web-dist`、`resources/`、明确deferred runtime assets、运行依赖以及Buildr version和protocol identity；MUST NOT包含Node executable、SEA、installer、平台产品、checkout-only tools、`buildr-web`源码或Vite toolchain。

#### Scenario: 冻结 npm payload
- **WHEN** release contract、生成物manifest与显式Web dist输入均匹配且payload builder成功
- **THEN** builder MUST产生规范化payload manifest、runtime bundle、resource directory和唯一`applicationPayloadDigest`
- **AND** npm pack MUST只消费该冻结输出，不得从checkout重新bundle、构建Web或复制资源

#### Scenario: 前端源码不进入负载
- **WHEN** verifier检查payload inventory
- **THEN** inventory MUST包含来自matching Candidate staging、可直接由Buildr Web Runtime托管的正式静态产物
- **AND** MUST NOT包含`buildr-web`source、Vite config、前端开发依赖或要求安装后执行Vite

#### Scenario: Web dist输入未绑定
- **WHEN** Payload builder没有收到matching生成物manifest和显式Web dist根，或者实际bytes与manifest不一致
- **THEN** builder MUST在创建payload前失败
- **AND** MUST NOT回退到Service root、tracked历史或其他Candidate目录

### Requirement: npm 应用负载 identity 必须确定且可逐文件证明
Payload builder MUST使用排序后的相对路径、文件mode、size与SHA-256形成canonical manifest和digest，并 MUST将matching生成物manifest identity、`resources/`、冻结Web dist和明确deferred runtime assets纳入可证明inventory；MUST排除时间戳、绝对checkout path、runner临时路径、`tools/`、`test/`及其他构建机器噪音。npm入口 MUST在执行业务代码前校验payload manifest与可读取的真实资源。

#### Scenario: 相同输入重复构建
- **WHEN** 同一commit、锁定依赖、resources与生成物manifest重复构建payload
- **THEN** 两次输出 MUST具有相同canonical manifest bytes和`applicationPayloadDigest`
- **AND** 任一非确定性差异 MUST由构建验证报告并失败

#### Scenario: npm payload 资源被修改
- **WHEN** npm bundle、migration、Web asset、worker、baseline或许可证任一可读取byte与manifest不符
- **THEN** npm runtime MUST在读取漂移资源或启动服务前fail closed
- **AND** 诊断 MUST报告payload identity与不匹配的相对资源，不得回退到development checkout
