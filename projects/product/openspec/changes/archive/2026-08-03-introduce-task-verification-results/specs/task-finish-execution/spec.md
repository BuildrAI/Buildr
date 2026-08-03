## MODIFIED Requirements

### Requirement: Verify 必须对冻结候选最多执行一次正式保证
`verify` MUST 把 frozen delivery tree 的稳定 fingerprint 作为 Task Verification target identity，并 MUST 只通过 Task Verification Application inspect/record current Result。已有 Result 只有在 target 与全部 Project declaration identities 均 current、结论为 `passed` 且覆盖适用的 `requiredForDelivery` capabilities 时才能复用；否则临时 adapter MUST 最多执行一次适用 command capability 集合、形成完整 portable facts、通过同一 Application 原子替换 Result，再读取该 Result 决定 Finish 自身是否继续。

#### Scenario: 缺少可复用 evidence
- **WHEN** frozen target 没有 current 且 passed 的 Task Verification Result
- **THEN** verify MUST 从 Project v2 declaration 选择适用且 `requiredForDelivery: true` 的 command capabilities并启动一次 execution
- **AND** 临时 adapter MUST 只以 Project/Service scope 与 path 匹配做确定性选择，不得解释自然语言 conditions 或据此跳过已匹配能力
- **AND** 同一 run 的 `formalVerificationExecutions` MUST 等于 1

#### Scenario: 已有完全匹配 evidence
- **WHEN** Task Verification Application 报告 Result 对 frozen target 与当前 declarations 均 `current`，结论为 passed 且 delivery-required coverage 完整
- **THEN** verify MUST 复用该 Result 且不启动 executor
- **AND** MUST 记录 `formalVerificationExecutions: 0` 与 Result digest

#### Scenario: declaration 或 target 变化
- **WHEN** Application 报告 Result stale
- **THEN** Finish MUST 不复用旧 Result，并 MUST 按当前 declaration 对当前 frozen target 重新执行一次
- **AND** MUST NOT 直接修改 applicability 或 Result 文件

#### Scenario: 完整 verification 结论 not-passed
- **WHEN** execution 已完成且 Application 记录的整体结论为 `not-passed`
- **THEN** Task Finish MUST 把真实 capability failure 或 coverage gap 作为自己的 primary failure 并退出当前 run
- **AND** MUST NOT 向 Verification Result 写入 proceed、blocked、Finish stage 或风险接受决定

#### Scenario: 验证输出包含次级 warning
- **WHEN** transient execution 或 current Result 同时包含真实 capability failure、coverage gap 与次级 timing/evidence warning
- **THEN** Task Finish MUST 把真实 capability failure 或 coverage gap 作为 primary failure
- **AND** warning MUST NOT 覆盖失败定位、改变 Result 结论或退化为 `primaryFailure: null`

#### Scenario: execution 中断或 Result 写入失败
- **WHEN** execution 未形成完整结论，或 Application 原子写入失败
- **THEN** Finish MUST 停止且原 current Result MUST 保持不变
- **AND** MUST 返回精确 transient execution 或 Result persistence 诊断

#### Scenario: current Result 留在 Workspace Metadata Store
- **WHEN** canonical Workspace 源码树没有 dirty state，但存在未 staged 的 `.buildr/**` Workspace metadata
- **THEN** retained readiness MUST 允许 Finish 继续交付 frozen tree
- **AND** Finish MUST NOT stage、commit、发布或丢弃这些 metadata；current Result 仍由唯一 Application writer 维护
- **AND** 任意源码/文档 dirty 或 staged Workspace metadata 仍 MUST 作为 unrelated dirty 阻塞
- **AND** exact owned-path publication 仍属于后续 Task Metadata Publication，不得在 P0.4 提前实现

## ADDED Requirements

### Requirement: Finish CLI 不得接受旧 Verification authority 输入
`buildr task finish run` MUST NOT 接受 `--required-assurance`、`--verification-summary`、调用方提供的 declaration digest、Result bytes 或 applicability。Finish MUST 从 frozen target、Task scope、Project v2 declarations 与 Task Verification Application 解析所需事实。

#### Scenario: 调用方提供旧 assurance 或 summary
- **WHEN** 调用方传入 `--required-assurance` 或 `--verification-summary`
- **THEN** CLI MUST 以 unknown argument 拒绝
- **AND** MUST NOT 创建或修改 Finish run、transient execution 或 current Verification Result
