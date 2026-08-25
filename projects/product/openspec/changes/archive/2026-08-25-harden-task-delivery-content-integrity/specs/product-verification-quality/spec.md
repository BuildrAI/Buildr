## ADDED Requirements

### Requirement: HTTP 契约 Fresh Build 输入必须在 Fast admission 中闭合
Buildr Product MUST 为 HTTP contract generator、服务端 Schema、Buildr DTO、Buildr Web DTO 与 Fresh Build fixture 维护一个测试侧闭合 inventory。`test:changed` 与本地完整 Candidate MUST 在同次 Fast admission 中校验该 inventory；校验失败时，尚未启动的重型 Integration、System、Workspace、package、Browser 或 artifact step MUST保持 blocked且不得产生执行副作用。该 inventory MUST只属于 Product test tooling，不得进入 npm runtime、Project verification declaration、Task Result 或跨 invocation cache。

#### Scenario: 新增 HTTP 契约文件但 fixture 未闭合
- **WHEN** 一个已登记 HTTP contract generator、Schema 或生成 DTO 未进入 Fresh Build inventory，或 Buildr/Buildr Web 两端输出缺失
- **THEN** Fast admission MUST以稳定诊断失败并列出缺失的逻辑文件
- **AND** `system-fresh-build`及其他尚未启动的重型 step MUST不启动

#### Scenario: inventory 完整
- **WHEN** 所有登记 generator、Schema 与两端 DTO 均存在且 Fresh Build fixture消费同一 inventory
- **THEN** Fast admission MUST通过该静态 owner，并让原 affected/full plan按现有依赖继续
- **AND** 同一 owner identity MUST在该次执行中最多运行一次

#### Scenario: 独立 Fresh Build System evidence
- **WHEN** `system-fresh-build` 被 affected、focus 或 Candidate plan选择
- **THEN** System fixture MUST从闭合 inventory复制最小 HTTP contract inputs并执行真实 npm-ci 与 build:web
- **AND** Fast 静态检查 MUST不冒充该 System evidence
