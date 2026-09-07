## MODIFIED Requirements

### Requirement: 发布身份链必须只组合current owner facts
Buildr MUST以`dev baseline → ordered selection chain → release HEAD/tree → Product Candidate generation → frozen tarball manifest/integrity → main tree → post-publication dev provenance reconciliation → transaction evidence`作为唯一发布身份链。Task correlation MUST只组合Task Record、Task Environment、真实Git/remote、self-bootstrap和当前发布owner事实，MUST不包含Task Development、Task Candidate、Development Handoff或旧Task Finish history。

#### Scenario: release内容变化
- **WHEN** current release HEAD或tree不等于Product Candidate、artifact、readiness或transaction context保存的source
- **THEN** 所有下游evidence MUST标记stale或blocked并拒绝进入tag/npm mutation
- **AND** Buildr MUST形成新的matching Product Candidate generation和唯一tarball

#### Scenario: 关联Task与发布事实
- **WHEN** release transaction读取协调Task和support Tasks
- **THEN** correlation MUST使用Task Record、Environment及真实交付/发布facts构造closed context
- **AND** Development或legacy Finish缺失 MUST不是finding或unknown role

#### Scenario: Delivery 已成立但后续维护失败
- **WHEN** 真实Git/remote已证明support delivery但Activation、Environment Cleanup或Diagnostics失败
- **THEN** correlation MUST保留已成立的Delivery role并分别表达后续attention
- **AND** MUST不读取旧Finish历史或撤销Delivery

#### Scenario: portable read model 输出
- **WHEN** release consumer请求Task correlation
- **THEN** 输出 MUST只包含保留owner的portable identity、digest、status和diagnostic refs
- **AND** MUST不包含Development、legacy Finish、SQLite路径、Result正文或历史stdout

#### Scenario: 证据缺失或跨运行
- **WHEN** 任一仍必需的Task、Environment、Git、Product Candidate或publication事实缺失、stale或跨运行
- **THEN** correlation MUST返回对应owner的blocked或unknown finding
- **AND** MUST不从已删除历史推断缺失事实

### Requirement: 发布模块必须保持唯一owner与窄consumer边界
`tools/release` MUST只拥有release selection、task correlation、readiness/convergence adapter、post-publication dev provenance reconciliation和checkout-only Git provenance；`verification` MUST继续拥有Product Candidate、verification evidence和唯一tarball。发布模块 MUST不读取Task Development或旧Finish repository，也 MUST不改变Product Candidate模型。

#### Scenario: 模块消费其他owner事实
- **WHEN** release readiness需要任务关联
- **THEN** consumer MUST调用Task Record与Environment的窄read model并核验真实Git/发布facts
- **AND** MUST不恢复Development/Finish compatibility role或建立旁路store

#### Scenario: 发布后维护部分失败
- **WHEN** Publication已成立但Activation、Environment Cleanup、Diagnostics或dev provenance reconciliation失败
- **THEN** 系统 MUST保留Publication并按失败owner报告恢复动作
- **AND** MUST不需要或恢复legacy Task Finish Application
