## 1. 收窄 Task Finish 产品语义

- [x] 1.1 删除Project `task-finish.yml`声明、parser与通用`sync-workspace` planner，只保留Workspace根runtime source的`none | render-runtime`计划。
- [x] 1.2 从Task Finish deliver、resume、result projection和cleanup readiness中删除sync convergence分支，同时保持carrier远端交付、render fail-closed、Doctor和install边界。
- [x] 1.3 更新Task Finish contract、Skill、CLI/架构说明与package/static校验，增加`post-finish` Skill Contribution slot。

## 2. 建立自举 Workspace 组合

- [x] 2.1 在隔离Task worktree使用candidate CLI同步新版Task Finish源，确保候选Workspace具备`post-finish` slot。
- [x] 2.2 创建Workspace-owned `buildr-self-bootstrap-sync` Skill，固定判断package inputs并规定retained sync、受管delta、Git Operations、Doctor和结果报告边界。
- [x] 2.3 创建并安装`buildr-self-bootstrap` Component及`task-finish#post-finish` Contribution，验证Component完整性和runtime组合，普通用户Workspace保持无该资产。

## 3. 测试与认知收敛

- [x] 3.1 重写Task Finish unit/integration/system fixtures，覆盖none、render、render tracked delta、Doctor失败和零sync行为，删除binding/convergence恢复断言。
- [x] 3.2 增加自举Skill/Component静态与runtime组合回归，覆盖固定inputs命中、未命中和普通Workspace隔离。
- [x] 3.3 更新受影响current knowledge、Brief和knowledge impact evidence，并完成OpenSpec strict validation与确定性convergence/archive readiness检查。
- [x] 3.4 运行changed反馈、Component/runtime专项检查和适用Product delivery验证，修复所有回归并确认无SQLite、Task Domain、Review、Verification或Candidate语义漂移。
