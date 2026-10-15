## MODIFIED Requirements

### Requirement: 代表性基础证明
Buildr Product MUST 以真实专业模块的自动测试证明分类契约可落地，至少覆盖局部硬阻断、attention/无关动作继续和安全降级，同时保持身份、授权、证据真实性与危险副作用的 fail-closed 边界。测试 MUST 断言结果不变量，不得只断言固定 Skill 措辞、文档段落或流程顺序。

#### Scenario: Project准备入口缺口
- **WHEN** 当前验证动作缺少selected capability所需的Project准备入口
- **THEN** 自动测试 MUST证明该缺口只阻止依赖它的验证动作，并提供Declaration Intake恢复方向
- **AND** MUST证明无关开发不被该缺口阻止

#### Scenario: Task Finish 入口缺口
- **WHEN** 收尾涉及的具体写入、交付或清理能力不能证明目标身份、当前版本、授权或资源归属
- **THEN** 自动测试 MUST 证明对应能力在危险副作用前拒绝该动作，并保留此前已成立的事实与未解决缺口
- **AND** 智能体（Agent）MUST 继续不依赖该缺口的已授权安全动作；必要成果仍未完成时不得报告整个目标完成
- **AND** MUST NOT 要求旧收尾运行（Finish Run）、统一就绪状态或替代状态库，也不得将局部失败解释为取消其他专业事实或智能体（Agent）的全局工作许可
