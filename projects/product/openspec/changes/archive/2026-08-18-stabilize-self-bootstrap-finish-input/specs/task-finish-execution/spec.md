## ADDED Requirements

### Requirement: Buildr 自举必须只消费 Product-owned 稳定 Finish 投影
`buildr-self-bootstrap-sync` MUST 对 current inspect、foreign inspect 和所有 resume 调用请求 `--detail self-bootstrap`，并 MUST 只消费 `buildr.task-finish-self-bootstrap-input/v1`。runner MUST NOT解析、兼容或推断 raw `buildr.task-finish-result/v2|v3|v4|...`；未知投影 major、缺失必需 identity 或枚举不合法 MUST 在 sync、install、retained Doctor、Finish resume 与 cleanup effect 前 fail closed。

#### Scenario: 当前 Result major 改变
- **WHEN** Product 内部 Task Finish Result 从一个受支持 major 升级到另一个受支持 major，但输出相同 self-bootstrap v1 语义
- **THEN** runner MUST 按相同路径完成 current/foreign carrier 校验和自举决策
- **AND** MUST 不包含按内部 Result major 分支的兼容代码

#### Scenario: 未知稳定投影 major
- **WHEN** runner 收到不是 `buildr.task-finish-self-bootstrap-input/v1` 的 payload
- **THEN** runner MUST 返回 schema-invalid diagnostic 且全部 effect 计数为零
- **AND** MUST NOT尝试把 payload 当作 raw Result 读取

### Requirement: 多仓库自举必须以唯一 Workspace repository 为动作来源
stable projection 中 MUST 唯一标识 Workspace repository；runner MUST 只使用其 frozen activation paths 决定 Buildr sync、Buildr Web install 与 retained Doctor。Service repository 的 contribution、carrier 或 activation-like path MUST NOT触发 Workspace 自举。Workspace repository 为 `not-applicable/no-contribution` 时，self-bootstrap MUST 返回 not-applicable，不执行激活；Task Environment 仍按 Finish cleanup authority 一并清理所有 repository 环境。

#### Scenario: 只有 Workspace repository 有自举影响
- **WHEN** 多仓库 run 同时包含 Workspace 与 Service contributions
- **THEN** runner MUST 只从 Workspace repository 读取 activation paths
- **AND** MUST 对全部 projected carrier 保持 ownership 校验

#### Scenario: 只有 Service repository 有贡献
- **WHEN** Workspace repository disposition 为 `not-applicable/no-contribution`，但一个或多个 Service repository 有 carrier
- **THEN** runner MUST 报告 self-bootstrap not-applicable 且不执行 sync、install 或 retained Doctor
- **AND** MUST NOT把 Service repository path 提升为 Workspace activation path

#### Scenario: Workspace repository 不唯一
- **WHEN** 投影缺少 Workspace repository 或存在多个 Workspace repository
- **THEN** runner MUST 在任何 effect 前 fail closed

### Requirement: runner 必须验证 run container 与全部 repository carrier
Product 投影 MUST 区分 run-owned `carrierContainerRoot` 与 repository carrier roots。runner MUST 对 current 与 foreign run 验证 canonical Workspace 下的预期 run container、realpath、非 symlink、carrier containment、唯一性、run identity 及 resume carrier identity；v2 归一化允许 repository carrier 等于 container，v3 多仓库归一化允许 carrier 为其受控后代。任何越界、重复、缺失或不一致 MUST 保持零 effect 并返回具体 diagnostic。

#### Scenario: v3 repository carriers 位于 run container 下
- **WHEN** stable projection 提供多个位于 `.buildr/transient/task-finish/carriers/<run-id>/` 下的 repository carrier
- **THEN** runner MUST 在证明全部 carrier 真实、唯一且受 container 包含后接受该 run
- **AND** current run ignore MUST 绑定已证明的完整 run container，而不是任一 repository 子目录

#### Scenario: v2 carrier 与 container 相同
- **WHEN** legacy Result 被归一化为单一 repository carrier 且 carrier root 等于 run container
- **THEN** runner MUST 按相同 stable projection 规则接受该 ownership 形态

#### Scenario: carrier 路径越界或 identity 不一致
- **WHEN** 任一 projected carrier 经 realpath 后逃逸 container、使用 symlink、重复另一个 carrier或不匹配 resume carrier identity
- **THEN** runner MUST 在 foreign cleanup、sync、install、Doctor 与 resume 前 fail closed

### Requirement: 自举恢复必须持续使用同一稳定输入
runner 在 target-race、Delivery Adaptation、retained 或 cleanup 恢复期间 MUST 只依据每次 Product 返回的 current self-bootstrap v1 投影决定下一动作。runner MAY 修改 matching run-owned adaptation carrier，但 MUST 不修改其他 run、raw Result、Task Environment 或 Structured Store；Product 投影表明 terminal、not-applicable 或 recovery identity 漂移时 MUST停止。

#### Scenario: Delivery Adaptation 后恢复
- **WHEN** runner 完成 matching run-owned carrier 的受控 adaptation 并携 matching token 恢复
- **THEN** 后续 `task finish run` MUST再次返回 self-bootstrap v1
- **AND** runner MUST以新投影重新证明 carrier、phase 与下一动作，不读取先前 raw Result

#### Scenario: foreign run 与 current run 并存
- **WHEN** runner 观察到其他 run 的 projected carrier container
- **THEN** runner MUST只按 stable projection 证明并隔离 foreign ownership
- **AND** MUST不resume、cleanup或修改 foreign terminal/current run
