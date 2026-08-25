## ADDED Requirements

### Requirement: Product live声明必须采用v3高级provider边界

Buildr Product live `verification.yml` MUST使用closed `buildr.project-verification/v3`。正式Product registry能力 MUST通过稳定`product.verification` capability和`buildr.product-verification/v1` provider投射统一Request、Plan和execution units；Browser条件能力 MUST保持独立command capability与真实resource/preparation边界。Product declaration MUST不把Quick开发反馈或registry内部step逐项复制为正式capability。

#### Scenario: Product Task Delivery affected

- **WHEN** Product live v3 declaration收到`task-delivery`、`affected` Request与可信changed paths
- **THEN** `product.verification` provider MUST形成包含direct/dependency选择原因的统一Plan
- **AND** registry、ownership或planner authority变化 MUST显式升级full或blocked，不得返回空passed

#### Scenario: Product Artifact Candidate full

- **WHEN** Product live v3 declaration收到`product-candidate`、`full` Request
- **THEN** provider MUST选择完整daily evidence与Candidate artifact evidence并返回provider identity
- **AND** declaration MUST不复制内部profile membership、DAG、budget或primary owner

#### Scenario: Published Release只形成release-only验证计划

- **WHEN** Product live v3 declaration收到`published-release`、`release-only` Request
- **THEN** provider MUST只选择已登记release contract/smoke evidence并明确其Plan identity
- **AND** 该结果 MUST不冒充真实publish transaction、published install或registry readback authority

#### Scenario: Browser capability独立选择

- **WHEN** changed paths命中Buildr Web、tracked web-dist或browser selector authority
- **THEN** planner MUST选择独立`product.browser-smoke` command capability及browser resource claim
- **AND** 非Browser Product full或Candidate MUST不因declaration重复而无条件执行第二份Browser graph

#### Scenario: Quick不进入正式usable target

- **WHEN** 维护者审查Product live v3 declaration
- **THEN** `product.fast`与`test:fast` MUST只保留为开发反馈入口而不成为`task-delivery|product-candidate|published-release` capability
- **AND** 正式evidence MUST由provider或独立声明能力产生
