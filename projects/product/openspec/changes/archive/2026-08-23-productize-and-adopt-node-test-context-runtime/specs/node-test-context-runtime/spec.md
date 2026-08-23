## ADDED Requirements

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
