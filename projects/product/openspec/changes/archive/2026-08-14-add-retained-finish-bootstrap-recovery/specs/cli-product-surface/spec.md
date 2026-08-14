## ADDED Requirements

### Requirement: Task Finish run 必须只把 bootstrap recovery 暴露为显式 existing-run 选项

CLI MAY为现有`task finish run`增加`--bootstrap-recovery`，但MUST NOT增加新的Finish action或pre-registry执行入口。首次使用MUST要求`--run <run-id>`与合格的retained preflight/prepare provider failure；blocked resume MUST同时要求current Product `--resume` token。帮助与结构化诊断MUST把该模式描述为异常的retained-writer provider recovery，而不是通用重试、candidate CLI或alternate writer。

#### Scenario: 用户显式调用合格恢复

- **WHEN** 用户对已有合格run调用`task finish run --run <run-id> --bootstrap-recovery`
- **THEN** canonical retained registry与Task Finish Application MUST解析同一个run action
- **AND** Application MUST在普通Product provider import前完成资格、authority与Execution Record gate
- **AND** 普通Task Finish参数、Application与Result schema MUST继续保持权威

#### Scenario: 调用方尝试通用fallback

- **WHEN** 缺少existing run、failure不合格、phase不支持，或调用方提供source、module、manifest、tarball等executable selector
- **THEN** CLI MUST返回稳定的fail-closed diagnostic
- **AND** MUST NOT import candidate provider、创建capsule或改变Finish run

#### Scenario: provider authority已经撤销

- **WHEN** bootstrap run的全部phase已通过、capsule authority已撤销，但terminal persistence返回current resume token
- **THEN** 同一run MUST只执行retained finalizer resume
- **AND** CLI MUST NOT要求或重新导入candidate provider
