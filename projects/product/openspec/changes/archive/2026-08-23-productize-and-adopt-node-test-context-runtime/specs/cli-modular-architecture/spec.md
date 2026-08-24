## ADDED Requirements

### Requirement: Test Context facade必须闭合公开JS与类型依赖
`@buildr-ai/buildr/test-context` facade MUST只重导出生成的公共ESM Runtime并通过package exports关联matching types。其运行与声明依赖闭包 MUST不包含Buildr test provider、fixture、verification registry、CLI Application composition或未声明deep import。

#### Scenario: 检查checkout facade
- **WHEN** 架构verifier解析`test-context.mjs`和package exports
- **THEN** facade MUST只引用已登记的生成Runtime入口
- **AND** types condition MUST解析到matching `.d.ts`且不得引用`test/`或raw `.ts`

#### Scenario: 检查正式package facade
- **WHEN** 唯一Candidate tarball安装到没有development checkout的prefix
- **THEN** 同一subpath MUST成功完成ESM import与TypeScript consumer编译
- **AND** internal source path、Buildr provider与兼容wildcard MUST不被描述为公共Test Context API
