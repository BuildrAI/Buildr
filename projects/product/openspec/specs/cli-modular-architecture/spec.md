# Buildr CLI 模块化架构

## Purpose

定义 Buildr CLI 的薄 executable、内部模块分层、依赖方向、行为兼容、npm runtime 发布完整性和自动架构门禁。

## Requirements

### Requirement: CLI executable 必须保持薄入口
Buildr CLI executable MUST位于 `bin/buildr.mjs`，只承担进程启动、顶层错误处理和调用 `src/bootstrap/cli/main.ts`，不得承载具体资产领域的解析、校验、诊断或写入实现；checkout 根 `buildr` 入口 MUST委托同一实现。

#### Scenario: 从 checkout 或 npm package 启动 CLI
- **WHEN** 用户通过 checkout 根 `buildr` 或 npm 安装后的 `buildr` 执行任意受支持命令
- **THEN** executable MUST将参数交给同一 Bootstrap CLI Host 和 command registry
- **AND** executable 自身 MUST NOT包含具体 Project、Service、Rule、Skill、Command、Component、OpenSpec、doctor、package 或 runtime command 的领域实现
- **AND** checkout 与 npm 入口 MUST NOT依赖已删除的 `tools/buildr`、`tools/cli` 或旧 `src/interfaces/cli` 路径

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
- **AND** 安装后的代表性 help、只读、mutation、runtime、package build 与 doctor 命令 MUST 与 checkout 入口保持行为等价
- **AND** 安装后产品命令 MUST NOT 依赖 `test/` 或 `tools/`；维护者的 `package check` 属于开发工程入口，无开发检出时 MUST明确提示所需环境

#### Scenario: 使用者查看 package public surface
- **WHEN** 使用者检查 package metadata 或公开文档
- **THEN** package MUST 继续承诺 `buildr` bin、已记录的 CLI 产品表面和明确声明的独立公共 facade
- **AND** `@buildr-ai/buildr/test-context` MUST 只通过 package exports 映射的生成公共入口暴露已记录的 Node Test Context Runtime API
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
- **AND** handler 与单项检查模块 MUST NOT 内嵌 Commands、Rules、Skills、runtime 和 workspace 生命周期的完整组合场景

#### Scenario: verifier 报告失败
- **WHEN** 任一 package verifier 发现契约问题或子进程失败
- **THEN** verifier MUST 将问题归属到稳定 step identity
- **AND** 聚合层 MUST 保留可定位诊断而不是仅报告无边界的 package check 失败

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

### Requirement: OpenSpec 内容查询与任务关联组合必须分属各自模块
Buildr MUST 由 OpenSpec 模块唯一拥有通用变更（Change）文件、列表、详情、归档定位、产物读取及通用操作提示词；任务模块 MUST 只组合任务关联、工作树（Worktree）选择、副本来源与任务展示，且 MUST 通过 OpenSpec 具名查询能力读取内容。OpenSpec 内容查询 MUST NOT 反向依赖任务模块。

#### Scenario: 查询全局变更内容
- **WHEN** 调用通用项目变更列表或详情
- **THEN** OpenSpec 查询 MUST 独立读取保留项目的内容，不依赖任务记录或工作树选择
- **AND** MUST 保持既有返回结构、错误、排序、归档标识和安全检查

#### Scenario: 查询任务关联变更内容
- **WHEN** 任务入口解析关联变更或界面原型（UI Prototype）
- **THEN** 任务侧 MUST 确定受信任的副本与来源，OpenSpec 查询 MUST 读取该副本的内容
- **AND** MUST 保持现有候选优先、保留回退、原型边界以及 HTTP 和页面行为

### Requirement: 四类公开命令必须共享单一选择执行层
六个日常公开命令 SHALL 使用同一检查登记、选择器和执行器，命令包装层 SHALL 仅解析请求及展示结果，不复制测试成员、环境判断或报告状态。四类 SHALL 是唯一测试类型，准备与发布目标 SHALL 是明确运行事实，不恢复旧日常档位或隐式全局前置门禁。

#### Scenario: 自定义检查请求
- **WHEN** 调用方按类型、相关改动或显式检查身份执行
- **THEN** SHALL 从同一登记解释实际选择、真实依赖、环境缺项和结果；`check` SHALL 不被显式参数缩窄

#### Scenario: 发布内部调用
- **WHEN** 发布工具组合冻结源码或准确原包检查
- **THEN** SHALL 复用同一登记和执行机制，保留准确输入和原生系统证明，不形成另一套公开测试分类
