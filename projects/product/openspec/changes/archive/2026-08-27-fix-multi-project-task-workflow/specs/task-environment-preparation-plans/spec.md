## ADDED Requirements

### Requirement: 多Project Formal Plans必须形成一次完整准备闭包
Task Verification MUST从当前有效Project的完整Formal Plan documents形成全部selected capability preparation requirements的去重排序并集，并生成一次closed Task Environment Plan Request。Task Environment MUST以该完整请求整值替换current Plan并幂等复用仍current的Step；单Project局部请求 MUST NOT在多Project formal workflow中覆盖其他current Project requirement。

#### Scenario: 三个Project具有不同准备要求
- **WHEN** 三个有效Project的Formal Plans分别选择不同capability preparation Recipe
- **THEN** 聚合preview MUST返回同时包含三组requirements的唯一Plan Request
- **AND** Task Environment一次prepare后每个Project的formal run admission MUST为ready

#### Scenario: 第二个Project局部请求不会删除第一个Project准备
- **WHEN** current Environment已包含Project A requirement，而Project B Plan形成局部action-required事实
- **THEN** workflow MUST先用完整Formal Plan集合重建A与B的精确并集再提交prepare
- **AND** MUST不直接提交只含B的请求使A重新变为unplanned

#### Scenario: Formal Plan集合变化
- **WHEN** Project Plan删除、替换capability或改变capability identity
- **THEN** 新完整Plan Request MUST移除不再属于current Plan集合的陈旧requirements
- **AND** MUST不以历史累积方式永久保留旧capability preparation
