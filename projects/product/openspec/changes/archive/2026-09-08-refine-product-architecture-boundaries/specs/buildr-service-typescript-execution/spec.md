## MODIFIED Requirements

### Requirement: TypeScript 源码权威必须闭合且不改变公开行为
人工维护的 `src/`、`tools/`和普通 `test/` 实现 MUST以 `.ts` 为唯一源码权威。迁移 MUST NOT改变公开 CLI、HTTP、JSON、错误、数据模型、SQLite、事务、writer authority、运行副作用或 Verification 选择语义。Git tracked `.mjs` MUST只能是稳定公共薄入口或专门证明 JavaScript 消费兼容性的夹具，并由闭合允许清单约束。

#### Scenario: 源码模块完成迁移
- **WHEN** 生产、工具或普通测试模块从旧路径迁移
- **THEN** 全部直接 import、测试和 Verification owner selector MUST原子更新到新路径
- **AND** 旧路径 MUST不再作为实现或兼容副本存在

#### Scenario: 非 TypeScript 文件保持闭合允许清单
- **WHEN** verifier 扫描 Git tracked Buildr Service 文件
- **THEN** 除 `bin/buildr.mjs` 与明确 JavaScript 兼容夹具外不得出现 `.mjs`
- **AND** 旧 `package/launchers/manage.mjs` 与新的生产、工具或普通测试 `.mjs` MUST使静态检查失败

