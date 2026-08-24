## ADDED Requirements

### Requirement: Task Environment no-change cleanup 资格必须由Application派生
公开`task environment cleanup` CLI MUST只负责触发Task Environment Application并输出结果。CLI MUST NOT接受no-change flag、caller-authored provider result、任意integrated ref或删除路径；no-change cleanup资格 MUST由Application从current Task Record派生，并由provider按Environment evidence复核。

#### Scenario: public cleanup 处理 completed no-change Task
- **WHEN** 调用方对current Task Record为`completed + noChange=true`的Task运行`task environment cleanup`
- **THEN** CLI MUST不要求额外Delivery参数，并把Application与provider形成的current结果原样返回
- **AND** 调用方 MUST NOT能够通过命令参数覆盖Task Record终态或Git provider proof

#### Scenario: 调用方尝试伪造 no-change cleanup 输入
- **WHEN** 调用方向public cleanup命令提供no-change claim、provider result、integrated ref或删除路径
- **THEN** CLI MUST在Application mutation前拒绝未知参数，且 MUST不修改Environment Receipt或Git evidence
