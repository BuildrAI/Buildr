## MODIFIED Requirements

### Requirement: Buildr Service 必须提供受约束的后端 TypeScript 静态检查
Buildr Service MUST为全部人工维护的后端、工具和测试`.ts`源码提供稳定typecheck入口。`src/**/*.ts`与`tools/**/*.ts` MUST启用`strict`、`noEmit`、`NodeNext`、`verbatimModuleSyntax`与`erasableSyntaxOnly`等约束；`test/**/*.ts`在过渡期可以由独立配置只检查语法与模块解析，其行为正确性仍必须由真实测试运行证明。typecheck MUST先通过声明的生成入口物化所需DTO或公共库输出，目录遗漏 MUST NOT使已迁移源码绕过对应检查。TypeScript compiler与Node类型 MUST只作为开发依赖，正式runtime dependency不得因此增加。

#### Scenario: 对后端 TypeScript 执行静态检查
- **WHEN** 维护者在满足Product最低版本要求的实际Node环境中从不含生成物的干净checkout运行Buildr Service typecheck
- **THEN** 入口 MUST先生成所需ignored输入，并让生产与工具源码通过严格no-emit检查、测试源码通过独立过渡检查
- **AND** 不可擦除语法、生产或工具的隐式不安全类型、不符合NodeNext的模块引用或未覆盖的人工TypeScript目录 MUST使检查失败

#### Scenario: 正式运行依赖保持不变
- **WHEN** Application Payload生成runtime package metadata或npm Candidate inventory
- **THEN** TypeScript compiler、Node类型包、generator和development scripts MUST NOT成为正式运行依赖
- **AND** 正式包 MUST只携带所需生成JavaScript、公共声明与冻结资源

### Requirement: Development checkout 必须原生执行 TypeScript 源码图
Buildr development checkout MUST 使用开发 Node 范围内选定的 Node 原生加载仅含可擦除类型语法的 `.ts`。开发 Node 范围指稳定版本不低于 Product 声明的最低版本（`.node-version`），当前为 `>=24.15.0`，不设主版本上限；声明版本继续作为受控供给环境的锚点。人工维护的生产、工具和普通测试源码 MUST 使用显式 `.ts` 相对扩展名，不得依赖额外 loader、路径别名或运行时转换器。

#### Scenario: 稳定入口加载 TypeScript 模块
- **WHEN** 开发 Node 范围内选定的 Node 从稳定 `bin/buildr.mjs` 进入 CLI Host，并继续执行 `.ts` 源码图
- **THEN** 代表性 CLI 命令 MUST 成功并保持既有输出协议
- **AND** 进程 MUST NOT加载 `tsx`、`ts-node` 或自定义 loader

#### Scenario: node:test 加载真实 TypeScript 切片
- **WHEN** 维护者通过开发 Node 范围内选定的 Node 运行覆盖该生产切片的 `node:test`
- **THEN** 测试 MUST 直接加载同一 `.ts` 源码并验证公开结果
- **AND** 测试 MUST NOT 使用预编译副本或重复实现替代被测模块
