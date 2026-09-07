## MODIFIED Requirements

### Requirement: Buildr Service 必须提供受约束的后端 TypeScript 静态检查
Buildr Service MUST为全部人工维护的后端、工具和测试`.ts`源码提供稳定typecheck入口，并 MUST启用`strict`、`noEmit`、`NodeNext`、`verbatimModuleSyntax`与`erasableSyntaxOnly`等约束。typecheck MUST先通过声明的生成入口物化所需DTO或公共库输出，再检查`src/**/*.ts`、`tools/**/*.ts`和`test/**/*.ts`；目录遗漏 MUST NOT使已迁移工具绕过静态检查。TypeScript compiler与Node类型 MUST只作为开发依赖，正式runtime dependency不得因此增加。

#### Scenario: 对后端 TypeScript 执行静态检查
- **WHEN** 维护者在Product固定Node环境中从不含生成物的干净checkout运行Buildr Service typecheck
- **THEN** 入口 MUST先生成所需ignored输入并让全部已登记`.ts`源码通过严格no-emit检查
- **AND** 不可擦除语法、隐式不安全类型、不符合NodeNext的模块引用或未覆盖的人工TypeScript目录 MUST使检查失败

#### Scenario: 正式运行依赖保持不变
- **WHEN** Application Payload生成runtime package metadata或npm Candidate inventory
- **THEN** TypeScript compiler、Node类型包、generator和development scripts MUST NOT成为正式运行依赖
- **AND** 正式包 MUST只携带所需生成JavaScript、公共声明与冻结资源

### Requirement: 独立公共ESM library必须与CLI Payload采用不同编译目标
Buildr Service MAY为规范明确声明的独立公共package subpath从TypeScript authority向显式ignored或隔离目标生成标准ESM JavaScript与`.d.ts`，但 MUST保持CLI Application Payload的单一CommonJS bundle与正式Host Node启动模型。公共library生成物 MUST不依赖CLI bundle、Buildr Workspace或TypeScript runtime，MUST不进入Git tracked tree，raw library `.ts` MUST不进入正式Candidate tarball。

#### Scenario: 构建Test Context公共library
- **WHEN** 维护者或Candidate builder运行Test Context生成入口并提供输出目标
- **THEN** 独立compiler config MUST从Runtime TypeScript authority生成ESM`.js`与matching`.d.ts`
- **AND** 根backend typecheck MUST继续以strict no-emit检查同一authority

#### Scenario: 构建CLI Application Payload
- **WHEN** release builder处理包含其他`.ts`生产切片的CLI模块图
- **THEN** CLI MUST继续生成单一`runtime/buildr.cjs`且不运行公共Test Context library作为CLI依赖
- **AND** library输出 MUST只由npm staging从matching生成物集合复制

#### Scenario: 检查正式tarball TypeScript内容
- **WHEN** Candidate inventory检查公共Test Context与CLI runtime
- **THEN** tarball MAY包含公共`.d.ts`但 MUST不包含Runtime authority`.ts`、TypeScript compiler或Node类型开发包
- **AND** JavaScript runtime MUST不引用`.ts`路径，Git tracked tree MUST不包含对应编译输出
