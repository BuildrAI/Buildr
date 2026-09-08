## MODIFIED Requirements

### Requirement: CLI executable 必须保持薄入口
Buildr CLI executable MUST位于 `bin/buildr.mjs`，只承担进程启动、顶层错误处理和调用 `src/bootstrap/cli/main.ts`，不得承载具体资产领域的解析、校验、诊断或写入实现；checkout 根 `buildr` 入口 MUST委托同一实现。

#### Scenario: 从 checkout 或 npm package 启动 CLI
- **WHEN** 用户通过 checkout 根 `buildr` 或 npm 安装后的 `buildr` 执行任意受支持命令
- **THEN** executable MUST将参数交给同一 Bootstrap CLI Host 和 command registry
- **AND** executable 自身 MUST NOT包含具体 Project、Service、Rule、Skill、Command、Component、OpenSpec、doctor、package 或 runtime command 的领域实现
- **AND** checkout 与 npm 入口 MUST NOT依赖已删除的 `tools/buildr`、`tools/cli` 或旧 `src/interfaces/cli` 路径

### Requirement: Test Context facade必须闭合公开JS与类型依赖
`@buildr-ai/buildr/test-context` facade MUST只重导出 generated `package/targets/test-context` 公共ESM Runtime并通过package exports关联matching types。其 source authority MUST位于 `src/infrastructure/testing/context-runtime`，其运行与声明依赖闭包 MUST不包含Buildr test provider、fixture、verification registry、CLI Application composition或未声明deep import。`package.json` 的兼容 wildcard MUST不被描述为内部源码路径的稳定公开 API，本次迁移 MUST不为旧 `src/task|workspace|agent-assets|verification|system` deep path创建 facade。

#### Scenario: 检查checkout facade
- **WHEN** 架构verifier解析`test-context.mjs`和package exports
- **THEN** facade MUST只引用已登记的生成Runtime入口
- **AND** types condition MUST解析到matching `.d.ts`且不得引用`test/`或raw `.ts`
- **AND** generated output MUST保持untracked、可删除和可重建

#### Scenario: 检查正式package facade
- **WHEN** 唯一Candidate tarball安装到没有development checkout的prefix
- **THEN** 同一subpath MUST成功完成ESM import与TypeScript consumer编译
- **AND** internal source path、Buildr provider与兼容wildcard MUST不被描述为公共Test Context API

## ADDED Requirements

### Requirement: 最终 CLI 组装必须消费具名模块能力
Bootstrap MUST通过模块 descriptor 的具名 `provides`、`requires`、CLI/HTTP/diagnostic contribution 和 lifecycle 组装 Buildr；MUST NOT通过把业务方法批量注入共享 runtime 对象来隐藏 owner。CLI Host MUST只合并、校验和分发所属模块贡献，保持公开命令、帮助、输出、错误码与退出行为不变。

#### Scenario: 扫描 Bootstrap runtime
- **WHEN** 架构验证检查 `src/bootstrap` 及全部模块入口
- **THEN** 每个业务调用 MUST可追溯到具名 capability 或 contribution
- **AND** MUST不存在 `Object.assign(runtime, moduleMethods)` 类型的业务方法目录注入

#### Scenario: 从三种入口执行 CLI
- **WHEN** 使用 development checkout、Application Payload 与 npm candidate 执行代表性命令
- **THEN** 三种入口 MUST使用相同模块 owner、命令 descriptor 和错误映射
- **AND** npm 入口 MUST不依赖 `tools/`、`test/`、active Change 或已删除旧路径

### Requirement: 工程生成与架构验证必须跟随最终路径
Buildr 的 DTO codegen、Application Payload、npm package static validation、architecture verifier 与 CI MUST以最终 `src/modules`、`tools/codegen`、`resources/runtime` 和无 tracked `package/` 的布局为唯一输入。

#### Scenario: 运行生成检查与 package check
- **WHEN** 维护者运行 declared codegen check、typecheck、architecture verification 与 `npm pack --dry-run`
- **THEN** 所有入口 MUST从后端唯一 Schema 生成或校验前后端 DTO
- **AND** 产物清单 MUST包含所需模块与资源且不包含旧路径或第二份手写协议
