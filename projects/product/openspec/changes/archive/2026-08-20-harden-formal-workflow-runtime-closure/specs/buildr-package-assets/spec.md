## MODIFIED Requirements

### Requirement: Package 原子交付 Task Retrospective v2
Buildr package MUST 原子交付 `buildr.task-retrospective/v2` contract、默认 provider、bundled `__internal task-retrospective` route、checkout薄driver wrapper、workspace binding、Task Record v2 consumer binding以及Buildr Web投影，并 MUST不建立lifecycle gate。受管consumer MUST通过retained controller invocation调用该route，npm artifact MUST不依赖发布包外的controller source root或`src/interfaces/internal`文件。

#### Scenario: Package 安装 Task Retrospective
- **WHEN** Buildr 初始化或同步 workspace
- **THEN** package MUST 安装 v2 contract 与完整 task-retrospective Skill
- **AND** default binding、Task Record consumer与内部route MUST指向兼容provider/runner

#### Scenario: Package 校验 v2 边界
- **WHEN** Agent 运行 package check、Doctor 或产品 affected verification
- **THEN** verifier MUST 检查contract、provider、binding、bundled route、SQLite repositories、Buildr Web route、Result schema与Task来源关系
- **AND** verifier MUST拒绝source-only consumer、history、自动采集、action item store、自动执行Task或lifecycle gate

### Requirement: Buildr package 必须交付 Task Planning Identity consumer闭环
Buildr package MUST原子交付Task Planning Identity Domain/Application、runtime composition、bundled `__internal task-planning-identity`只读route、checkout薄driver wrapper、相关contracts/specs与更新后的`task-development`、`task-review`、OpenSpec propose/update/apply/contract-guard Skills。受管consumer MUST通过retained controller invocation调用resolver；Package static validation、Doctor与installed artifact contract tests MUST证明consumer使用resolver结果且不再指引Agent手工摘要OpenSpec planning target或直连source driver。

#### Scenario: Package 与runtime projection完整
- **WHEN** Buildr构建package并向Workspace投射Skills
- **THEN** bundled resolver route、结果契约和全部相关consumer指引 MUST同时存在且相互一致
- **AND** 任一缺失、source-only路径、旧手工摘要指引或版本接线漂移 MUST使package检查或Doctor失败

## ADDED Requirements

### Requirement: Package 必须验证正式工作流内部路由闭环
Buildr package MUST维护Task Development、Task Retrospective与Task Planning Identity的单一required internal workflow route inventory，并 MUST让CLI分派、受管consumer、package static validation、Doctor与npm installed-layout tests消费一致route identity。每个route MUST在实际npm artifact中可启动；Retrospective writer与Planning Identity reader MUST在安装布局fixture中完成真实Application调用。

#### Scenario: npm artifact 内部路由完整
- **WHEN** 产品验证安装本次生成的npm tarball并执行required internal workflow route tests
- **THEN** 三个`__internal` route MUST由安装产物自身成功启动且返回各自closed contract
- **AND** test MUST NOT借用development checkout的source driver、node_modules或payload identity完成执行

#### Scenario: Doctor 发现 route closure 漂移
- **WHEN** 当前runtime缺少required route、受管consumer引用未知route或route未绑定对应runner
- **THEN** Doctor MUST返回稳定actionable finding并保持只读
- **AND** MUST NOT通过下载source checkout、改写Skill或伪造route availability来自愈
