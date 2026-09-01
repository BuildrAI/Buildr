## ADDED Requirements

### Requirement: Task Development必须与Task Verification独立
Task Development MUST NOT声明、调用或依赖Task Verification Application、Persistence、Skill或capability。Development Receipt、Candidate、gate、decision、handoff、current input discovery与next action MUST NOT包含verification policy、Verification Result/Report digest、Formal Verification Readiness或Task Verification outcome。

#### Scenario: Development形成Candidate和handoff
- **WHEN** Task Development根据自身Task context、planning、Content Target、Completion Review和Current Knowledge形成Candidate或handoff
- **THEN** Application MUST不读取Task Verification报告或项目测试地图
- **AND** Task Verification报告缺失、失败、stale或损坏MUST不阻止Development mutation

#### Scenario: Task Verification报告独立变化
- **WHEN** Agent新建、替换或使Task Verification报告stale
- **THEN** Development Receipt、Candidate generation、decision与handoff MUST保持不变
- **AND** Application MUST不把报告变化投影为Development gate变化

### Requirement: Development current input discovery不得编排任务验证
Task Development current input discovery MUST只返回Development自身合法mutation所需的current facts。它 MUST NOT接收Formal Plan文件、生成verification policy、调用Task Verification declaration observation或推荐verification run/reconcile。

#### Scenario: Content Target已经稳定
- **WHEN** current Content Target形成且Development需要下一动作
- **THEN** next action MAY继续Development自己的Review、Knowledge、Candidate或handoff流程
- **AND** MUST NOT把Task Verification设为结构性前置；Agent按独立Skill决定何时执行和记录验证

## MODIFIED Requirements

### Requirement: Development Receipt 必须使用关闭且最小的数据模型
Receipt MUST只包含`schemaVersion`、`taskId`、Environment逻辑引用`environment`、`taskContext`、`planning`、可为空的`contentTarget`、`generation`、`candidate`、Completion/Planning专业引用、`currentKnowledge`、`decision`、不可变`handoffs`、`createdAt`与`updatedAt`。Receipt MUST NOT保存verification policy、Task Verification Result/Report、verification gate、Formal Plan、Formal Verification Readiness、source diff、命令输出、绝对路径、Environment资源、聊天、隐藏推理、revision、锁或lease。

#### Scenario: 调用方提交Verification字段
- **WHEN** action input或持久Receipt包含`verificationPolicy`、verification gate、Task Verification digest、Formal Plan或readiness
- **THEN** Application MUST拒绝新写入值
- **AND** 历史Receipt MAY只读投影但MUST不再驱动current Development行为

#### Scenario: 调用方提交未知 authority 字段
- **WHEN** action input或持久Receipt包含progress、attempt、raw evidence、Result body、Git状态、Task Verification或其他未知authority字段
- **THEN** Application MUST拒绝整个值并保留原current
- **AND** MUST返回精确forbidden field diagnostic

#### Scenario: Content Target尚未形成
- **WHEN** Receipt只记录proposal、design、review disposition或其他planning facts
- **THEN** `contentTarget` MUST为null且inspect MUST返回missing applicability
- **AND** Candidate、decision与handoff MUST保持null或空数组

#### Scenario: 原子替换中断
- **WHEN** serialization、SQLite mutation或post-read任一阶段失败
- **THEN** Repository MUST rollback并保留原current Receipt与所有sibling records
- **AND** MUST NOT产生部分row、backup file或兼容YAML

## REMOVED Requirements

### Requirement: Verification policy decision 必须由 Development 独占
**Reason**: Development policy不再存在。
**Migration**: Agent根据项目测试地图独立选择测试。

### Requirement: Formal Verification readiness 必须在稳定目标交接处只读派生
**Reason**: Task Verification不再是Development阶段交接。
**Migration**: 删除readiness投影。

### Requirement: Formal Verification 必须绑定 current Candidate
**Reason**: Task Verification报告不绑定Candidate。
**Migration**: 报告绑定Task内容版本。

### Requirement: Task Development MUST provide current closed mutation input discovery
**Reason**: 旧discovery混合了verification policy编排。
**Migration**: 由新的Development-only discovery Requirement取代。

### Requirement: Task Development 必须在稳定目标后优先消费正式验证计划
**Reason**: Formal Verification Plan删除。
**Migration**: Agent直接执行项目测试。

### Requirement: Task Development policy discovery 必须消费Task Verification的closed投影
**Reason**: Task Development不再消费Task Verification。
**Migration**: 无。

### Requirement: Task Development 必须正式支持仅工作区 verification policy
**Reason**: verification policy和workspace-only特殊分支删除。
**Migration**: 所有Task使用同一独立报告模型。

### Requirement: Candidate必须绑定policy而非持久化Formal Plan集合
**Reason**: verification policy与Formal Plan均删除。
**Migration**: Candidate只绑定Development自身输入。
