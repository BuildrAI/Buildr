## ADDED Requirements

### Requirement: 治理测试必须优先证明结果不变量
Buildr Product MUST 让治理测试优先断言 machine-readable authority、authorization、identity、public result、effects 与 failure isolation；只验证 Skill 固定措辞、篇幅、章节位置或 Agent 方法顺序的测试 MUST NOT 成为行为正确性的 primary evidence owner。Skill frontmatter、capability binding、contract identity、受管投射和明确安全禁止项 MAY 由 Static Conformance 验证，但 MUST 与 Application 或公共入口的可观察结果保持分离。

#### Scenario: Skill 改写但公共行为不变
- **WHEN** Skill 在不改变 capability、contract、安全边界或公共结果的前提下调整措辞、章节或示例顺序
- **THEN** 行为测试 MUST继续通过
- **AND** Static Conformance MUST只检查稳定machine-readable边界或明确禁止项，不得要求恢复旧句子

#### Scenario: 公共结果违反治理不变量
- **WHEN** Application、CLI、HTTP或正式Result把局部失败扩大为无关动作阻塞，或把claimed success当作专业事实
- **THEN** 对应最低充分行为测试 MUST失败
- **AND** Skill文本仍包含正确说明 MUST NOT使该失败通过

### Requirement: 前序治理贡献必须具有跨路径一致性矩阵
Buildr Product MUST 为自动路径、Agent直接路径、PR/CI路径、正式事实对账和unrelated failure isolation维护一个可执行的结果不变量集合。集合 MUST复用各专业owner的最低充分测试，不得创建第二份Task、Parent、Verification或Release authority；每项关键事实 MUST只有一个primary evidence owner，辅助测试可以验证组合一致性。

#### Scenario: 多条合法路径形成同一结果
- **WHEN** 自动Finish、Agent直接Git/PR后对账或CI交付产生可独立核验的matching事实
- **THEN** 测试 MUST证明Delivery投影使用相同Task Contribution与remote identity不变量
- **AND** Activation、Environment Cleanup与Diagnostics MUST保持正交，不得反向撤销Delivery

#### Scenario: 无关模块失败
- **WHEN** Doctor、optional capability、Declaration、UI读取或其他局部owner返回与当前动作无关的attention或failure
- **THEN** 测试 MUST证明当前不消费该owner的安全动作仍可继续
- **AND** 真实authorization、identity、shared history、external side effect与cleanup ownership门禁 MUST继续失败关闭

### Requirement: 开发反馈、完整Candidate与正式Release不得重复主证据
Buildr Product MUST让focused/changed/affected开发反馈、冻结source上的完整Product Candidate与正式Release artifact验证各自只承担其primary evidence；同一执行内每个verification step MUST去重，同一冻结Candidate MUST只生成一个不可变tarball，正式publish MUST消费该tarball及matching Candidate evidence而不得重跑完整Candidate regression。

#### Scenario: 开发阶段选择affected反馈
- **WHEN** Agent或PR对未冻结内容运行changed、focus或affected入口
- **THEN** planner MUST只选择真实受影响owner及其admission依赖
- **AND** 该入口 MUST NOT隐式调用完整Candidate profile或把开发反馈声明为完整Candidate

#### Scenario: 冻结内容形成完整Candidate
- **WHEN** current source与planning bytes冻结并启动完整Product Candidate
- **THEN** verifier MUST运行完整required owner集合且每个step最多一次
- **AND** 所有artifact consumer MUST消费同一个source、registry与tarball identity

#### Scenario: 正式发布消费Candidate
- **WHEN** maintainer授权对matching current main Candidate执行正式release workflow
- **THEN** workflow MUST验证、恢复或一次性构建同一冻结tarball并完成tag、npm integrity、dist-tag、GitHub Release与安装后readback
- **AND** workflow MUST NOT调用完整Product Candidate入口或重新生成第二份可发布bytes
