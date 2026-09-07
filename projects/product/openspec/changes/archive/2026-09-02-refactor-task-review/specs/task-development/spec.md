## REMOVED Requirements

### Requirement: Planning Review 必须在Candidate前保持current
**Reason**: Task Review是可选专业判断，不是Candidate准入或Development current事实。
**Migration**: Candidate只校验Development自身planning、Task context、Content Target与Change disposition。

#### Scenario: 没有Planning Review冻结Candidate
- **WHEN** Development自身Candidate输入current且没有Planning Review
- **THEN** freeze MUST按自身事实继续

### Requirement: Completion Review 必须绑定Candidate且由Development消费
**Reason**: Completion Review可审查任意真实完成对象，Development不应成为其producer或consumer。
**Migration**: Agent自行选择Review subject；Development不读取Result。

#### Scenario: 没有Completion Review形成handoff
- **WHEN** Development自身Candidate、Current Knowledge和decision满足handoff条件
- **THEN** handoff MUST不读取或要求Completion Review

## ADDED Requirements

### Requirement: Task Development必须与Task Review独立
Task Development module MUST不依赖Task Review Application，不读取Review Result、不保存新的Planning/Completion gate，也不因Review缺失、结论或变化改变Candidate、Current Knowledge、decision或handoff。旧Receipt/Handoff gate只作历史decode。

#### Scenario: Review结果在Candidate后变化
- **WHEN** Agent新增或替换Task Review current Result
- **THEN** Development Receipt、Candidate generation和handoff MUST保持不变
- **AND** Development inspect MUST不报告Review blocker或推荐Review action

#### Scenario: 没有Review形成Candidate
- **WHEN** Development自身Task context、planning、Content Target和Change disposition满足Candidate条件
- **THEN** freeze MUST形成或复用Candidate
- **AND** MUST不调用Review Application或补造not-applicable gate

## MODIFIED Requirements

### Requirement: Candidate identity 与generation必须只由Development生成
Application MUST只在Task context、stable Content Target与planning snapshot current且Change非pending时冻结Candidate。Candidate closed value与既有identity算法保持不变；Review、Verification与Current Knowledge均不得进入Candidate identity。Content Target或Task Context变化使Candidate失效；Review、Verification或Current Knowledge变化不得改变Candidate identity或generation。

#### Scenario: 首次冻结Candidate
- **WHEN** Development自身Candidate输入完整且当前没有Candidate
- **THEN** Application MUST生成generation 1与唯一Candidate identity
- **AND** Review/Verification Result、knowledge disposition、Environment identity、时间、branch或commit MUST NOT进入Candidate

#### Scenario: 已有current Candidate重复freeze
- **WHEN** Task Context与Content Target均未变化且current Candidate仍适用
- **THEN** freeze MUST幂等返回同一Candidate/generation
- **AND** MUST NOT因Review、Verification或knowledge变化递增generation

#### Scenario: 失效后形成下一代Candidate
- **WHEN** 旧Candidate已因Content Target或Task Context变化失效，新的事实重新满足freeze条件
- **THEN** Application MUST生成严格大于旧generation的新Candidate
- **AND** Receipt MUST只保留新current Candidate，既有正式handoff snapshots保持不可变

### Requirement: Development 必须独占proceed/blocked、scoped risk与Finish handoff
Task Development MAY根据current Candidate与current knowledge disposition形成`proceed|blocked` decision。只有current Candidate、非blocked Current Knowledge和绑定该Candidate的`proceed` decision同时成立时，Application MAY形成immutable handoff。新handoff MUST保存空planning/completion/verification gates与空risks；历史gate/risk只读decode，不得恢复为current准入。

#### Scenario: 全部正向gate满足且决定proceed
- **WHEN** current Candidate、非blocked Current Knowledge与proceed decision成立
- **THEN** Application MUST形成绑定Candidate、knowledge与decision的Finish handoff
- **AND** handoff MUST不包含Review/Verification Result、raw output、临时路径或delivery execution plan

#### Scenario: 用户接受负向Verification或Completion风险
- **WHEN** Review或Verification存在负向结论且用户决定继续研发交接
- **THEN** Agent MAY保留该专业事实并依据实际授权继续其他动作
- **AND** Development MUST不保存Result digest、risk acceptance或把专业结论改写为gate

#### Scenario: handoff后上游漂移
- **WHEN** planning snapshot、Content Target、Task context、Candidate或Current Knowledge变化
- **THEN** Application MUST清除current decision、判定旧snapshot不再current并返回task-development建议
- **AND** Review或Verification单独变化 MUST NOT使handoff失效

### Requirement: Task Development 必须覆盖完整正式研发区间
Task Development MUST从active Task的首个正式研发动作开始维护自身聚合事实，直到形成current Finish handoff。Proposal、design等planning节点存在时只保存专业authority、portable reference、identity与disposition；Task Review与Task Verification保持独立，不写入Development。

#### Scenario: 从 proposal 开始正式研发
- **WHEN** active Task在ready Environment中开始创建proposal且尚未形成Content Target
- **THEN** Development Application MUST原子建立Receipt与current planning snapshot
- **AND** Receipt MUST不创建Content Target、Candidate、Result gate、decision或handoff占位事实

#### Scenario: code-only Task 直接实现
- **WHEN** Task没有proposal、design或Change且首个正式研发动作为代码实现
- **THEN** Development MUST接受空planning nodes与空Change references并开始维护研发事实
- **AND** MUST NOT为了流程完整虚构OpenSpec、Review或其他节点

#### Scenario: 用户主动跳过节点
- **WHEN** 用户或具备业务授权的来源明确跳过一个适用planning节点
- **THEN** Development planning node MUST记录`waived`、目标、summary与authorization source
- **AND** MUST NOT把waiver写成Task Review、Verification或其他专业Result

### Requirement: OpenSpec planning target 必须使用语义身份
Task Development consumer为OpenSpec planning登记target时 MUST使用Task Planning Identity Application返回的aggregate identity与artifact semantic nodes。Development Receipt只保存opaque target与最小nodes；Task Review可选地使用同一identity作为真实subject，但不是Development依赖。

#### Scenario: 仅执行进度或provenance改变
- **WHEN** resolver证明OpenSpec semantic target未变但provenance或checklist事实变化
- **THEN** consumer MUST保持相同Development planning target
- **AND** Agent自行判断是否需要新的Planning Review

#### Scenario: resolver target变化或blocked
- **WHEN** resolver返回不同target或blocked diagnostic
- **THEN** consumer MUST分别更新Development planning或停止对应Development mutation
- **AND** MUST NOT以旧target、raw artifact digest或手工摘要满足planning输入

### Requirement: Buildr Web 必须只读投影任务研发 read model
Buildr Web MUST通过Task Development Application `inspect`展示Development presence、保存的applicability、planning、Task context、Content Target、Candidate/generation、Current Knowledge、decision与最近handoff。页面 MUST不展示或解释Planning/Completion/Verification gate、Review Result或risk acceptance，也不提供Receipt mutation。

#### Scenario: 查看 current Development
- **WHEN** 保存的Development applicability status为`planning|developing|candidate-current|handoff-current`
- **THEN** 页面 MUST显示对应研发状态与自身facts
- **AND** MUST不从Review或Verification重算状态

#### Scenario: Development 尚未形成
- **WHEN** Application `inspect`返回missing
- **THEN** 页面 MUST显示尚未形成且不创建占位Receipt

#### Scenario: 只有planning facts
- **WHEN** Receipt只有planning nodes且Content Target仍为null
- **THEN** 页面 MUST展示节点authority、reference与disposition并显示规划中
- **AND** MUST不显示Review gate、waiver或尚未形成的Candidate错误

#### Scenario: 当前环境不可观察但历史交接存在
- **WHEN** Receipt只有最近一次保存的applicability或历史handoff
- **THEN** 页面 MUST保留展示planning、Candidate、decision与handoff摘要并标明保存时状态
- **AND** MUST不在GET中重新观察Environment、Git、Review或Verification

#### Scenario: 安全读取 Development
- **WHEN** 客户端发起Development GET
- **THEN** API MUST返回Application read model并使用no-store语义
- **AND** 非法参数、未知Task或写方法 MUST fail closed且零写入

#### Scenario: 展示最小研发信息
- **WHEN** Receipt包含长identity、多个nodes或handoff
- **THEN** 页面 MUST默认展示当前identity、节点、Candidate、Current Knowledge、decision与最近handoff
- **AND** MUST不展示gate摘要、风险数量、日志、diff、隐藏推理或专业Result body

### Requirement: Task Development driver 必须提供紧凑 current 与 next-action 投影
driver MAY从同一次Development operation result提供紧凑current与建议动作，但 MUST只依据Development自身事实，不推荐或要求Task Review/Verification作为推进门禁。

#### Scenario: 显式请求紧凑反馈
- **WHEN** Agent显式传入compact选项
- **THEN** driver MUST只执行一次对应Application action并返回版本化compact投影
- **AND** 不得额外读取Review或Verification

#### Scenario: 需要完整研发事实
- **WHEN** Agent未请求compact或需要完整Receipt
- **THEN** driver MUST保持完整operation result authority
- **AND** compact projection MUST NOT替代Application、repository或Receipt

#### Scenario: 建议不能自动推进
- **WHEN** current facts指向develop、freeze、knowledge、decision、handoff或report
- **THEN** result MAY返回对应建议动作
- **AND** MUST不返回Planning/Completion Review gate建议或自动推进

### Requirement: Task Development必须与Task Verification独立
Task Development MUST NOT声明、调用或依赖Task Verification Application、Persistence、Skill或capability；同样 MUST不依赖Task Review。Receipt、Candidate、decision、handoff与next action MUST不包含新的专业Result digest或gate。

#### Scenario: Development形成Candidate和handoff
- **WHEN** Task Development根据自身Task context、planning、Content Target和Current Knowledge形成Candidate或handoff
- **THEN** Application MUST不读取Task Verification或Task Review
- **AND** 两类Result缺失、失败、变化或损坏 MUST不阻止Development mutation

#### Scenario: Task Verification报告独立变化
- **WHEN** Agent新建、替换或使Task Verification报告stale
- **THEN** Development Receipt、Candidate generation、decision与handoff MUST保持不变
- **AND** Application MUST不把报告变化投影为Development gate变化
