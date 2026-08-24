## ADDED Requirements

### Requirement: Task Overview 必须返回面向用户的正交结果摘要
Task Overview Application MUST 从同一只读查询取得的Task intent与已保存Development、Environment和compact Finish current payload派生closed用户摘要，至少分别表达目标、Delivery、Activation、Cleanup、局部attention与必要authorization。该摘要 MUST 保持这些结果正交，MUST NOT以Activation、Cleanup或Diagnostics失败撤销已保存Delivery，也 MUST NOT复制完整专业Result、执行外部观察或建立第二writer。

#### Scenario: 已交付但激活或清理需要关注
- **WHEN** compact terminal Finish已保存Delivery成功，同时Activation或Cleanup保存attention/failed/blocked事实
- **THEN** Overview MUST将Delivery显示为delivered并分别返回Activation与Cleanup状态
- **AND** MUST把后两者形成局部attention而不把Delivery改为失败

#### Scenario: 仍需用户授权
- **WHEN** saved professional current fact明确要求业务风险接受、长期scope决定或危险外部效果授权
- **THEN** Overview MUST在authorization中返回专业owner、动作与人类可读摘要
- **AND** MUST NOT要求用户处理digest、token、Receipt或内部恢复步骤

#### Scenario: 专业事实尚未形成
- **WHEN** Task尚无matching Development、Environment或Finish current row
- **THEN** Overview MUST对相应用户结果返回稳定`unknown`或`not-applicable`语义
- **AND** MUST NOT从Task status、Git、文件或聊天内容猜测结果
