## Why

Buildr 的一级服务边界已经成立，但后端生产源码仍同时使用业务目录、`system/`、含混的 `package/` 与宽泛共享运行时；智能体资产、文件系统、诊断、项目测试、OpenSpec 和公共 Web 宿主内部还存在职责混合或隐藏依赖。现在需要在保持外部行为、数据语义和安全边界不变的前提下完成一次全项目结构收敛，并让代码地图、技术图与当前实现一致。

## What Changes

- 将 Buildr Service 的产品实现收敛为 `src/bootstrap/`、`src/modules/`、`src/web/` 与 `src/infrastructure/`，把 Workspace、Task、Agent Assets、Project Testing、Installation、Diagnostics、Publication 与通用 OpenSpec 能力放入明确模块；不机械创建空层或单文件目录。
- 取消笼统 `src/system/` 与长期源码分类 `package/`；将仍需发布的运行时实现迁入所属产品模块，将启动器构建程序迁入 `tools/`，将文件型交付内容迁入 `resources/`，并同步 npm 打包边界。
- 重构智能体资产内部的参数/协议入口、应用规则、Manifest 持久化、执行与运行时投射边界；把能力绑定和依赖解析从投射技术目录提升为模块业务语义。
- 拆解通用文件系统聚合，令通用文件机制、Workspace 身份与规则区块、诊断辅助分别归属正确 owner；用显式模块端口替代共享运行时的宽泛方法注入。
- 将诊断中的业务归一化下沉至所属模块；区分项目测试声明管理、Buildr 自测调度与任务验证报告；整理 Change/OpenSpec 协议、文件访问、收敛写入和恢复边界；移除公共 Web Router 的业务特判。
- 将后端接口 DTO 生成与检查程序从 `tools/contracts/` 迁入 `tools/codegen/`，同步所有生成入口、消费者、构建、测试、发布与文档引用。
- 按证明对象整理前端、后端和跨服务测试及工程工具；保持测试用例属于对应服务、项目级端到端流程由 Product 验收，不新增用户项目完整测试生命周期能力。
- 交付与最终代码一致的分层代码地图、Archify 技术图、当前态架构和服务说明，并更新规范、声明、CI、构建与文档导航。
- **无破坏性变更**：公开 CLI、HTTP、JSON、SQLite、文件格式、锁、事务、条件写入、恢复、安装与托管行为保持兼容；对外必要兼容入口保留，内部旧路径和无用转发在消费者迁移后删除。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-source-layout`: 将已完成迁移后的唯一生产源码布局、模块根、工程工具、资源与 deferred `package/` 退出条件更新为本次最终结构。
- `cli-modular-architecture`: 更新模块注册、架构验证、生成工具与发布物对最终模块路径和显式依赖的约束。
- `agent-assets-module-architecture`: 明确智能体资产内部的应用、领域规则、Manifest 持久化、能力解析和运行时投射边界。
- `infrastructure-boundaries`: 收紧通用文件系统、共享运行时与业务模块之间的唯一技术机制和依赖边界。
- `runtime-host-doctor-module-architecture`: 将诊断归入独立 Diagnostics 模块，并要求公共 Web 宿主不含业务协议特判。
- `system-installation-module-architecture`: 取消 `system/installation` 路径和 `package/` deferred 源码，保持 Installation 的唯一 owner 与发布兼容。
- `task-execution-module-boundaries`: 更新 Task、Project Testing、Worktree、Preview 与通用 OpenSpec 的最终静态 owner 和跨模块协作。
- `buildr-web-service`: 明确剩余页面与客户端按完整功能归位，以及前后端和项目级端到端测试责任。
- `project-test-capabilities`: 明确 `project-testing` 只拥有项目测试声明管理，工程自测调度与任务验证报告各自独立。
- `product-knowledge-organization`: 要求完整代码地图、最终架构说明、技术图和导航以真实源码与规范为依据保持一致。
- `buildr-package-assets`: 将产品入口 Agent Skill 的权威源从 deferred package 子树迁入文件型交付资源。
- `buildr-product-capability-sync`: 更新内置产品 Skill 的安装来源，同时保持 Workspace 源资产和 runtime 投射生命周期。
- `buildr-service-typescript-execution`: 将 Launcher TypeScript 检查迁到工程工具，并收紧迁移后的最小 `.mjs` 允许清单。
- `npm-cli-package`: 更新薄 CLI 委托路径，并明确兼容 wildcard 不构成内部源码路径的稳定 API。
- `task-lifecycle-core-module-architecture`: 更新 Task 生命周期核心的最终模块路径。
- `task-review-module-architecture`: 更新 Task Review 分层和模块入口的最终路径。
- `workspace-daily-progress-module-architecture`: 更新 Daily Progress 纵向切片的最终 Workspace 模块路径。

## Impact

- 代码：`projects/product/services/buildr/{bin,src,tools,test,resources,docs,package}`、`projects/product/services/buildr-web/{src,test}`。
- 治理与工程：`projects/product/{openspec,knowledge,docs,preparation.yml,verification.yml}`、根 `.github/` 以及 npm 构建、代码生成、候选制品与发布清单。
- 数据与公开接口：不修改既有业务语义、公开协议、SQLite schema、资源逻辑身份或 writer authority；迁移期间重点验证锁、事务、管理保护、并发检查、失败恢复和隔离验证。
- 非目标：用户项目完整测试生命周期产品能力、代码地图/当前态模型自动发现与生成机制、技术图自动同步机制、正式版本发布和父任务完成。
