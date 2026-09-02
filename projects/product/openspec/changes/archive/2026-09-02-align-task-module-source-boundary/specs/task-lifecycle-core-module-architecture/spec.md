## MODIFIED Requirements

### Requirement: Task 模块入口必须以独立专业 descriptor 唯一装配核心能力
Buildr MUST由唯一Task module为保留的专业能力声明required/provided capabilities与contributions；本次直接重写的Overview、Repository和HTTP契约 MUST使用严格TypeScript单一人工源码。Bootstrap MUST不安装Development、Planning Identity、legacy Finish或Terminal Delivery descriptor。

#### Scenario: 创建 Bootstrap runtime
- **WHEN** Bootstrap组装Task modules
- **THEN** registry MUST只安装保留能力
- **AND** runtime MUST不存在退役Application和persistence methods

#### Scenario: 专业 Application 保存 current facts
- **WHEN** Task Record、Environment、Review、Verification或Retrospective写入自己的current事实
- **THEN** mutation MUST只经过所属descriptor的私有repository
- **AND** MUST不存在统一Task lifecycle writer
