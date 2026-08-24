## ADDED Requirements

### Requirement: 唯一npm tarball必须发布公共Test Context Runtime与类型
正式`@buildr-ai/buildr` Candidate tarball MUST在既有CLI Application Payload之外包含`@buildr-ai/buildr/test-context` facade、生成的标准ESM JavaScript和matching `.d.ts`，并 MUST从package exports提供稳定`import`与`types`解析。该公共library MUST由同一Candidate artifact生成和发布，不得形成第二tarball或发布流程。

#### Scenario: 外部项目安装Candidate并运行Test Context
- **WHEN** verifier在隔离prefix安装唯一Candidate tarball并从普通Node.js项目导入Test Context subpath
- **THEN** 内存Context、lease、reset与Host runner代表行为 MUST成功
- **AND** 执行 MUST不读取development checkout、Buildr Workspace或CLI Application Payload内部模块

#### Scenario: 外部TypeScript项目安装Candidate
- **WHEN** strict NodeNext fixture只依赖安装后的package编译typed Context测试
- **THEN** compiler MUST从exports types condition解析matching声明并通过正例
- **AND** 类型反例 MUST按预期失败，不能通过deep import或本地源码补齐类型

#### Scenario: Candidate inventory保持边界
- **WHEN** release artifact检查新增公共library文件
- **THEN** inventory MUST包含facade、生成JS和`.d.ts`
- **AND** MUST排除raw Runtime `.ts`、Buildr `test/context` provider、fixtures、verification registry、TypeScript compiler与开发类型依赖
