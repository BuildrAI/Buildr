# buildr-service-typescript-execution Specification

## Purpose

定义 Buildr Service 后端 TypeScript 的静态约束、Node 24 原生开发执行、单一源码权威、测试入口与正式发布物等价边界。

## Requirements

### Requirement: Buildr Service 必须提供受约束的后端 TypeScript 静态检查
Buildr Service MUST为全部人工维护的后端、工具和测试`.ts`源码提供稳定typecheck入口。`src/**/*.ts`与`tools/**/*.ts` MUST启用`strict`、`noEmit`、`NodeNext`、`verbatimModuleSyntax`与`erasableSyntaxOnly`等约束；`test/**/*.ts`在过渡期可以由独立配置只检查语法与模块解析，其行为正确性仍必须由真实测试运行证明。typecheck MUST先通过声明的生成入口物化所需DTO或公共库输出，目录遗漏 MUST NOT使已迁移源码绕过对应检查。TypeScript compiler与Node类型 MUST只作为开发依赖，正式runtime dependency不得因此增加。

#### Scenario: 对后端 TypeScript 执行静态检查
- **WHEN** 维护者在Product固定Node环境中从不含生成物的干净checkout运行Buildr Service typecheck
- **THEN** 入口 MUST先生成所需ignored输入，并让生产与工具源码通过严格no-emit检查、测试源码通过独立过渡检查
- **AND** 不可擦除语法、生产或工具的隐式不安全类型、不符合NodeNext的模块引用或未覆盖的人工TypeScript目录 MUST使检查失败

#### Scenario: 正式运行依赖保持不变
- **WHEN** Application Payload生成runtime package metadata或npm Candidate inventory
- **THEN** TypeScript compiler、Node类型包、generator和development scripts MUST NOT成为正式运行依赖
- **AND** 正式包 MUST只携带所需生成JavaScript、公共声明与冻结资源

### Requirement: Development checkout 必须原生执行 TypeScript 源码图
Buildr development checkout MUST 使用 Product 声明的 Node 24.15.0 原生加载仅含可擦除类型语法的 `.ts`。人工维护的生产、工具和普通测试源码 MUST 使用显式 `.ts` 相对扩展名，不得依赖额外 loader、路径别名或运行时转换器。

#### Scenario: 稳定入口加载 TypeScript 模块
- **WHEN** 固定 Node 从稳定 `bin/buildr.mjs` 进入 CLI Host，并继续执行 `.ts` 源码图
- **THEN** 代表性 CLI 命令 MUST 成功并保持既有输出协议
- **AND** 进程 MUST NOT加载 `tsx`、`ts-node` 或自定义 loader

#### Scenario: node:test 加载真实 TypeScript 切片
- **WHEN** 维护者通过固定 Node 运行覆盖该生产切片的 `node:test`
- **THEN** 测试 MUST 直接加载同一 `.ts` 源码并验证公开结果
- **AND** 测试 MUST NOT 使用预编译副本或重复实现替代被测模块

### Requirement: 正式 npm package 必须保持 TypeScript 源码无关的运行形态
Buildr Application Payload MUST 在构建阶段吸收被引用的 `.ts` 并继续生成单一、无拆分、无 sourcemap 的 Node 24 CommonJS runtime。正式 npm candidate MUST 只执行该冻结 runtime，MUST NOT 直接执行或携带后端 `.ts` 源码、TypeScript compiler或开发类型依赖。

#### Scenario: Application Payload 构建混合模块图
- **WHEN** Payload builder 从现有 release entry 打包包含 `.ts` 的生产依赖闭包
- **THEN** `runtime/buildr.cjs` MUST 构建成功且不保留 TypeScript 类型语法
- **AND** Payload 中代表性 CLI identity 结果 MUST 与 development checkout 等价

#### Scenario: npm candidate 在干净环境运行
- **WHEN** candidate tarball 安装到不含 development checkout、TypeScript compiler或 Service `node_modules` 的隔离 prefix
- **THEN** 已安装 `buildr` MUST 由兼容 Host Node 通过 CommonJS Application Payload 执行代表性 CLI 命令
- **AND** tarball inventory MUST NOT包含后端 `.ts`、TypeScript compiler或 Node 类型包

### Requirement: TypeScript 源码权威必须闭合且不改变公开行为
人工维护的 `src/`、`tools/`和普通 `test/` 实现 MUST 以 `.ts` 为唯一源码权威。迁移 MUST NOT 改变公开 CLI、HTTP、JSON、错误、数据模型、SQLite、事务、writer authority、运行副作用或 Verification 选择语义。Git tracked `.mjs` MUST 只能是稳定公共薄入口、自举更新前兼容入口或专门证明 JavaScript 消费兼容性的夹具，并由闭合允许清单约束。

#### Scenario: 源码模块完成迁移
- **WHEN** 生产、工具或普通测试模块从 `.mjs` 迁移到 `.ts`
- **THEN** 全部直接 import、测试和 Verification owner selector MUST 原子更新到新扩展名
- **AND** 旧路径 MUST 不再作为实现或兼容副本存在

#### Scenario: 非 TypeScript 文件保持闭合允许清单
- **WHEN** verifier 扫描 Git tracked Buildr Service 文件
- **THEN** 除 `bin/buildr.mjs`、`test-context.mjs`、`package/launchers/manage.mjs` 与明确 JavaScript 兼容夹具外不得出现 `.mjs`
- **AND** 新的生产、工具或普通测试 `.mjs` MUST 使静态检查失败

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
