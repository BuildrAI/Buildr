## MODIFIED Requirements

### Requirement: CLI runtime 模块必须完整发布且不扩大公开 API
Buildr npm package MUST 包含 `bin/buildr.mjs` 引用的完整 `src/` runtime dependency closure、运行所需 `resources/`、`web-dist/` 与明确 deferred runtime assets，并 MUST 让 checkout 与 npm 安装入口使用同一命令实现；内部 modules 与资源路径不得因此成为面向使用者的公开编程 API，只有规范和文档明确声明的独立公共 facade 可以成为稳定 package subpath。

#### Scenario: 从 tarball 安装并执行 CLI
- **WHEN** 维护者构建 tarball并在不依赖 development checkout 的干净目录安装
- **THEN** tarball MUST 包含 executable 引用的全部内部 runtime modules 和已声明资源
- **AND** 安装后的代表性 help、只读、mutation、runtime、package 与 doctor 命令 MUST 与 checkout 入口保持行为等价
- **AND** 安装后命令 MUST NOT 依赖 `test/` 或 `tools/`

#### Scenario: 使用者查看 package public surface
- **WHEN** 使用者检查 package metadata 或公开文档
- **THEN** package MUST 继续承诺 `buildr` bin、已记录的 CLI 产品表面和明确声明的独立公共 facade
- **AND** `@buildr-ai/buildr/test-context` MUST 只通过顶层 facade 暴露已记录的 Node Test Context Runtime API
- **AND** 内部源码与资源路径以及兼容性 deep subpaths MUST NOT 被描述为稳定 public API
