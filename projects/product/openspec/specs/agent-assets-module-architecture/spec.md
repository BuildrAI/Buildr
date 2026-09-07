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
