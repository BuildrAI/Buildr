## ADDED Requirements

### Requirement: Task Finish必须消费产品持有的convergence orchestrator
Task Finish MUST通过产品application service推进archive rehearsal、pre-sync guard、deterministic plan/apply、strict validation与post-sync guard，并持久化每个阶段的identity、timing和恢复边界。正常safe路径MUST NOT要求Agent读取delta、直接编辑canonical文件或手工搬运receipt。

#### Scenario: Safe convergence一次推进
- **WHEN**deterministic plan全部safe/already-applied且各阶段identity匹配
- **THEN**Task Finish executor MUST在同一convergence attempt内完成全部阶段
- **AND**checkpoint MUST记录阶段摘要与最终receipt

#### Scenario: Planner要求语义处理
- **WHEN**orchestrator返回`semantic-resolution-required`
- **THEN**run MUST保持contract-convergence blocked并指向Agent fallback
- **AND**resume MUST从真实失效阶段继续而不重复passed rehearsal/guard effects

### Requirement: Finish入口必须解析权威execution roots
Task Finish MUST从明确Workspace target、Project selector、task environment receipt和repository membership解析Workspace、Product、Service与command cwd。调用方相对路径或当前shell cwd MUST NOT替代这些authority。

#### Scenario: 从Service目录调用Workspace动作
- **WHEN**consumer在allowed Service cwd调用finish且提供Workspace target与Project context
- **THEN**系统 MUST解析同一canonical finish run与正确Product/Service roots
- **AND**MUST NOT因调用方少退或多退目录而创建嵌套Workspace状态

#### Scenario: Root无法唯一解析
- **WHEN**target、Project registry、membership或receipt identity不一致
- **THEN**系统 MUST在文件写入或命令启动前blocked
- **AND**result MUST返回resolved candidates与唯一修复动作

### Requirement: Completion receipt必须持久化完整效率证据
Canonical completion receipt MUST包含run created/completed time、端到端wall-clock、各step/attempt execution timing、retry count、blocked recovery、attributable waste、formal verification timing、tool round-trip计数和输出量近似指标。删除task environment后这些证据MUST仍可访问。

#### Scenario: Environment删除后审查效率
- **WHEN**cleanup finalize已删除task environment
- **THEN**canonical receipt MUST允许consumer重建关键阶段耗时与重试来源
- **AND**MUST NOT只保留formal verification单项duration

### Requirement: Full detail必须使用有界诊断引用
正常compact result MUST仅内联当前状态、阶段摘要、失败项与timing totals；完整attempts、command previews和测试输出MUST写入run-owned diagnostics并返回稳定digest/path，除非调用方明确读取该引用。

#### Scenario: Consumer请求full detail
- **WHEN**历史steps、attempts或command output超过内联预算
- **THEN**CLI MUST返回诊断引用与有界preview
- **AND**MUST NOT把全部历史重复注入主JSON响应

### Requirement: Finish benchmark必须测量执行与Agent编排
Buildr MUST提供真实finish benchmark evidence，分别记录产品命令执行、provider/composite execution、Agent/tool round-trip、blocked recovery、输出字节或Token近似量和端到端wall-clock。

#### Scenario: 比较连续两轮finish
- **WHEN**同类普通Change完成真实收尾
- **THEN**结果 MUST能比较formal verification、OpenSpec convergence、Git/runtime/cleanup与Agent编排成本
- **AND**MUST明确披露未被产品自动化的阶段
