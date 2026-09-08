## MODIFIED Requirements

### Requirement: CLI runtime 模块必须完整发布且不扩大公开 API
Buildr npm package MUST 包含 `bin/buildr.mjs` 引用的完整 `src/` runtime dependency closure、运行所需 `resources/`、`web-dist/` 与明确 deferred runtime assets，并 MUST 让 checkout 与 npm 安装入口使用同一命令实现；内部 modules 与资源路径不得因此成为面向使用者的公开编程 API，只有规范和文档明确声明的独立公共 facade 可以成为稳定 package subpath。

#### Scenario: 从 tarball 安装并执行 CLI
- **WHEN** 维护者构建 tarball并在不依赖 development checkout 的干净目录安装
- **THEN** tarball MUST 包含 executable 引用的全部内部 runtime modules 和已声明资源
- **AND** 安装后的代表性 help、只读、mutation、runtime、package build 与 doctor 命令 MUST 与 checkout 入口保持行为等价
- **AND** 安装后产品命令 MUST NOT 依赖 `test/` 或 `tools/`；维护者的 `package check` 属于开发工程入口，无开发检出时 MUST明确提示所需环境

#### Scenario: 使用者查看 package public surface
- **WHEN** 使用者检查 package metadata 或公开文档
- **THEN** package MUST 继续承诺 `buildr` bin、已记录的 CLI 产品表面和明确声明的独立公共 facade
- **AND** `@buildr-ai/buildr/test-context` MUST 只通过 package exports 映射的生成公共入口暴露已记录的 Node Test Context Runtime API
- **AND** 内部源码与资源路径以及兼容性 deep subpaths MUST NOT 被描述为稳定 public API

### Requirement: Test Context facade必须闭合公开JS与类型依赖
`@buildr-ai/buildr/test-context` 公开入口 MUST由 package exports 直接映射 generated `build/test-context/public.js` 与 `public.d.ts`，保持原 facade 的公开 JavaScript 导出集合，不保留手写根 `test-context.mjs`；原物理入口只允许在正式 staging 生成兼容文件。其 source authority MUST位于 `src/infrastructure/testing/context-runtime`，其运行与声明依赖闭包 MUST不包含Buildr test provider、fixture、verification registry、CLI Application composition或未声明deep import。`package.json` 的兼容 wildcard MUST不被描述为内部源码路径的稳定公开 API，本次迁移 MUST不为旧 `src/task|workspace|agent-assets|verification|system` deep path创建 facade。

#### Scenario: 检查checkout facade
- **WHEN** 架构verifier解析package exports及生成的公共入口
- **THEN** 公开入口 MUST只引用已登记的生成Runtime，不要求根手写转发文件存在
- **AND** types condition MUST解析到matching `.d.ts`且不得引用`test/`或raw `.ts`
- **AND** generated output MUST保持untracked、可删除和可重建

#### Scenario: 检查正式package facade
- **WHEN** 唯一Candidate tarball安装到没有development checkout的prefix
- **THEN** 同一subpath MUST成功完成ESM import与TypeScript consumer编译
- **AND** internal source path、Buildr provider与兼容wildcard MUST不被描述为公共Test Context API
