## MODIFIED Requirements

### Requirement: 公共Runtime必须由TypeScript权威源码生成标准ESM与类型声明
Node Test Context Runtime MUST以TypeScript作为唯一手写源码authority，并 MUST通过接受显式输出目标的确定性构建生成不需要TypeScript loader或type stripping的标准ESM JavaScript和matching`.d.ts`。生成物 MUST进入精确ignored本地目录或正式Candidate隔离暂存，MUST不进入Git tracked tree；公共package facade MUST同时提供runtime与types condition。

#### Scenario: JavaScript消费者运行公共Runtime
- **WHEN** 一个普通Node.js项目从安装后的`@buildr-ai/buildr/test-context`导入公共API
- **THEN** Node MUST只加载Candidate生成并冻结的标准ESM JavaScript
- **AND** 项目 MUST不需要Buildr Workspace、TypeScript compiler、自定义loader或实验性type stripping

#### Scenario: TypeScript消费者编译Context测试
- **WHEN** 一个启用strict与NodeNext的外部TypeScript fixture通过package facade定义Context、依赖和typed callback
- **THEN** compiler MUST从同一Candidate生成的types condition推断definition config、acquired values、alias values和lease control类型
- **AND** 非法config/value/alias使用 MUST由类型反例失败，不得退化为`any`

#### Scenario: 生成物陈旧
- **WHEN** 相同authority向两个全新目标生成的ESM/`.d.ts`文件集合或bytes不同，或者Candidate缺少任一公开依赖闭包
- **THEN** Fast、Candidate或package contract MUST在消费前失败并报告差异
- **AND** MUST NOT通过仓库副本、本地cache或raw TypeScript补齐正式输出
