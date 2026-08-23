# Buildr CLI 模块化架构

## Purpose

定义 Buildr CLI 的薄 executable、内部模块分层、依赖方向、行为兼容、npm runtime 发布完整性和自动架构门禁。

## Requirements

### Requirement: CLI executable 必须保持薄入口
Buildr CLI executable MUST 位于 `bin/buildr.mjs`，只承担进程启动、顶层错误处理和调用 `src/interfaces/cli` command dispatcher，不得承载具体资产领域的解析、校验、诊断或写入实现；checkout 根 `buildr` 入口 MUST 委托同一实现。

#### Scenario: 从 checkout 或 npm package 启动 CLI
- **WHEN** 用户通过 checkout 根 `buildr` 或 npm 安装后的 `buildr` 执行任意受支持命令
- **THEN** executable MUST 将参数交给同一 `src/interfaces/cli` runtime 和 command registry
- **AND** executable 自身 MUST NOT 包含具体 Project、Service、Rule、Skill、Command、Component、OpenSpec、doctor、package 或 runtime command 的领域实现
- **AND** checkout 与 npm 入口 MUST NOT 依赖已删除的 `tools/buildr` 或 `tools/cli` 路径

### Requirement: CLI 模块必须具有单向依赖和明确领域所有权
Buildr CLI runtime MUST 将 `interfaces/cli`、application composition、domain 与 infrastructure 分层，并 MUST 保持从 interface 经 application 到 domain/ports 的显式依赖；每个领域的 manifest 语义、校验和 mutation handler MUST 由对应 domain 或 application owner 唯一维护。

#### Scenario: 领域命令调用基础设施
- **WHEN** Rules、Skills、Commands、Components、OpenSpec contract、workspace registry 或 runtime 领域执行解析、校验或受管写入
- **THEN** CLI interface MUST 调用 application 用例
- **AND** application MUST 通过显式 port 使用 filesystem、process、network 或 runtime infrastructure
- **AND** domain MUST NOT 反向导入 application、infrastructure 或 interface

#### Scenario: doctor、sync 或 package 组合多个领域
- **WHEN** doctor、sync/update 或 package maintenance 需要聚合多个领域的结果
- **THEN** 聚合 MUST 发生在显式 application composition 模块
- **AND** 领域模块 MUST NOT 通过循环 import、interface import 或隐式共享全局相互调用

### Requirement: 模块化重构必须保持 CLI 可观察行为兼容
Buildr MUST 在模块化迁移前后保持现有 public、legacy compatibility 和 internal/maintenance CLI 的命令路径、参数语义、help、stdout/stderr、退出状态、JSON schema、文件结果和失败回滚行为，除非另有独立 OpenSpec change 明确修改对应契约。

#### Scenario: 受支持命令从新模块运行
- **WHEN** 用户或 Agent 使用现有有效参数执行任一受支持命令
- **THEN** 重构后的 CLI MUST 产生与重构前相同语义的输出和状态变更
- **AND** source mutation、atomic write、transaction、integrity 与 fail-closed 约束 MUST 保持有效

#### Scenario: 无效输入和帮助请求
- **WHEN** 用户请求根/主题帮助，或提供未知命令、缺失参数、非法 option、unsupported adapter 等无效输入
- **THEN** CLI MUST 保持既有输出通道、退出状态和无副作用契约

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

### Requirement: CLI 架构和 mutation 边界必须由自动验证保护
Buildr 产品验证 MUST 自动检查 `bin` 薄入口、command 唯一登记、`src` 单向依赖、明确基础设施 owner、关键 facade 职责、npm runtime inventory、根工程生命周期、产品 verifier 与仓库 verification 边界和直接文件写入边界，并 MUST 在 runtime 依赖 `tools/`/`test/`、出现无所有权 shared、未获许可的 legacy package 文件、旧资源/Web dist 引用、漏发运行时文件、验证流程重新内嵌到聚合入口或绕过受管 mutation primitive 时失败。

#### Scenario: 维护者运行产品验证
- **WHEN** 维护者运行 CLI 架构专项检查或产品完整验证
- **THEN** verifier MUST 扫描全部发布 `bin/` 与 `src/` runtime modules及根工程路径 consumer
- **AND** verifier MUST 对不符合分层、显式依赖、facade、verifier ownership、deferred allowlist 或 mutation 白名单的实现返回非零状态和可定位诊断
- **AND** verifier MUST 对 runtime 引用 `tools/`/`test/`、旧资源路径或旧 Web dist 路径失败

#### Scenario: package check 聚合发布验证
- **WHEN** 维护者运行 `buildr package check`
- **THEN** package maintenance application MUST 只组合位于 `src` 的产品 verifier
- **AND** command handler MUST NOT 导入 `test/verification` 或重新内嵌其他领域的完整实现

#### Scenario: 运行细粒度自动测试
- **WHEN** 维护者运行产品完整验证或单独运行 unit test 入口
- **THEN** Buildr MUST 使用 `test/` 下的稳定入口验证解析、路径选择、计划生成和架构约束
- **AND** 需要完整临时 workspace 或真实 CLI 进程的端到端行为 MUST 继续由场景化 integration 或 focused verifier 覆盖

#### Scenario: 检查稳定 facade
- **WHEN** 架构 verifier 检查 package maintenance、doctor、runtime Skill renderer 或 Candidate 聚合入口
- **THEN** 这些入口 MUST 只承担参数接入、模块组合、兼容导出或场景调度
- **AND** 具体静态校验、诊断、来源解析、render plan 或长场景实现 MUST 位于职责明确的下层模块

### Requirement: package maintenance 必须组合独立 verifier
Buildr package maintenance application MUST 通过职责明确的 verifier modules 组合 package check，且每个 verifier MUST 提供稳定执行入口和结构化的成功或失败结果。

#### Scenario: 检查 package maintenance facade
- **WHEN** CLI architecture verifier 检查 package maintenance application
- **THEN** command handler MUST 只负责建立共享 package context、调用已登记 verifier 和汇总输出
- **AND** handler 与单个 smoke module MUST NOT 内嵌 Commands、Rules、Skills、runtime 和 workspace 生命周期的完整组合场景

#### Scenario: verifier 报告失败
- **WHEN** 任一 package verifier 发现契约问题或子进程失败
- **THEN** verifier MUST 将问题归属到稳定 step identity
- **AND** 聚合层 MUST 保留可定位诊断而不是仅报告无边界的 package check 失败

### Requirement: 产品验证入口必须共享声明与薄执行层
Buildr fast、affected、changed、Workspace/package selectors 和 Candidate entrypoints MUST 共享统一 step registry 与 planner/scheduler，并 MUST 将稳定 shell/npm 表面保持为薄 wrapper。统一 registry MUST 为每个 step 保存可校验的测试意图、执行边界、事实 owner、证明范围和目标成本；实际 Quick/full 组合与 affected 路径选择 MUST 分别由 profile 和 inputs 的唯一运行事实表达，不得再复制一份把 Quick、Task-affected、Candidate、Release 混为同一轴的分类。Fast 兼容入口 MUST 映射到低成本 Quick，changed MUST 按 changed paths 和事实 owner 选择完整适用证据，显式 Candidate 入口 MUST 完整覆盖登记的必要回归主证据，Release 与 focus 诊断 MUST 保持独立边界。

#### Scenario: 检查验证入口架构
- **WHEN** CLI architecture verifier 扫描产品验证入口
- **THEN** step 命令、预算、依赖、group/profile membership 与 Project Testing 分类 MUST NOT 在多个入口重复维护
- **AND** wrapper MUST 只负责参数转交、环境前置检查和退出状态传播

#### Scenario: 专项 selector 保持兼容
- **WHEN** 维护者使用已有 affected group、Workspace suite 或 package selector
- **THEN** selector MUST 解析为统一 registry 中的稳定 step identity
- **AND** 未知或重复 selector MUST 保持 fail-closed 与去重行为

#### Scenario: Fast 兼容入口执行 Quick
- **WHEN** 维护者运行 `npm test` 或 `npm run test:fast`
- **THEN** planner MUST 完整选择登记为 Quick 的低成本 Static、Unit 与 Component step，以及明确满足目标成本的少量 Integration step
- **AND** MUST NOT 因历史 step id、目录或 `fast` 名称把真实 Workspace、Git、进程生命周期或 System 测试整体纳入 Quick

#### Scenario: 重型 Integration 退出 Quick
- **WHEN** 一个 Integration 或 System step 的实际调用包含大量真实 CLI、Git、文件系统或 Workspace fixture，且不满足登记的 Quick 成本目标
- **THEN** registry MUST 通过 inputs、full profile 或 focus/group 保留该事实所需的可选择性
- **AND** 显式完整回归 membership MUST 由必要主证据决定，不得因历史入口名称自动保留

#### Scenario: Changed plan 命中全局 owner
- **WHEN** changed paths 修改 registry、path mapping、planner、runner 或其他决定选择与执行可信度的全局 owner
- **THEN** changed planner MUST 在同一个 plan 中选择完整回归 profile
- **AND** Project declaration MUST NOT 追加第二个重叠 required capability

#### Scenario: Candidate 覆盖必要主证据
- **WHEN** 维护者运行 `npm run test:candidate`
- **THEN** planner MUST 选择全部登记为 Candidate 的主要证据 owner 及其真实依赖
- **AND** 只属于独立 Browser capability 或 Release workflow 的专项 MUST NOT 为了扩大数量重复进入该完整回归入口

#### Scenario: 专项能力不重复完整回归 owner
- **WHEN** 一个高成本测试已由 Project declaration 以确定 scope/path 声明为独立交付能力
- **THEN** 内部 registry MUST NOT 在 delivery plan 与独立能力中再次重复执行相同主证据
- **AND** 诊断入口 MAY 保留有界 selector，但不得形成第二个交付 authority

#### Scenario: Registry 分类不完整
- **WHEN** 任一 step 缺少 owner、主要意图、执行边界、证明范围、主要证据 owner 或有效目标耗时，或 profile/input 引用了未知运行事实
- **THEN** registry validation MUST 在启动 verifier 前 fail closed
- **AND** MUST NOT 根据 step id、目录名或 executor 类型补猜分类

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
