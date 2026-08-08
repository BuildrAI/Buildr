## MODIFIED Requirements

### Requirement: Package 必须原子交付 Task Environment authority
Buildr package MUST原子交付`buildr.task-environment/v1` contract、Task Environment Application、Plan v1/Receipt v4 Domain、`task-environment` Skill、Plan/Environment公共CLI与JSON、v2/v3 compatibility reader、唯一SQLite writer、Task-scoped Change Resolver、Local App saved-current reader/API、Git provider contract、bindings、runtime mappings与迁移验证。任一identity、schema、CLI、source/package/runtime或Local App consumer不一致时package check与doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr初始化或同步包含Task Environment的Workspace
- **THEN** manifests MUST登记matching contract、provider和bindings
- **AND** MUST不交付Project dependency declaration parser或package-manager adapter registry

#### Scenario: capability graph 解析
- **WHEN** doctor解析task-triage、task-environment、task-worktree与task-finish
- **THEN** graph MUST显示正式workflow消费task-environment，Environment按需消费Git provider
- **AND** 旧capability、缺失provider、歧义或版本冲突 MUST产生精确诊断

#### Scenario: 公共 Task Environment CLI 完整登记
- **WHEN** verification检查help、CLI和public JSON registry
- **THEN** Plan record/inspect及Environment prepare/inspect/cleanup MUST全部出现并匹配各自schema
- **AND** internal resource/saved-current actions MUST不出现

#### Scenario: Local App只读保存事实
- **WHEN** checkout或npm tarball Local App读取Environment
- **THEN** GET MUST通过Application展示v4 Plan/Service/Step facts或legacy diagnostic
- **AND** MUST不执行Step、文件系统probe或Receipt写入

#### Scenario: 候选package在隔离Workspace证明fresh依赖
- **WHEN** candidate CLI作为外部controller为fresh fixture携带包含buildr/buildr-web步骤的Agent Plan执行prepare
- **THEN** 一次prepare MUST产生两个独立Service Step outputs并使`npm run build:web`使用buildr-web lockfile工具成功
- **AND** 同一机制 MUST能执行非npm fixture step而无需新增技术栈adapter

#### Scenario: 候选 package 在自身验证工作区测试
- **WHEN** Task worktree候选修改Plan、Receipt、CLI、Skill或Local App assets
- **THEN** candidate MAY只向receipt绑定验证工作区投射
- **AND** MUST阻止retained、peer Task与验证根外共享runtime target

#### Scenario: 集成后激活
- **WHEN** 候选进入retained checkout
- **THEN** Agent MUST从retained Product source执行适用sync/render/doctor
- **AND** 只有package/runtime identity一致且专项验证通过后才能报告正式生效
