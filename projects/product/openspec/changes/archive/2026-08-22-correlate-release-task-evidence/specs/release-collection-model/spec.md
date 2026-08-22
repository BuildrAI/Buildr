## MODIFIED Requirements

### Requirement: 发布身份链必须只组合current owner facts
Buildr MUST以`dev baseline → ordered selection chain → release HEAD/tree → Product Candidate generation → frozen tarball manifest/integrity → main tree → post-publish dev convergence → transaction evidence`作为唯一发布身份链。每个节点 MUST由其专业owner形成current identity或portable read model；下游 MUST只引用最低充分identity/digest，不得复制专业Result正文、caller-claimed success或历史stdout。关联release/support Tasks、Task Environment、Task Development handoff、Task Contribution、Task Finish Delivery、Execution Record与matching self-bootstrap Activation时，release consumer MUST通过唯一组合器形成稳定的release evidence carrier与transaction context identity；该组合器 MUST只保存owner references、identity、digest、status和诊断引用，不得建立旁路SQLite authority或复制专业Result。

#### Scenario: release内容变化
- **WHEN** current release HEAD或tree不等于Candidate、artifact、readiness或transaction context保存的source
- **THEN** 所有下游evidence MUST标记stale或blocked并拒绝进入tag/npm mutation
- **AND** Buildr MUST形成新的matching Candidate generation和唯一tarball，不得拼接旧run证据

#### Scenario: 关联Task与发布事实
- **WHEN** release transaction需要关联release/support Tasks、Environment、Development、Finish与self-bootstrap
- **THEN** correlation MUST从各Application的current read model和真实Git/GitHub/npm facts构造closed context
- **AND** correlation MUST返回唯一carrier/context identity、参与的owner references与digests、source tree/remote identities和可定位的Execution Record/diagnostic refs
- **AND** 自动Finish、直接Git/PR后的Finish reconcile与matching self-bootstrap MUST映射为同形的evidence roles
- **AND** Task Record MUST继续只保存既有顶层、Parent与retrospective关系
- **AND** MUST NOT新增release旁路SQLite slot、复制Result或接受caller提交的完成结论

#### Scenario: 证据缺失或跨运行
- **WHEN** 任一必需 owner read model 缺失、stale、schema 不受支持、跨 run 或与 source/carrier digest 不一致
- **THEN** correlation MUST返回结构化 `blocked` 或 `unknown` finding、保留缺失/冲突的 owner reference 与 next action
- **AND** consumer MUST NOT把该 context 当作 release readiness 或 protected transaction 的通过证据
- **AND** correlation MUST NOT从历史 stdout、Task Record 状态、文件路径或 caller assertion 猜测缺失事实

#### Scenario: Delivery 已成立但后续维护失败
- **WHEN** Finish Delivery 已由真实 remote/readback 确认，但 self-bootstrap Activation、Environment Cleanup 或 Diagnostics 尚未成立
- **THEN** carrier MUST保留独立的 Delivery evidence role 为 current
- **AND** Activation、Cleanup 与 Diagnostics MUST分别返回其自身的 blocked/attention/unknown 状态
- **AND** correlation MUST NOT撤销或改写已经成立的 Delivery identity

#### Scenario: portable read model 输出
- **WHEN** release consumer 请求关联结果
- **THEN** 输出 MUST包含 schema/version、carrier/context identity、evidence roles、overall status、owner references/digests、source identities、diagnostic refs和next actions
- **AND** 输出 MUST NOT嵌入专业Result正文、完整stdout、attempt history、本地SQLite路径或 caller 提交的完成布尔值
