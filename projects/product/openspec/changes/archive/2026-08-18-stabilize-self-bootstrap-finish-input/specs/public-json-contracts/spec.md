## ADDED Requirements

### Requirement: Task Finish 必须提供稳定的自举输入公开投影
`buildr task finish run|inspect --detail self-bootstrap --json` MUST 返回 `buildr.task-finish-self-bootstrap-input/v1`。该投影 MUST 由 Product 从当前及有界支持的旧 canonical Task Finish Result 归一化生成，且 MUST 使用稳定字段表达 Task/run/Workspace/target identity、Finish status/mode、self-bootstrap applicability、Workspace repository、排序的 repository carrier 集合、run-owned carrier container、activation paths、delivery refs、resume、Delivery Adaptation 与 cleanup facts；MUST NOT 要求消费者识别内部 `buildr.task-finish-result/v<major>` 结构。

#### Scenario: 当前多仓库 Result 形成稳定投影
- **WHEN** Agent 对 `buildr.task-finish-result/v3` current run 执行 `task finish inspect --detail self-bootstrap --json`
- **THEN** CLI MUST 返回 `buildr.task-finish-self-bootstrap-input/v1`
- **AND** payload MUST 唯一标识 Workspace repository、全部实际 repository carriers 及其共同 run container

#### Scenario: 旧单仓库 Result 形成相同契约
- **WHEN** Product 读取仍在有界兼容范围内的 `buildr.task-finish-result/v2`
- **THEN** projector MUST 把单 carrier 与 activation facts 归一化为同一个 self-bootstrap v1 模型
- **AND** runner 所需字段的名称、类型与语义 MUST 与 v3 投影一致

#### Scenario: resume 继续使用稳定投影
- **WHEN** Agent 以 matching resume token 执行 `task finish run --detail self-bootstrap --json`
- **THEN** 成功、blocked、target-race 或 Delivery Adaptation Result MUST 继续返回 self-bootstrap v1
- **AND** 调用方 MUST NOT切换到 full Result 才能决定下一动作

### Requirement: 自举输入版本必须独立于内部 Finish Result 演进
`buildr.task-finish-self-bootstrap-input/v1` 同 major 内 MUST 只做 additive 扩展，消费者 MUST 忽略未知字段并严格验证已知必需字段。内部 Task Finish Result 升级但 self-bootstrap 语义未变时 MUST 只扩展 Product projector；不兼容的 self-bootstrap 字段或语义变化 MUST 发布新的投影 major。未知投影 major 或无法完整归一化的内部 Result MUST 在任何 consumer effect 前 fail closed。

#### Scenario: 内部 Result 升级但自举语义不变
- **WHEN** Product 支持新的内部 Task Finish Result major，且所需 self-bootstrap 语义仍可无损映射到 v1
- **THEN** CLI MUST 继续输出 `buildr.task-finish-self-bootstrap-input/v1`
- **AND** bundled runner MUST 无需识别新的内部 Result identity

#### Scenario: 同 major 出现新增字段
- **WHEN** runner 读取包含未知 additive 字段的 self-bootstrap v1 payload
- **THEN** runner MUST 忽略未知字段并继续严格校验所有已知必需语义

#### Scenario: 自举语义发生不兼容变化
- **WHEN** Product 无法把内部 Result 无损投影为 self-bootstrap v1，或 runner 收到未知投影 major
- **THEN** CLI 或 runner MUST 返回稳定 diagnostic 并保持零 effect
- **AND** MUST NOT回退为解析 raw Task Finish Result

### Requirement: self-bootstrap detail 必须纳入公开 JSON coverage
Public JSON schema registry、CLI command registry、help、schema validation 与 checkout/npm parity MUST 同时登记 `task finish run|inspect --detail self-bootstrap`。既有缺省/显式 `compact` 与 `full` MUST 保持现有 schema identity、字段与退出语义。

#### Scenario: registry 遗漏 self-bootstrap detail
- **WHEN** CLI 已接受 `--detail self-bootstrap`，但 schema registry、关键字段 guard 或 checkout/npm parity 缺少任一 run/inspect 路径
- **THEN** Product verification MUST 失败并报告缺失 coverage

#### Scenario: 既有 detail 不受影响
- **WHEN** Agent 请求缺省或显式 `compact`，或显式 `full`
- **THEN** CLI MUST 分别保持 `buildr.task-finish-compact-result/v1` 与 canonical Task Finish Result identity
- **AND** MUST NOT把 self-bootstrap 专用字段加入既有 closed compact payload
