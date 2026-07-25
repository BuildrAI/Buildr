# Buildr Product 源码布局

## Purpose

定义 Buildr Product 可执行入口、运行源码、测试验证、仓库脚本和交付资产的生命周期边界，以及源码分层和依赖方向。
## Requirements
### Requirement: Product 顶层目录必须按生命周期分离
Buildr Product MUST 使用 `bin/`、`src/`、`test/`、`scripts/` 和 `package/` 分别承载可执行入口、产品源码、测试验证、仓库脚本和交付源资产，并 MUST NOT 使用 `tools/` 承载这些职责。

#### Scenario: 检查完成迁移的 Product checkout
- **WHEN** 架构 verifier 扫描 Product 顶层和 tracked files
- **THEN** `bin/`、`src/`、`test/`、`scripts/` 和 `package/` MUST 各自只包含其声明生命周期内的内容
- **AND** `tools/` MUST 不存在
- **AND** tracked source、test、package metadata、docs 和 active OpenSpec artifacts MUST NOT 引用旧 `tools/` 内部路径

### Requirement: Product 源码必须按职责和依赖方向分层
Buildr `src/` MUST 将应用用例、基础设施 adapters 和外部接口分别组织到 `application/`、`infrastructure/` 和 `interfaces/`；真实的存储无关领域模型出现时 MUST 进入 `domain/`。Buildr MUST 保持接口调用应用用例、应用组合领域与基础设施能力、纯领域模型不依赖 adapters 的显式边界。

#### Scenario: CLI 或本机应用调用 Workspace 用例
- **WHEN** CLI、HTTP 或 Web adapter 读取或修改 Workspace
- **THEN** interface MUST 调用 `application` 暴露的用例
- **AND** domain MUST NOT 导入 CLI、HTTP、Web、filesystem、process、runtime 或测试模块
- **AND** application MUST NOT 依赖具体 interface implementation

#### Scenario: 迁移带文件操作的旧领域 handler
- **WHEN** 旧模块同时包含用例编排、filesystem 读取或 mutation
- **THEN** 模块 MUST 进入 application owner，而不是仅因旧目录名进入 `domain/`
- **AND** Product MUST NOT 为目录对称创建没有真实模型职责的空 domain 层

#### Scenario: 架构 verifier 扫描 imports
- **WHEN** Product 验证检查 `src/` import graph
- **THEN** verifier MUST 拒绝反向依赖、循环依赖和绕过 application composition 的跨领域隐式调用
- **AND**诊断 MUST 标识违规 source 与 target module

### Requirement: 通用代码必须具有明确所有权
Buildr Product MUST 将 filesystem、process、network、runtime、CLI output、应用 ports 和领域公共原语放入对应职责目录，并 MUST NOT 建立顶层或 `src/shared/` 作为无语义公共依赖目录。

#### Scenario: 新增跨模块 helper
- **WHEN** 维护者增加被多个模块复用的 helper
- **THEN** helper MUST 根据其领域、应用、基础设施或 interface 语义进入明确 owner
- **AND** 架构 verifier MUST 在发现顶层或 `src/shared/` 时失败

### Requirement: 仓库脚本和测试不得成为产品运行时依赖
Buildr `scripts/` 与仓库 verification MUST 只能作为维护、测试、分发或发布入口调用产品源码，`bin/` 和 `src/` MUST NOT 导入 `scripts/`、`test/` 或 checkout-only dependencies。

#### Scenario: 从 npm tarball 执行产品命令
- **WHEN** 用户在不含 development checkout 的临时 prefix 安装 tarball 并运行代表性 `buildr` 命令
- **THEN** 命令 MUST 只使用 tarball 中的 `bin/`、`src/`、发布文档和 `package/` assets
- **AND** 命令 MUST NOT 读取 `test/`、`scripts/`、OpenSpec change 或仓库根外部文件

### Requirement: package 目录必须继续表示交付源资产
Buildr Product MUST 保留顶层 `package/` 作为 init、sync、runtime 和 bootstrap 所需交付源资产的事实目录，并 MUST NOT 将构建脚本、npm runtime source 或测试 fixtures 混入该目录。

#### Scenario: 维护者检查 package 边界
- **WHEN** package verifier 检查 `package/manifest.yml` 和 targets
- **THEN** `package/` MUST 只包含交付映射、workspace/runtime/bootstrap 源资产及其维护说明
- **AND** 构建和发布脚本 MUST 位于 `scripts/`
- **AND** 测试样本 MUST 位于 `test/fixtures/`

### Requirement: Project 产品切片必须遵守新源码分层
Buildr MUST separate Project Domain, Application, filesystem/Git Infrastructure and CLI/HTTP/Web Interfaces.

#### Scenario: Project Domain 保持纯净
- **WHEN** architecture verifier scans Project Domain imports
- **THEN** Domain MUST NOT import filesystem, YAML, Git process, HTTP, CLI, runtime, tests or repository implementations
- **AND** Domain MUST contain only Project entity, ProjectSource value object and pure validation

#### Scenario: Project Interfaces 读取和修改
- **WHEN** CLI, doctor, HTTP or Web handles Project data
- **THEN** interface MUST call Project Application use cases
- **AND** interface MUST NOT directly parse or write `projects/manifest.yml` or execute Git observation commands

#### Scenario: Project adapters 实现 ports
- **WHEN** Application reads/writes registry or queries actual Git state
- **THEN** filesystem repository MUST own path/YAML/atomic revision details and Git observer MUST own bounded process execution
- **AND** adapters MUST NOT decide editable field policy, migration authorization or diagnostic severity

### Requirement: Service 产品切片必须遵守新源码分层
Service 产品能力 MUST 将纯 Domain、Application、filesystem/Git Infrastructure 与 CLI/HTTP/Web Interfaces 分离。

#### Scenario: Domain 依赖检查
- **WHEN** 架构验证扫描 `src/domain/service`
- **THEN** Service Domain MUST NOT 导入 YAML、filesystem、Git、HTTP 或 CLI 模块

#### Scenario: Interface 读取 Service
- **WHEN** CLI、doctor 或 HTTP 读取或修改 Service
- **THEN** interface MUST 通过 Service Application 用例
- **AND** MUST NOT 新增直接解析 `services/manifest.yml` 的实现

### Requirement: Product Project 治理根与可执行 Service 根必须分离
Buildr 自举 Product MUST 将项目治理资产保留在 Product Project root，并 MUST 将 npm package、CLI、运行源码、测试、维护脚本和交付源资产放入已登记的 Buildr Service root，二者不得形成双重实现事实源。Product Project root 在完成 package root 迁移后 MUST NOT 保留 `node_modules` 或其 `.bin` 可执行入口。

#### Scenario: 检查 Product Project root
- **WHEN** 架构 verifier 扫描 `projects/product/`
- **THEN** Project root MUST 保留 `AGENTS.md`、OpenSpec、Project capabilities、Command requirements、Service registry 和项目级文档
- **AND** Project root MUST NOT 继续拥有 npm package metadata、`src/`、`bin/`、`test/`、`scripts/`、`package/` 或 `node_modules`

#### Scenario: 检测已废弃 package root 的遗留依赖
- **WHEN** 架构 verifier 在不含 package metadata 的 `projects/product/` 发现 `node_modules`
- **THEN** verifier MUST 失败并明确该目录是已废弃 package root 的遗留依赖
- **AND** 诊断 MUST 指向 `projects/product/services/buildr` 作为唯一允许安装和解析 Buildr 开发依赖的 package root
- **AND** 诊断 MUST NOT 建议 `buildr update`、`buildr sync` 或 doctor 自动删除该目录

#### Scenario: 检查 Buildr Service root
- **WHEN** verifier 扫描 `projects/product/services/buildr/`
- **THEN** 该目录 MUST 是 `@buildr-ai/buildr` package、运行源码、验证、维护脚本和交付源资产的唯一源码根
- **AND** Service root MUST 提供 Service-level `AGENTS.md`

#### Scenario: 从旧开发入口运行 Buildr
- **WHEN** 用户或 Agent 执行 `projects/product/buildr`
- **THEN** 该入口 MUST 作为薄兼容 bridge 调用 Buildr Service 的 CLI
- **AND** bridge MUST NOT 复制运行实现或建立第二份 package root
