# task-finish-execution Specification

## Purpose

说明旧收尾运行的历史读取与退役边界；新收尾由技能指导智能体处理实际成果与安全善后。 历史查询只解释已经保存的对象身份、结果和诊断；不得新建执行运行、恢复旧阶段或把内部记录问题扩大为整个目标的阻塞。

## Requirements

### Requirement: Finish repository 必须支持按 Task 安全读取既有 completed Result
Task Finish MUST 提供最窄的按 Task 只读查询，复用 Workspace SQLite 中既有 `task_finish_current` authority。查询 MUST 校验保存的 schema、Task identity 与 completion identity，不扫描或迁移旧文件协议，MUST NOT 新增 writer、数据库表、索引、缓存或聚合 store。

#### Scenario: 多个 run 中后续成功
- **WHEN** 同一 Task 先有 blocked/failed run，后来存在身份匹配的 complete Result
- **THEN** 查询 MUST 返回匹配的成功 complete Result
- **AND** 旧失败 run MUST NOT 覆盖成功事实

#### Scenario: Finish 文件损坏
- **WHEN** 与目标 Task 相关的已保存记录无法安全解析或 completion identity 不完整
- **THEN** 查询 MUST 返回不可安全核验诊断
- **AND** MUST NOT 跳过关键损坏后推断 delivered

### Requirement: Task Finish Result 必须报告只读解析上下文
历史 `buildr.task-finish-result/v2|v3` MUST以只读 `resolvedContext`报告本次run从既有Task、Development handoff、Environment和delivery target事实中解析出的最小上下文，包括`buildr.task-finish/v1` capability identity、Task/handoff/Candidate/Content Target identity、Agent、target branch、remote与该集合的确定性identity。`resolvedContext` MUST只由产品生成，不得作为run输入、可编辑execution capsule、独立数据库列、Receipt、恢复manifest或第二authority。

#### Scenario: 新run形成解析上下文
- **WHEN** 读取旧版本已经保存的Finish run
- **THEN** inspect/terminal Result MUST返回由同一run identity确定性形成的`resolvedContext`
- **AND** 调用方 MUST不需要提交contract版本、handoff、Environment、Candidate或delivery plan

#### Scenario: inspect读取terminal Result
- **WHEN** 调用方按run id inspect已完成或blocked的Finish Result
- **THEN** `resolvedContext` MUST与该run采用的identity保持一致
- **AND** reader MUST NOT重新解释当前Task、Environment或后续变化来改写历史解析上下文

#### Scenario: 读取缺少字段的既有v2 Result
- **WHEN** Workspace中存在本变更前写入且没有`resolvedContext`的合法`buildr.task-finish-result/v2`
- **THEN** 兼容reader MUST允许该字段为null或按已保存run identity只读派生
- **AND** MUST NOT迁移历史Result、建立补写任务或把缺失字段解释为交付失败

### Requirement: Task Finish CLI detail 投影必须与执行 authority 分离
Task Finish Application MUST从同一个canonical `buildr.task-finish-result/v3`确定性生成CLI detail投影。`full` MUST原样保留repository-set Result；`compact` MUST通过closed字段白名单生成`buildr.task-finish-compact-result/v1`，且 MUST不写SQLite、不改变run/result、不查询第二authority、不创建新的恢复或diagnostics store。`self-bootstrap` MUST通过稳定投影保留唯一Workspace repository的冻结`leaseTargetIdentity`，不得从`remote + targetBranch`或本机路径重新计算repository identity。detail选择 MUST只影响CLI JSON序列化，不得改变五阶段执行、逐repository resume、Delivery Carrier、Execution Record、Task terminal或Environment cleanup。旧v2 Result只允许有界读取与兼容compact/self-bootstrap投影，新写入 MUST使用v3。

#### Scenario: complete Result 的两种投影
- **WHEN** 同一complete v3 Result分别以compact与full读取
- **THEN** 两者 MUST表达相同run、Task、handoff、Candidate、Content Target、status与completion结论
- **AND** full MUST保留repository-scoped delivery authority，compact MUST保持既有closed字段并省略repository数组和full diagnostics

#### Scenario: Self-bootstrap 投影保留 Workspace lease identity
- **WHEN** v3 Result的唯一Workspace repository适用且冻结了repository-scoped `leaseTargetIdentity`
- **THEN** self-bootstrap detail MUST在该Workspace repository上原样投影同一identity
- **AND** MUST不以同名branch、remote或其他repository的lease identity替代

#### Scenario: blocked Result 可恢复
- **WHEN** current run因某个repository的Delivery Adaptation、target race、containment或cleanup暂态条件blocked
- **THEN** full MUST标识该repository的真实状态，compact MUST保留primary failure、唯一next action与matching resume
- **AND** detail投影 MUST不重复交付已完成repository或改写repository checkpoints

#### Scenario: compact 投影失败
- **WHEN** canonical Result缺少compact契约要求的run、identity、status或恢复事实
- **THEN** Application MUST fail closed并返回受控CLI错误
- **AND** MUST不补造identity、修改canonical Result或降级为对象展开

### Requirement: 旧收尾只允许读取历史
Buildr MUST移除 run、rollover、reconcile 的公共执行入口；MUST保留 inspect 历史读取和安全所需的已知资源事实，MUST不自动删除资源或写成功状态。

#### Scenario: 请求旧执行
- **WHEN** 客户端请求旧收尾写动作
- **THEN** 不执行任何副作用，提示通过独立收尾处理；历史 inspect 仍可用。
