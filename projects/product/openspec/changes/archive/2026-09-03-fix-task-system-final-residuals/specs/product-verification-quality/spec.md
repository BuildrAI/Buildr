## MODIFIED Requirements

### Requirement: 退役任务能力必须具有无残留验收
Product verification MUST覆盖 fresh/升级 SQLite、Task Record、OpenSpec、Review、Verification、父任务协调、Buildr Web 与发布回归，并证明 Task Overview、Task Environment、Task Development、Planning Identity、Task Candidate、Development Handoff、旧 Finish、Contribution 协调与 Execution Record 没有运行时入口、current 表、能力绑定、兼容转发或专属 owner。Static validation MUST另外扫描非归档 canonical specs、current knowledge、架构/CLI 文档与当前测试 ownership，拒绝对这些能力的正向要求和已迁移 Task `.mjs` 路径；archive、连续 migration 和明确 legacy fixture MUST排除。

#### Scenario: 完整受影响验证
- **WHEN** 最终任务系统收敛完成
- **THEN** 类型、Unit、Component、Contract、Integration、System、适用 Browser、package 和 OpenSpec 检查 MUST通过
- **AND** Product/Release Candidate 模型 MUST保持独立且可用

#### Scenario: 当前规范重新正向要求退役能力
- **WHEN** 非归档当前资产新增 Task Overview、Environment、Development、Execution Record、旧 Finish 或内部 workflow router 的正向要求
- **THEN** package/static verification MUST失败并报告具体文件与命中项
- **AND** 历史 archive、migration 和 legacy fixture MUST不产生误报

### Requirement: 专属 Integration slice 必须保持当前能力的唯一 primary ownership
Verification registry MUST为仍存在的 Task Record、Review、Verification 与父任务协调实现选择唯一 primary owner。Task Overview、Retrospective Application、Task Entry、Environment、Task Development、Planning Identity、旧 Finish、Execution Record 与 Contribution 协调 MUST没有空 step、shard 或当前路径映射；Task 当前实现映射 MUST使用真实 `.ts` 路径。

#### Scenario: changed paths命中Task实现
- **WHEN** affected selection 命中当前保留的 Task 实现
- **THEN** MUST选择覆盖该 `.ts` 实现的现有 owner
- **AND** MUST不选择已退役 Task 能力 owner 或旧 `.mjs` 路径

#### Scenario: changed paths命中Task read或专业实现
- **WHEN** affected selection 命中 Task Record、Review、Verification 或父任务协调
- **THEN** MUST选择该实现当前唯一 owner
- **AND** MUST不选择 Overview、Environment、Development、Finish 或 Execution Record 专属 owner

#### Scenario: 本机复盘文档能力变化
- **WHEN** Task Record 复盘摘要、固定文件读取或 Buildr Web 复盘卡片发生改变
- **THEN** MUST由 Task Record Integration/System 和适用 Browser owner 证明
- **AND** MUST不重建 Task Retrospective 专属 slice

### Requirement: Buildr层级并发必须约束Context Worker Host
Verification scheduler MUST把实际worker/process grant传递给Context-aware runner；runner Host数量、Context parallel safety和owner resource demand MUST共同限制并发，execution timing evidence MUST区分Host、Context与测试体成本。

#### Scenario: Core owner取得有限grant
- **WHEN** Context owner取得workers等于N的execution grant
- **THEN** inner runner MUST启动不超过N个Host
- **AND** timing evidence MUST记录host count、cache create/hit、lease wait、reset、evict与destroy

### Requirement: Context迁移必须报告逐owner成本与残余预算
Context-aware owner的timing report MUST聚合create、cache-hit、wait、acquire/release、test body、reset、dirty/evict/destroy、seed prepare、sandbox materialize/cleanup和wall-clock。迁移验收 MUST在同一tree运行focused多轮、至少三轮无外部竞争Core以及一次Core/affected竞争，并 MUST同时证明Core/Candidate membership与Release黄金owner不退化。

#### Scenario: focused owner迁移有净收益
- **WHEN** 同一owner在matching tree完成多轮成功执行
- **THEN** 报告 MUST展示基线/候选wall-clock、Context各阶段、Host数量、cache命中和波动
- **AND** 结论 MUST说明收益来自消除何种重复环境成本

#### Scenario: Core仍高于180秒
- **WHEN** 三轮干净Core中位数或可证明必要下限仍超过180秒
- **THEN** Child MUST保存残余长尾、必要owner与诚实预算建议
- **AND** MUST不删除无替代primary evidence、隐藏失败或声称目标已完成

### Requirement: 选择优化必须形成代表性 before/after 审计
Buildr Product MUST以近期代表性普通Task、真实planner输出和受控timing result形成before/after审计，至少报告Full升级率、selected step数、墙钟中位数与P90、Full reason分布、最常选择的重型owner、各evidence layer的实际选择粒度和数据缺口。结论 MUST区分选择过宽、必要owner过重、环境等待与尚未证明。

#### Scenario: 审计证明选择过宽
- **WHEN** 同一组代表性路径在修正前无必要地升级Full或选择无关sibling owner
- **THEN** 报告 MUST给出相同样本的before/after scope、step、reason与墙钟证据
- **AND** Candidate与Release-only覆盖 MUST证明没有下降

#### Scenario: 审计证明选择不是主要瓶颈
- **WHEN** 普通样本已保持窄affected且重型owner都具有不可替代primary evidence
- **THEN** 报告 MUST明确选择不是主要瓶颈并列出剩余重型owner、公共结果与实测成本
- **AND** MUST不以架构清晰、单次波动或预设数字冒充执行时间收益

#### Scenario: 历史记录字段不完整
- **WHEN** 近期timing result缺少changed paths、selection trace或timing字段
- **THEN** 报告 MUST将对应数据标记为missing，并可对冻结路径使用当前真实planner重放选择
- **AND** MUST不估算、伪造或把当前重放描述为历史原始输出

## REMOVED Requirements

### Requirement: Buildr Product 必须通过统一高级 provider 接入 Workspace Plan
**Reason**: 当前 Project verification v4 是测试地图，Agent直接调用项目工具；不再公开统一Request/Plan/provider adapter。

**Migration**: 使用`verification.yml`选择稳定测试体系，Buildr Product内部runner保留自己的registry/planner但不成为Task Application。

#### Scenario: 选择Product测试
- **WHEN** Agent需要affected或full验证
- **THEN** MUST读取v4测试地图并直接调用现有项目入口
- **AND** MUST不创建Workspace Plan

### Requirement: Product provider 必须保持 Plan 与执行 authority 可审计
**Reason**: 该公开provider/Plan/Execution Record模型已退役。

**Migration**: 一次验证的选择、执行与计时由Buildr Product测试runner自身输出，正式Task只保存有意义报告。

#### Scenario: 执行Product测试
- **WHEN** Agent调用Buildr Product内部runner
- **THEN** runner MUST输出自身可解释选择和结果
- **AND** MUST不写Task Verification或Execution Record

### Requirement: Product live声明必须采用v3高级provider边界
**Reason**: Product live声明已经是`buildr.project-verification/v4`测试地图。

**Migration**: 保留v4中的testing families、sourcePaths、testRoots、full入口、selection与requirements。

#### Scenario: 读取Product测试地图
- **WHEN** Agent检查Product `verification.yml`
- **THEN** schemaVersion MUST为`buildr.project-verification/v4`
- **AND** MUST不包含Request、Plan、execution units或provider graph
