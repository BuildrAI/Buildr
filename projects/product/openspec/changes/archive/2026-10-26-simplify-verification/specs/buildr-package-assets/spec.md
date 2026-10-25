## REMOVED Requirements

### Requirement: package 验证必须按资产与行为边界拆分
**Reason**: 清理旧分类、重复执行和技能职责，保留实际行为证明。
**Migration**: 由本变更四类检查、两个项目技能及同文件的新要求承接。

## ADDED Requirements

### Requirement: 软件包检查必须按四类及实际行为边界拆分
Buildr MUST 将 package 静态内容校验、软件包工作空间端到端检查（E2E） 和领域 integration 实现为可独立执行的 verifier，并 MUST 让 `buildr package check` 聚合这些 verifier 的结果而不改变公开成功或失败语义。

#### Scenario: 维护者运行 package check
- **WHEN** 维护者运行 `buildr package check`
- **THEN** 命令 MUST 执行全部已登记 package verifier
- **AND** 任一 verifier 失败 MUST 使聚合命令返回非零状态并标识失败边界

#### Scenario: package 静态校验独立执行
- **WHEN** Candidate 或 affected 验证执行 package static verifier
- **THEN** verifier MUST 校验 manifest、inventory、随包 baseline、Skill/Rule/Component 内容契约和必要支持工具
- **AND** verifier MUST NOT 创建临时用户 workspace 或执行领域 CLI 生命周期

#### Scenario: 软件包工作空间端到端检查（E2E） 独立执行
- **WHEN** Candidate 或维护者执行 软件包工作空间端到端检查（E2E）
- **THEN** verifier MUST 验证 init 生成的随包 baseline、现有 `AGENTS.md` 兼容和最终 doctor 收敛
- **AND** verifier MUST NOT 重复 Commands、Rules、Skills 或全部 runtime adapter 的细粒度 CRUD 与投射矩阵

#### Scenario: 领域 integration 独立执行
- **WHEN** package 验证需要覆盖 Commands、Rules、Skills 或 runtime 的行为契约
- **THEN** 对应断言 MUST 由稳定的 focused verifier identity 持有
- **AND** package check MAY 聚合该 verifier，但 软件包工作空间端到端检查（E2E） MUST NOT 复制其完整场景

## MODIFIED Requirements

### Requirement: 随包任务验证能力保持完整可组合
Buildr package MUST原子交付`buildr.task-verification/v4` contract、默认`project-verification` provider、由 project-testing 维护的 Project `buildr.project-verification/v4` reference/template、Workspace binding、Project map CLI/Application、Task report inspect/record CLI/Application与全部supported runtime投射输入。Package authoring surface MUST不包含旧v2/v3 reference/template、Request/Plan/provider、Execution Record、Candidate或Task Finish verification authority。

#### Scenario: Package 声明 task-verification provider
- **WHEN** package static validation读取随包能力声明
- **THEN** Workspace Skills manifest MUST声明installed、enabled的`project-verification` provider、`buildr.task-verification/v4` contract与binding
- **AND** package include mapping MUST只投射v4测试地图reference/template和当前Skill资料

#### Scenario: Package 交付测试声明资料
- **WHEN** package static validation检查`project-verification`完整目录
- **THEN** provider MUST包含v4 schema reference和最小初始化模板
- **AND** 资料 MUST描述testing family scope、源码/测试根、完整入口、selection与requirements，不得索引每个测试文件

#### Scenario: Package 保留 v2 legacy reader
- **WHEN** package static validation检查Project verification runtime
- **THEN** MUST只支持当前closed v4 schema与明确legacy fixture边界
- **AND** MUST不指导新Workspace创建v2/v3声明

#### Scenario: Runtime 可发现验证入口
- **WHEN** 临时Workspace为任一supported runtime完成sync或render
- **THEN** runtime inventory MUST包含可发现的v4 `project-verification` Skill
- **AND** description MUST覆盖测试地图、Agent直接执行与开发完成报告意图

#### Scenario: Provider contract 组合验证
- **WHEN** Buildr运行随包任务Skills契约验证
- **THEN** verifier MUST覆盖v4测试地图、报告摘要并发保护、适用性、coverage gap与Buildr Web只读边界
- **AND** verifier MUST确认provider不拥有Candidate、proceed/blocked、Task status或Finish

#### Scenario: 替换默认验证 provider
- **WHEN** Workspace安装并绑定兼容的内部`buildr.task-verification/v4` provider
- **THEN** consumers MUST通过binding发现provider而不修改consumer Skill
- **AND** 默认provider在不再被选中时 MUST可安全卸载

### Requirement: self-bootstrap 候选验收必须证明 canonical store 未受污染
Buildr package/runtime verification MUST 覆盖 self-bootstrap candidate 对 canonical Structured Store 的 provenance rejection、独立 validation store migration、CLI/HTTP/internal driver writer routing 与候选 Buildr Web 端到端检查（E2E）。验证 MUST 证明拒绝路径零 mutation，并明确区分 candidate validation evidence 与 retained runtime activation evidence。

#### Scenario: package fixture 运行 candidate migration
- **WHEN** verifier 用 task worktree candidate runtime 分别指向 canonical Workspace 与 receipt-bound Task Validation Workspace
- **THEN** canonical target MUST 被拒绝并保持数据库 bytes/ledger 不变
- **AND** validation target MUST 能从空库连续应用 candidate migration 并运行受影响测试

#### Scenario: 候选集成后激活
- **WHEN** 最终候选完成 required verification 并进入 retained checkout
- **THEN** activation/Doctor MUST 由 retained source 运行并报告 retained runtime identity
- **AND** MUST NOT 把 candidate validation database 或其数据当作 canonical activation result
