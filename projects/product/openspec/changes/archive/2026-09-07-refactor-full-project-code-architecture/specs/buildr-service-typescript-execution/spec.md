## MODIFIED Requirements

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

### Requirement: TypeScript 源码权威必须闭合且不改变公开行为
人工维护的 `src/`、`tools/`和普通 `test/` 实现 MUST以 `.ts` 为唯一源码权威。迁移 MUST NOT改变公开 CLI、HTTP、JSON、错误、数据模型、SQLite、事务、writer authority、运行副作用或 Verification 选择语义。Git tracked `.mjs` MUST只能是稳定公共薄入口或专门证明 JavaScript 消费兼容性的夹具，并由闭合允许清单约束。

#### Scenario: 源码模块完成迁移
- **WHEN** 生产、工具或普通测试模块从旧路径迁移
- **THEN** 全部直接 import、测试和 Verification owner selector MUST原子更新到新路径
- **AND** 旧路径 MUST不再作为实现或兼容副本存在

#### Scenario: 非 TypeScript 文件保持闭合允许清单
- **WHEN** verifier 扫描 Git tracked Buildr Service 文件
- **THEN** 除 `bin/buildr.mjs`、`test-context.mjs` 与明确 JavaScript 兼容夹具外不得出现 `.mjs`
- **AND** 旧 `package/launchers/manage.mjs` 与新的生产、工具或普通测试 `.mjs` MUST使静态检查失败
