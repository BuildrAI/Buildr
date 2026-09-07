## ADDED Requirements

### Requirement: Buildr 自举 Component 必须统一执行自举激活
Buildr自举Workspace的`buildr-self-bootstrap` Component MUST通过单一专属Skill执行self-bootstrap activation。该Skill MUST消费明确Task、真实Git交付、delivered ref、retained checkout、Product Node与当前变化范围，按需组合package sync、development Buildr Web安装、开发入口验证与最终Doctor；MUST不读取旧Finish run、Task Contribution、Environment Receipt或resume token，也不安装或验证PATH默认development CLI。

#### Scenario: 普通源码或文档变化
- **WHEN** 当前真实变化未命中package、CLI或Buildr Web正式影响路径
- **THEN** self-bootstrap activation MUST返回`not-applicable`
- **AND** MUST不执行sync、Buildr Web安装或PATH CLI mutation

#### Scenario: 自举动作适用
- **WHEN** matching Task已完成、delivered ref由目标分支持有且真实变化命中自举范围
- **THEN**唯一runner MUST执行适用动作并通过retained `projects/product/buildr`验证入口与最终Doctor
- **AND** 失败 MUST形成Activation Attention且不撤销Git交付或Task结果

## MODIFIED Requirements

### Requirement: Package residual gate 必须退役持久化 Task Lifecycle projection
Buildr package、checkout runtime、npm tarball与Workspace投射 MUST交付相同的Task Record、Review、Verification与父任务协调能力，并 MUST从latest runtime composition、source、manifest、docs与tests删除Task Lifecycle、Task Overview、Environment、Development、旧Finish、Contribution协调和terminal completion reader。历史连续migration文件 MAY保留为升级链事实，但latest schema与runtime MUST不存在对应current表、projection或兼容route。

#### Scenario: 静态扫描 current runtime
- **WHEN** package verifier扫描runtime composition、Application/repository imports、HTTP catalog与专业writers
- **THEN** 已退役模块symbol、route和writer MUST全部不存在
- **AND** Task Record、Review与Verification writer MUST只更新所属authority

#### Scenario: 验证既有用户数据库升级
- **WHEN** package verification从fresh或旧ledger升级到latest
- **THEN** 保留的Task、Review、Verification与关系事实 MUST保持
- **AND** latest schema MUST没有已退役current表、`schema_version`或`result_no_change`

#### Scenario: 检查 migration package
- **WHEN** verifier检查checkout、tarball与初始化Workspace的migration assets
- **THEN** 三种入口 MUST包含一致且连续的migration链
- **AND** MUST不改写历史migration bytes或固定猜测latest版本

#### Scenario: 验证 Overview 与专业 reader parity
- **WHEN** verifier请求已删除Overview route或operation
- **THEN** 所有入口 MUST一致返回不存在或forbidden
- **AND** Task detail、Review、Verification与父任务协调 MUST继续独立可读

### Requirement: Package 必须原子交付 Buildr Web Task Manager 能力
Buildr package MUST原子交付Task Record Domain/Application/repository、`buildr.task-record/v3` capability contract、现有`task-manager` provider、workspace binding、Skill source、CLI/help/runtime接线、Buildr Web Task routes/API/Web assets与公开JSON identity。`task-manager`是Skill标识，不是额外Application；Buildr Web与CLI MUST调用同一Task Record Application。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr将包含Task Record能力的package初始化或同步到Workspace
- **THEN** workspace Skills manifest MUST登记`buildr.task-record@3`、`task-manager`与default binding
- **AND** provider、contract和binding identity MUST一致

#### Scenario: capability contract identity 不一致
- **WHEN** manifest、contract、provider或binding的capability identity不一致
- **THEN** package check与Doctor MUST报告完整性错误
- **AND** runtime projection MUST不猜测继续绑定

#### Scenario: 支持的 Agent runtime 投射 Task Manager
- **WHEN** retained Workspace从已集成Product source执行sync/render
- **THEN** runtime MUST收到完整`task-manager` Skill和consumer-local binding
- **AND** Doctor MUST只在contract、provider与binding可解析时报告ready

#### Scenario: bundled Buildr Web 加载 Task 页面
- **WHEN** checkout、npm tarball或平台bundle启动Buildr Web并打开已有Task
- **THEN** server MUST交付Task列表、详情与Workspace-scoped API
- **AND** Web与CLI MUST共享Application、validator和digest冲突语义

### Requirement: 用户Workspace不得包含或感知Buildr自举activation
Buildr package与runtime projection MUST让未安装`buildr-self-bootstrap` Component的用户Workspace保持无self-bootstrap Skill、Contribution、路径分类、installer或launcher副作用。普通`task-finish` Skill MUST不依赖自举Skill。

#### Scenario: 临时用户Workspace投射Task能力
- **WHEN** package fixture初始化并render普通用户Workspace
- **THEN** runtime MUST包含通用Task Skills且不包含self-bootstrap Skill或Contribution
- **AND** 普通Project或Service任务 MUST不安装或更新Buildr产品

#### Scenario: 临时用户Workspace投射Task Finish
- **WHEN** 普通用户Workspace投射默认task-finish
- **THEN** runtime MUST不包含self-bootstrap Skill或Contribution
- **AND** task-finish MUST不调用Product安装或开发Launcher

#### Scenario: Buildr自举Workspace投射Component
- **WHEN** Buildr自举Workspace检查已安装的`buildr-self-bootstrap` Component
- **THEN** Component integrity MUST证明专属Skill与Contribution完整
- **AND** package/runtime parity MUST证明该组合未进入用户package默认能力

## REMOVED Requirements

### Requirement: Buildr 自举 Component 必须统一执行 Buildr Web post-Finish activation
**Reason**: 标题和行为依赖已删除Formal Finish run、Task Contribution与Environment Receipt。
**Migration**: 使用基于当前Task与Git事实的自举激活Requirement。

### Requirement: 当前 package 不得为未来 Task Finish adapter 预建选择框架
**Reason**: 条款仍假设Task Finish Application、Development和Environment依赖。
**Migration**: 默认task-finish保持Skill-only，不预建Application adapter框架。

### Requirement: 产品验证必须覆盖 Task Finish render 与自举 Workspace 组合边界
**Reason**: 条款依赖旧Task Contribution、Finish plan和Environment cleanup。
**Migration**: 通用Skill与self-bootstrap专属Skill分别由当前package和自举测试覆盖。

### Requirement: 产品验证必须覆盖已包含交付与post-Finish自举
**Reason**: 条款依赖旧Finish run、Task Contribution和Delivery Adaptation。
**Migration**: 直接核验Git交付、self-bootstrap结果与Worktree cleanup。

### Requirement: 产品与自举验证必须覆盖零差异已包含恢复
**Reason**: 条款依赖已删除Delivery Adaptation、handoff和resume token。
**Migration**: 由当前Git readback与self-bootstrap幂等检查覆盖。

### Requirement: self-bootstrap Development Launcher必须使用独立内部manager
**Reason**: 当前Launcher边界由Installation、Buildr Web channel与self-bootstrap专属规范维护；本条混入Environment交接与Task Contribution。
**Migration**: 保留development-only manager，不再从任务系统取得环境或贡献状态。
