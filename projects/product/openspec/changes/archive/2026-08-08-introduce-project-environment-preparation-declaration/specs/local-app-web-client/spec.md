## ADDED Requirements

### Requirement: Environment Tab必须展示Preparation来源与分层readiness
Local App Environment Tab MUST从Task Environment saved-current read model展示Plan来源、Project Declaration、scope、Recipe与Step状态、identity、最近观察、diagnostic和本次prepare执行事实。页面 MUST不把同一Step probe复制为多个scope事实。

#### Scenario: 多Service Receipt
- **WHEN** Receipt包含`buildr`与`buildr-web`两个Service Recipe
- **THEN** 页面 MUST分别展示两个Recipe及其Step状态
- **AND** 任一blocked MUST在Environment聚合结论中可见

#### Scenario: task-inline Receipt
- **WHEN** Plan来源为`task-inline`
- **THEN** 页面 MUST明确显示该来源没有长期Declaration
- **AND** MUST提供由Agent初始化Project声明的next action提示而不直接写文件
