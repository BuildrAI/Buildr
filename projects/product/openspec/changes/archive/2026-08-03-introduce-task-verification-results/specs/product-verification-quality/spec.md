## ADDED Requirements

### Requirement: Product test plan 与 Task Verification authority 必须分离
Buildr Product MAY 继续在 `test/verification/` 使用 Fast、Changed、Focus、Candidate profiles、DAG scheduling、prepared fixtures 与 workspace-saturating resources；这些名称和实现 MUST 只属于 Product repository testing policy。Installed Project declaration parser、capability runner 与 Task Verification Result MUST NOT 导入该 test-only planner、复制其 profile levels 或把它变成所有 Project 的默认 schema。

#### Scenario: Product Candidate 使用 DAG
- **WHEN** `npm run test:candidate` 根据 Product verification registry 生成有依赖的 plan
- **THEN** `test/verification/dag-scheduler.mjs` MAY 有界调度依赖、并发 class 与 workspace-saturating resources
- **AND** 该 DAG MUST 不出现在 `buildr.project-verification/v2` 或 Task Verification Result

#### Scenario: installed CLI 执行 Project capability
- **WHEN** npm package 中的 `buildr verification run` 执行显式 capability set
- **THEN** runtime MUST 只依赖 `src/` 内 declaration、process、resource 与 transient evidence modules
- **AND** package inventory MUST 不包含或导入 Product test planner/scheduler

### Requirement: P0.4 验证必须覆盖 current Result authority
Buildr Product focused/fast/candidate tests MUST 覆盖 Result closed schema、Project scope declaration binding、atomic replacement rollback、target/declaration stale、absent declaration gap、unique writer、CLI/Local App parity、transient execution separation、Finish shared consumer 与旧 authority absence。

#### Scenario: 运行 P0.4 focused verification
- **WHEN** 维护者修改 Verification domain、Application、declaration、Skill/contract、Finish 或 Local App
- **THEN** affected tests MUST 证明 Result current path 与 failure preservation
- **AND** MUST 不以 fixture 字段存在代替真实 CLI、filesystem 或 HTTP journey
