# agent-assets-module-architecture Specification

## Purpose

规定 Agent Assets 平台的模块职责、内部技术分层、公开组装入口、源资产与 runtime projection authority 边界，以及兼容入口退出要求。

## Requirements

### Requirement: Agent Assets 形成独立一级模块
Buildr MUST 将 Rule、Skill、Command、Component、Builtin/package maintenance 与 Agent runtime projection 的产品实现收敛到 `src/modules/agent-assets/`，并在真实需要时使用 Application、Domain、Persistence、Infrastructure 与 Interface 分层。Manifest 读写、能力图与 binding 规则、用例编排、外部执行和可重建投射 MUST具有可定位的独立 owner；旧 `src/agent-assets/` MUST不再存在实现或转发。

#### Scenario: 查看生产源码归属
- **WHEN** 维护者扫描 Agent Assets 生产源码
- **THEN** 所有业务实现 MUST位于 `src/modules/agent-assets/`
- **AND** 参数解析与输出 MUST位于 Interfaces，业务规则 MUST位于 Domain/Application，Manifest/receipt 映射 MUST位于 Persistence，adapter/render/projection MUST位于 Infrastructure

#### Scenario: 保留真实复杂子目录
- **WHEN** runtime adapter 或 package maintenance 含多个独立维护协作者
- **THEN** 实现 MAY保留真实能力子目录
- **AND** MUST不为单个小函数、同一用例的镜像类型或纯转发创建目录

### Requirement: Agent Assets 模块保持事实 authority 分离
Agent Assets MUST区分 Workspace 源资产 Manifest/文件、业务 capability binding 与依赖解析、Component source transaction、Agent runtime 派生投射及其 receipt。Application MUST决定用例顺序和失败语义；Persistence MUST拥有 Manifest/receipt 解析映射与条件写入；Domain MUST拥有 capability graph、binding、成员关系与 ownership 规则；Infrastructure MUST只执行 filesystem、进程、adapter、render 和 projection 技术动作。

#### Scenario: 渲染 Agent runtime
- **WHEN** Agent Assets 渲染或同步 runtime
- **THEN** Application MUST先解析源资产和能力图，再调用 adapter/projection Infrastructure
- **AND** runtime receipt MUST不被解释为源资产 authority
- **AND** capability graph MUST不位于 `infrastructure/runtime/skills` 或其他投射目录

#### Scenario: 维护 Commands
- **WHEN** 用户新增、删除或检查 Command definition/requirement
- **THEN** Interface MUST只解析公开参数并调用 Command Application
- **AND** Application、Domain 与 Persistence MUST分别拥有策略、规则和 Manifest 写入
- **AND** Commands MUST继续只声明和检查外部工具
- **AND** Agent Assets MUST NOT安装、升级或保存外部工具凭证

#### Scenario: 执行 Component lifecycle
- **WHEN** 用户安装或卸载 Component
- **THEN** Application MUST编排成员验证、source transaction 与 runtime reconcile
- **AND** Component MUST继续以集合级预检、唯一 ownership 和原子 source transaction 管理全部成员
- **AND** runtime reconcile MUST继续发生在 source transaction 成功之后
- **AND** 已提交源资产、运行时投射及部分失败 effects MUST保持既有事实地位和错误语义

### Requirement: Bootstrap 显式安装 Agent Assets 模块
Bootstrap MUST 只通过 `agent-assets/module.mjs` 或等价公开入口安装 Agent Assets 平台，并 MUST 保持既有 CLI、HTTP、diagnostic 与 lifecycle 组装行为。

#### Scenario: 创建普通 CLI runtime
- **WHEN** Bootstrap 创建 Buildr runtime
- **THEN** Bootstrap MUST 恰好安装一次 Agent Assets 模块
- **AND** CLI registry MUST 继续解析既有 Rule、Skill、Command、Component、Builtin、runtime、render 和 sync 命令
- **AND** Help、JSON、错误映射与退出行为 MUST 保持等价

#### Scenario: 退出 legacy direct registration
- **WHEN** Agent Assets 模块已经由 Bootstrap 安装
- **THEN** `legacy-runtime-module` MUST NOT 再逐项直接注册已迁移的 Agent Assets Application
- **AND** 迁移期兼容方法 MUST 由 Agent Assets 模块公开入口唯一提供

### Requirement: Runtime adapter 与投射行为保持等价
Agent Assets 模块 MUST 保持受支持 runtime adapter、render/sync plan、冲突预检、receipt、清理和诊断行为等价，并 MUST 继续复用全局 Infrastructure 的通用文件、进程、网络与原子写入机制。

#### Scenario: 投射前发现冲突
- **WHEN** 任一 planned runtime target 与非 Buildr-managed 文件冲突
- **THEN** Agent Assets MUST 在写入任何 planned target 前失败
- **AND** MUST 报告当前 scope 内全部已发现冲突

#### Scenario: 重复 render 或 sync
- **WHEN** Agent 对相同源资产和 adapter 重复执行 render 或 sync
- **THEN** Agent Assets MUST 复用 receipt 判定受管文件 identity
- **AND** MUST 只清理仍由 matching receipt 证明 ownership 的旧投射
- **AND** MUST 保持幂等结果

#### Scenario: 运行 runtime adapter discovery
- **WHEN** Agent 运行现有 runtime list、check、render 或 sync 入口
- **THEN** 支持的 adapter、trait、recommended commands、投射目标和诊断语义 MUST 与迁移前等价

### Requirement: 迁移同步覆盖发布物、诊断与文档
Agent Assets 平台迁移 MUST 原子更新所有生产 imports、Application Payload、Doctor/Verification 消费路径、测试与 Buildr 服务架构文档，并 MUST 保持发布物逻辑身份和运行行为等价。

#### Scenario: 构建 Application Payload
- **WHEN** Buildr 从开发 checkout 生成 Application Payload 或 npm candidate tarball
- **THEN** payload MUST 包含 Agent Assets 模块及其 runtime collaborators
- **AND** Node 24 package entry MUST 能继续加载全部公开 Agent Assets 命令和 runtime 行为
- **AND** 发布物 MUST NOT 依赖已退出的旧生产路径

#### Scenario: 阅读服务架构文档
- **WHEN** 维护者阅读 `docs/architecture/service-architecture.md`
- **THEN** 文档 MUST 展示 Agent Assets 的实际目录结构、职责边界和迁移状态
- **AND** MUST 明确产品入口 Buildr Skill、Workspace Builtin 与 package runtime source 的长期关系仍不由本结构迁移决定

#### Scenario: 检查旧路径
- **WHEN** 结构验证扫描生产源码和直接消费者
- **THEN** 已迁移 Agent Assets 文件的旧路径 MUST 不再被引用
- **AND** 不得存在重复实现或新增循环依赖

### Requirement: OpenSpec 必须消费窄且具名的资产支撑能力
OpenSpec MUST 只取得自身实际需要的资产读取与校验方法，并通过明确类型和方法可用性检查组装；MUST NOT 将完整 `AGENT_ASSETS_INTERNAL` 注入 OpenSpec。该收窄 MUST 保持既有 OpenSpec 内容查询、严格验证、收敛、归档和错误行为。

#### Scenario: 组装 OpenSpec
- **WHEN** 创建 OpenSpec 模块
- **THEN** 资产依赖 MUST 只提供 `assertName`、`componentDefinitionFile`、`readComponentDefinition`、`readComponentsManifestForWrite` 和 `runCommandsCheck`
- **AND** 缺少所需方法 MUST 在装配时明确失败，不延迟为执行中未知方法错误

### Requirement: 适配声明与运行时文件执行必须具有独立所有者
Agent Assets MUST 区分适配声明、选择、声明性计划与运行时（Runtime）文件执行；执行器 MUST 单向消费适配声明，不形成循环依赖。文件路径校验、内容比较、写入、删除和既有恢复逻辑 MUST 归属同一明确执行者，不在声明文件保留重复实现或转发。

#### Scenario: 只比较投射计划
- **WHEN** 使用 `compareOnly` 比较当前文件与计划
- **THEN** 执行器 MUST 保持既有发现项与冲突信息
- **AND** MUST 不写入、删除或修改文件权限

#### Scenario: 执行投射计划
- **WHEN** 使用迁移后的执行器应用计划
- **THEN** MUST 保持冲突写前拒绝、路径与符号链接检查、二进制内容和执行位，以及 `commitLast`、`removeLast` 的既有顺序
- **AND** MUST 保持既有幂等结果、异常与恢复触发范围，不把局部恢复扩大为新的事务承诺

#### Scenario: 旧回执迁移失败
- **WHEN** 已触发现有旧回执迁移恢复机制，且执行中发生失败
- **THEN** 执行器 MUST 恢复原文件和旧回执，并保留原错误与资源清理语义

### Requirement: 资产应用必须显式注入职责依赖
Agent Assets MUST逐应用声明实际依赖并显式装配，MUST NOT向应用传入聚合全部内部方法的可变共享对象。资源清单读取 MUST只有一个可达解析实现；项目/服务登记修复 MUST由 Workspace 所属应用维护，资产模块只编排资源与模板维护。

#### Scenario: 装配并同步资产
- **WHEN** 执行本场景
- **THEN** 应用 MUST只访问声明的依赖，登记修复 MUST保持原事务范围、迁移、幂等及数据结果，未消费的内部辅助方法 MUST不进入模块公开端口。
