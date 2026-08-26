## ADDED Requirements

### Requirement: Task Retrospective 必须探索并共同确认确定性流程候选
Task Retrospective provider MUST在生成或处理复盘时，从当前session/runtime可访问的任务执行过程事实与已有current复盘中主动探索确定性流程候选。候选 MUST基于重复或高成本/高风险证据，说明closed输入、Owner、停止条件、结果证据、可恢复性、预期收益、仍由人和Agent保留的判断与建议资产落点；不存在可信候选时 MUST如实说明。候选 MUST NOT把推荐路径变成唯一合法路径、通用许可层或Task生命周期门禁，也 MUST NOT自动创建/关联Task、修改Rule/Skill/workflow、建立审批/事件/history平台，或把专业判断收回Buildr状态机。

#### Scenario: 从任务执行过程发现候选
- **WHEN** 当前可见的Task Record时点、Development/Review/Verification/Execution Record/Finish timing、工具结果或重复尝试证明一组机械步骤具有稳定输入和结果
- **THEN** Agent MUST评估该步骤是否具备closed输入、唯一Owner、明确停止条件、可验证结果与幂等恢复边界
- **AND** 可信候选 MUST说明仍保留给人和Agent的目标、业务判断、风险取舍与授权

#### Scenario: 既有复盘提供候选证据
- **WHEN** 同一Task已有current复盘，或批量处理的多份current复盘描述相同或相近的重复步骤、等待、错误恢复或高成本边界
- **THEN** Agent MUST结合当前事实重新评估并按实际目标聚类、合并或丢弃候选
- **AND** MUST NOT机械复述旧报告、按关键词自动聚类或把旧候选视为仍有效

#### Scenario: 候选违反Buildr产品哲学
- **WHEN** 候选要求普通Agent动作必须经过Buildr、扩大为通用许可层、自动替代业务判断、建立新生命周期gate，或把推荐流程变成唯一合法路径
- **THEN** provider MUST拒绝把它作为可固化候选
- **AND** MUST说明违反的权威/判断边界，并保留Agent可在现有授权与安全边界内直接执行的路径

#### Scenario: 候选交给人共同确认
- **WHEN** Agent已形成一项或多项可信确定性流程候选
- **THEN** provider MUST向一人或多人展示候选证据、边界、预期收益、风险、建议落点与完整拟Task effects
- **AND** 只有人明确接受且重新inspect后事实与effects未实质变化，Agent才可按既有Task Retrospective授权规则创建或关联承接Task并处置来源复盘

#### Scenario: 没有可信候选
- **WHEN** 可见证据不足、步骤仍依赖业务语义、输入或停止条件无法闭合，或预期收益不足
- **THEN** 复盘 MUST如实保留普通优化方向或说明没有可信确定性流程候选
- **AND** MUST NOT为了填充候选而估算隐藏事实、创建分析状态或扩大任务调查范围

#### Scenario: 候选选择正确资产落点
- **WHEN** 人确认继续探索或承接一项确定性流程候选
- **THEN** Agent MUST区分价值观/边界的Rule、Agent判断方法的Skill、固定机械顺序的Application/CLI workflow与不变量/跨版本边界的checker/test
- **AND** MUST尽量把重叠方向合并为少量纵向Task，不自动修改任何目标资产
