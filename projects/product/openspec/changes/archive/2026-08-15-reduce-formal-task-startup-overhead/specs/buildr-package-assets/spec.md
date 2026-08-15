## ADDED Requirements

### Requirement: Task Entry Snapshot 必须作为完整 package surface 交付
Buildr package MUST包含Task Entry Snapshot Application、CLI route、public JSON identity、action-local Skill guidance、reference/current knowledge与focused tests。checkout源码入口、npm package与managed runtime projection MUST对该surface保持一致。

#### Scenario: package/static parity
- **WHEN** 产品构建或检查package assets
- **THEN** 新Application、CLI、schema与guidance MUST均被正式package包含
- **AND** 缺少任一运行时模块、registry identity或受管Skill更新 MUST使验证失败

#### Scenario: 既有行为兼容
- **WHEN** package加入Task Entry Snapshot
- **THEN** 既有Task inspect、Environment、Development、retry/resume/cancel、Verification Result、Execution Record与Finish命令 MUST保持原schema和行为
- **AND** 不得要求持久化migration或回填历史Task
