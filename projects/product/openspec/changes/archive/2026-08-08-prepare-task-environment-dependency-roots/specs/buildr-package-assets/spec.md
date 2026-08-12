## MODIFIED Requirements

### Requirement: Package 必须原子交付 Task Environment authority
Buildr package MUST原子交付`buildr.task-environment/v1` contract、Task Environment Application、`task-environment` Skill、公共CLI/`buildr.task-environment-result/v2`、Environment Receipt v3/v2 compatibility reader、Project dependency declaration parser、唯一SQLite writer、Task-scoped Change Resolver、Local App saved-current reader/API、Git provider contract、default bindings、runtime mappings与迁移验证。任一identity、version、provider、binding、CLI/schema、source mapping或Local App reader不一致时package check与doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr初始化或同步包含Task Environment的Workspace
- **THEN** workspace Skills manifest MUST登记matching contracts、enabled/installed task-environment与收窄task-worktree
- **AND** default bindings MUST分别选择对应providers，不得恢复旧worktree lifecycle authority

#### Scenario: capability graph 解析
- **WHEN** doctor解析task-triage、task-environment、task-worktree与task-finish
- **THEN** graph MUST显示正式workflow消费task-environment，Environment按需消费Git provider
- **AND** 旧capability、缺失provider、歧义或版本冲突 MUST产生精确诊断

#### Scenario: 公共 Task Environment CLI 完整登记
- **WHEN** package verification检查help、CLI registry与public JSON registry
- **THEN** prepare/inspect/cleanup MUST全部出现并使用`buildr.task-environment-result/v2`，内部resource/saved-current actions MUST NOT出现
- **AND** worktree actions MUST只描述Git provider evidence

#### Scenario: Local App只读保存事实
- **WHEN** package verification从checkout或npm tarball访问Task Environment API
- **THEN** Local App MUST通过Application saved-current reader返回v3 dependency roots或v2 legacy diagnostic
- **AND** GET MUST不执行npm、文件系统dependency probe或Receipt写入

#### Scenario: 候选 package 在自身验证工作区测试
- **WHEN** task worktree中的候选新增Task Environment Skill、contracts、Application/CLI、dependency declaration或runtime assets
- **THEN** candidate CLI MAY只向同一receipt绑定的任务验证工作区或其内隔离user destination投射
- **AND** MUST在写入前阻止retained Workspace、peer task worktree和验证根外共享user runtime target

#### Scenario: 候选package在隔离Workspace证明fresh依赖
- **WHEN** candidate CLI作为外部稳定controller为fresh canonical fixture准备包含buildr/buildr-web声明的Task
- **THEN** 一次prepare MUST在fixture task worktree准备两个独立node_modules并使`npm run build:web`使用buildr-web lockfile工具成功
- **AND** candidate MUST不认领或清理其自身正式Task Environment

#### Scenario: 集成后激活
- **WHEN** 候选已进入retained checkout
- **THEN** Agent MUST从retained Product source执行适用sync/render/doctor
- **AND** 只有package/runtime identity匹配且专项验证通过后Task Environment authority才能报告正式生效
