## ADDED Requirements

### Requirement: 全部verification owner必须具有可审计Context disposition
Buildr唯一verification registry中的每个step MUST恰好关联一个`context-runtime`、`hybrid`或`full-lifecycle` disposition以及稳定reason code。Context disposition authority MUST与step集合精确闭合；新增、删除或重命名owner没有matching disposition时 MUST在启动测试前fail closed。

#### Scenario: owner完整使用Context Runtime
- **WHEN** owner的可复用Application/seed与逐case隔离全部由公共Runtime和Buildr provider拥有
- **THEN** disposition MUST为`context-runtime`
- **AND** executor、contexts、isolation/reset、parallel safety与resource demand MUST与该分类一致

#### Scenario: owner只复用前置状态
- **WHEN** owner复用Application、SQLite snapshot或immutable seed但仍以真实CLI、Git或process边界为primary evidence
- **THEN** disposition MUST为`hybrid`并说明保留的真实边界
- **AND** Context MUST NOT替代或重复该primary evidence

#### Scenario: owner不接入Context
- **WHEN** owner是stateless检查、无法安全reset的跨进程状态，或初始化、迁移、Finish、自举、cleanup、Candidate/Release本身是primary evidence
- **THEN** disposition MUST为`full-lifecycle`并记录不接入理由
- **AND** contract MUST NOT因追求注册率而要求共享可变状态或跳过黄金旅程

### Requirement: eligible重型owner必须完成真实Context迁移
Buildr MUST将Task read models、coordination、execution records、Finish Application core、Environment repository/Application边界与Runtime/Application composition中不以初始化本身为证据的owner迁移到公共Runtime；迁移后的测试文件 MUST从统一adapter取得Application或sandbox lease，不得在同一case重复组装matching Runtime/seed。

#### Scenario: Application与read-model owner执行
- **WHEN** Context-aware Host执行多个matching Task Application测试文件
- **THEN** 每个Host MUST最多创建一次matchingApplication assembly
- **AND** 每case MUST使用独立SQLite/Workspace状态并在release后通过污染检查

#### Scenario: owner跨越CLI或Git
- **WHEN** eligible owner的主要断言仍需要真实CLI子进程或Git mutation
- **THEN** owner MUST使用hybrid sandbox执行真实边界
- **AND** shared seed、Git index、refs、SQLite connection或Workspace MUST NOT被多个case共同修改

#### Scenario: owner无法可靠reset
- **WHEN** focused迁移暴露process global、descriptor、database或filesystem污染无法由provider完整检查和恢复
- **THEN** lease MUST标记dirty并evict或owner MUST退回full-lifecycle
- **AND** 本次测试 MUST不得因Runtime静默重建而记录为passed

### Requirement: Context迁移必须报告逐owner成本与残余预算
Context-aware owner的Execution Record MUST聚合create、cache-hit、wait、acquire/release、test body、reset、dirty/evict/destroy、seed prepare、sandbox materialize/cleanup和wall-clock。迁移验收 MUST在同一tree运行focused多轮、至少三轮无外部竞争Core以及一次Core/affected竞争，并 MUST同时证明Core/Candidate membership与Release黄金owner不退化。

#### Scenario: focused owner迁移有净收益
- **WHEN** 同一owner在matching tree完成多轮成功执行
- **THEN** 报告 MUST展示基线/候选wall-clock、Context各阶段、Host数量、cache命中和波动
- **AND** 结论 MUST说明收益来自消除何种重复环境成本

#### Scenario: Core仍高于180秒
- **WHEN** 三轮干净Core中位数或可证明必要下限仍超过180秒
- **THEN** Child MUST保存残余长尾、必要owner与诚实预算建议
- **AND** MUST NOT删除无替代primary evidence、隐藏失败或声称目标已完成
