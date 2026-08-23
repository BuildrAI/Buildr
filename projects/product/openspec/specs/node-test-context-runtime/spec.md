# node-test-context-runtime Specification

## Purpose

定义可复用 Node.js Test Context Runtime、注册协议、持久 Worker Host、缓存身份、隔离/reset、失效与 runner adapter 行为。

## Requirements

### Requirement: Node.js测试必须通过稳定定义注册Context依赖
Node Test Context Runtime MUST提供runner-independent的Context definition与test registration contract；每个definition MUST声明稳定id/version、scope、依赖、并行安全和生命周期hook，每个注册测试MUST显式声明所需Context alias与配置。

#### Scenario: 注册一个Application Context测试
- **WHEN** 测试通过公共API声明一个worker-scoped Application Context和配置
- **THEN** Runtime MUST在callback执行前解析依赖并提供matching value
- **AND** 测试文件 MUST NOT自行组装或清理同一Application Context

#### Scenario: definition或配置非法
- **WHEN** definition key重复、依赖成环、scope/parallel safety非法或配置包含非确定值
- **THEN** Runtime MUST在执行test body前fail closed
- **AND** 诊断 MUST标识definition、字段或dependency cycle

### Requirement: Context缓存必须绑定可复核配置身份
Runtime MUST由provider id/version、规范化配置、显式source identity与dependency identities生成稳定cache key；相同Worker Host中matching worker context MUST最多create一次，不匹配身份 MUST NOT复用。

#### Scenario: 多个测试使用相同配置
- **WHEN** 同一Worker Host中的多个suite或文件请求相同worker Context配置
- **THEN** Runtime MUST复用同一cached state
- **AND** evidence MUST分别记录一次create和后续cache hit

#### Scenario: 配置或依赖发生变化
- **WHEN** Context配置、definition version、source identity或dependency identity变化
- **THEN** Runtime MUST生成不同cache key并创建新state
- **AND** 旧state MUST按生命周期策略销毁或在Host关闭时销毁

### Requirement: Runtime必须提供worker、suite和test scope
Runtime MUST支持`worker`、`suite`与`test` scope及Context依赖图；worker state存活到Host关闭，suite state绑定suite identity，test state只存活于单个test lease，依赖 MUST先创建后销毁。

#### Scenario: test-scoped Context完成
- **WHEN** test body成功、失败、超时或取消
- **THEN** Runtime MUST执行release/reset/destroy中适用的生命周期
- **AND** cleanup失败 MUST保留原test outcome并追加明确失败，不得记录为passed

#### Scenario: 依赖Context复用
- **WHEN** 上层Application Context依赖matching基础Context
- **THEN** Runtime MUST先取得基础Context并将其identity纳入上层cache key
- **AND** Host关闭时 MUST按依赖逆序destroy

### Requirement: Node runner必须使用持久Worker Host兼顾复用与并行
Node adapter MUST支持直接单文件执行；Context-aware runner MUST把已注册文件分配到不超过外层grant的一个或多个持久Worker Host，每个Host MUST在当前进程用`node:test` non-process isolation执行分配文件并保留Context cache。

#### Scenario: 多文件共享Context
- **WHEN** 两个测试文件被分配到同一Host且请求相同Context签名
- **THEN** 两个文件 MUST消费同一cached state
- **AND** runner MUST NOT为第二个文件创建新的短生命周期子进程

#### Scenario: 多Host并行
- **WHEN** 外层grant允许N个worker且计划包含可并行文件
- **THEN** runner MUST启动不超过N个持久Host并稳定分配文件
- **AND** 单个Host或文件失败 MUST使整体执行失败且不得被其他Host的通过结果覆盖

### Requirement: Context隔离、reset与污染失效必须由provider拥有
每个Context definition MUST声明`shared`、`exclusive`或`isolated`并行安全；Runtime MUST执行provider的acquire/release/reset/inspect/destroy，支持显式dirty标记和自动污染检测，并在安全点evict dirty state。

#### Scenario: exclusive Context并发请求
- **WHEN** 两个并发测试请求同一exclusive cache entry
- **THEN** Runtime MUST让一个lease等待另一个release
- **AND** evidence MUST记录等待时间且两个body不得重叠持有该state

#### Scenario: Context被标记污染
- **WHEN** 测试显式markDirty或inspect检测到unexpected drift
- **THEN** Runtime MUST在active lease释放后evict并destroy该entry
- **AND** 后续测试 MUST创建新state；unexpected drift MUST使当前测试失败关闭

### Requirement: 公共Runtime必须与Buildr和具体Runner解耦
公共Context Runtime MUST只依赖Node.js标准库且MUST NOT读取Buildr registry、Workspace layout、Git、SQLite或Verification profile；Buildr、Vitest或其他Node.js框架集成 MUST通过provider/adapter完成。

#### Scenario: 独立Node.js项目消费公共入口
- **WHEN** 一个非Buildr Node.js测试项目从稳定npm子路径导入Context Runtime
- **THEN** 项目 MUST能定义内存Application Context并通过node adapter执行
- **AND** 运行时 MUST不要求Buildr Workspace或CLI存在

### Requirement: 公共Runtime必须由TypeScript权威源码生成标准ESM与类型声明
Node Test Context Runtime MUST以TypeScript作为唯一手写源码authority，并 MUST通过确定性构建生成不需要TypeScript loader或type stripping的标准ESM JavaScript和matching `.d.ts`。生成产物 MUST由drift check绑定当前源码，公共package facade MUST同时提供runtime与types condition。

#### Scenario: JavaScript消费者运行公共Runtime
- **WHEN** 一个普通Node.js项目从安装后的`@buildr-ai/buildr/test-context`导入公共API
- **THEN** Node MUST只加载生成的标准ESM JavaScript
- **AND** 项目 MUST不需要Buildr Workspace、TypeScript compiler、自定义loader或实验性type stripping

#### Scenario: TypeScript消费者编译Context测试
- **WHEN** 一个启用strict与NodeNext的外部TypeScript fixture通过package facade定义Context、依赖和typed callback
- **THEN** compiler MUST推断definition config、acquired values、alias values和lease control类型
- **AND** 非法config/value/alias使用 MUST由类型反例失败，不得退化为`any`

#### Scenario: 生成物陈旧
- **WHEN** TypeScript authority与已登记ESM或`.d.ts`任一bytes不匹配
- **THEN** Fast、Candidate或package contract MUST在消费陈旧产物前失败
- **AND** 诊断 MUST列出缺失、额外或内容漂移文件

### Requirement: 公共类型契约必须保持hook与runner结果闭合
公共声明 MUST覆盖definition/request/dependency、worker/suite/test scope、create/acquire/release/reset/inspect/destroy hooks、lease values与dirty control、Node adapter callback、Runtime event和multi-Host runner result。Runtime验证 MUST继续对非法动态输入fail closed，类型系统 MUST NOT替代运行时identity、cycle、dirty或cleanup检查。

#### Scenario: provider组合依赖Context
- **WHEN** TypeScript provider定义上层Context并引用有类型的dependency config和值
- **THEN** create hook MUST获得matching dependency value类型
- **AND** request alias映射 MUST把acquired value精确投影给test callback

#### Scenario: JavaScript传入非法动态值
- **WHEN** JavaScript消费者传入循环config、非法scope、dependency cycle或不支持的inspect结果
- **THEN** Runtime MUST保持现有closed diagnostic并在test body或错误复用前失败
- **AND** `.d.ts`存在 MUST NOT放宽任何运行时检查
