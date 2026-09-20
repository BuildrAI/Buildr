## RENAMED Requirements

- FROM: `### Requirement: 正式执行的 changed capability 必须自带可解析输入`
- TO: `### Requirement: Product changed 入口必须自带可解析输入`
- FROM: `### Requirement: P0.4 验证必须覆盖 current Result authority`
- TO: `### Requirement: 任务验证回归必须覆盖当前报告的唯一权威`

## MODIFIED Requirements

### Requirement: Candidate 包含双任务并发整体验收
Buildr Product Candidate MUST 将`concurrent-task-acceptance`登记为required verification step，MUST真实创建两个Task的独立Worktree并并发运行Project测试，组合Preview owner与具体cleanup安全，并 MUST使用独立executor、timing和预算执行；不得由其他单项测试的通过状态推断该组合验收通过。

#### Scenario: 执行完整候选验证
- **WHEN** 维护者执行 Product Candidate 验证
- **THEN** verification registry MUST 选择 `concurrent-task-acceptance`
- **AND** 该步骤失败或证据不完整时 Candidate MUST 失败

#### Scenario: 准备两个Task Worktree
- **WHEN** acceptance fixture 已创建两个正式 Task Record
- **THEN** verifier MUST创建两个独立Task Worktree
- **AND** 两个Worktree MUST使用不同checkout并保持各自repository set
- **AND** summary MUST记录work location、并发verification、preview ownership与cleanup

#### Scenario: 两个 Task 形成独立 current Verification Result
- **WHEN** 两个Task在各自Worktree中直接调用Project测试工具并完成实际检查
- **THEN** verifier MUST分别记录两份current任务验证报告或直接保留各自真实运行证据
- **AND** 记录报告时 MUST使用两个不同Task ID的独立current槽位与各自report digest，报告 MUST匹配各自当前内容和测试地图；MUST不要求独立文件系统报告路径
- **AND** acceptance MUST NOT为证明`record`响应再重复执行两个`inspect`；报告读取与适用性协议的完整验证由Task Verification System owner持有

#### Scenario: 清理并发Task Worktree
- **WHEN** 两个 Task 的并发行为已经完成
- **THEN** verifier MUST证明清理第一个Worktree不会删除或使第二个Worktree失效
- **AND** verifier MUST最终由各owner清理两个Worktree及其owned resources

### Requirement: Product test plan 与 Task Verification authority 必须分离
Buildr Product MAY继续在`test/verification/`使用Fast、Changed、Focus、Candidate profiles、DAG scheduling、prepared fixtures与workspace-saturating resources；这些名称和实现 MUST只属于Product repository testing policy。Installed Project测试地图与Task验证报告 MUST NOT导入该test-only planner、复制其profile levels或把它变成所有Project的默认schema。项目测试 MUST由智能体（Agent）直接调用项目真实工具。

#### Scenario: Product Candidate 使用 DAG
- **WHEN** `npm run test:candidate`根据Product verification registry生成有依赖的plan
- **THEN** `test/verification/dag-scheduler.ts` MAY有界调度依赖、并发class与workspace-saturating resources
- **AND** 该DAG MUST不出现在`buildr.project-verification/v4`或Task验证报告

#### Scenario: installed CLI 执行 Project capability
- **WHEN** npm package中的公开CLI读取或更新Project测试地图、记录或读取Task验证报告
- **THEN** runtime MUST只依赖正式随包的地图与报告模块，不执行项目测试
- **AND** package inventory MUST不包含或导入Product test planner/scheduler

### Requirement: 任务验证回归必须覆盖当前报告的唯一权威
Buildr Product focused/fast/candidate tests MUST覆盖任务验证报告的closed schema、Task范围与当前Project测试地图绑定、基于已观察摘要的原子替换、SQLite写入失败回滚、内容或地图变化后的stale、地图缺失或无效时保留真实检查并追加gap、唯一writer，以及installed CLI与Buildr Web HTTP的公开协议一致性。测试执行 MUST由智能体（Agent）直接调用项目工具完成；回归 MUST证明已退役的统一验证执行入口不再提供服务，Task Finish MUST不把报告设为自身写入或任务完成的结构性前置。

#### Scenario: 运行 P0.4 focused verification
- **WHEN** 维护者修改Verification domain、Application、declaration、Skill/contract、Finish或Buildr Web
- **THEN** affected tests MUST证明对应current报告槽位、已观察摘要冲突的零写入、失败时旧报告保留，以及实际受影响的公开协议
- **AND** MUST不以fixture字段存在代替真实CLI、SQLite事务或HTTP journey，也不得为取得报告重新执行已有效完成的测试

### Requirement: Product changed 入口必须自带可解析输入
Buildr Product的changed selector command MUST在Agent直接调用项目入口时拥有闭合的changed-path输入契约。该入口 MAY优先接受调用方显式提供的changed paths；未提供时 MUST使用项目既有Git/base事实或返回可执行的input diagnostic。Buildr通用Task Verification MUST不选择路径、不调度执行，也不得为Product硬编码selector逻辑。

#### Scenario: Browser capability 使用显式 changed paths
- **WHEN** Browser changed入口收到合法的`BUILDR_CHANGED_PATHS_JSON`
- **THEN** dispatcher MUST校验并使用该路径集合生成selector plan
- **AND** Agent MUST能直接调用项目声明的既有入口，无需额外手工修改命令

#### Scenario: Browser capability 从 Git fallback 选择
- **WHEN** Browser changed入口未收到`BUILDR_CHANGED_PATHS_JSON`且execution root能解析verification base
- **THEN** dispatcher MUST从Git diff收集Product-relative changed paths并生成与显式输入一致的selector plan
- **AND** selector plan MUST保留affected/full模式、选择原因和未映射路径的fail-closed行为

#### Scenario: Browser capability 缺少可解析输入
- **WHEN** Browser changed入口没有显式changed paths且无法解析Git verification base
- **THEN** dispatcher MUST在启动Chrome前返回稳定的input/base diagnostic
- **AND** MUST NOT将该情况报告为Browser页面或业务交互失败

## ADDED Requirements

### Requirement: Product 测试地图与路径选择必须对应真实覆盖
Buildr Product测试地图的每个`full`入口 MUST覆盖其声明的测试范围；由独立入口覆盖的集成、系统、前端逻辑与浏览器测试 MUST如实分族。一个测试族的完整通过 MUST只证明该族的实际范围，不得被表述为所有产品测试均已执行。受影响路径选择 MUST引用当前真实源码，并选中该源码所承担公共行为的必要回归；自动选择成功 MUST不替代覆盖判断。

#### Scenario: 集成与系统完整入口分别声明
- **WHEN** `test:integration`仅运行集成测试，而`test:system`负责系统测试
- **THEN** `buildr-functional` MUST保留既有identity并只声明集成范围，系统范围 MUST由独立测试族指向既有`test:system`
- **AND** MUST不因声明分族新增通用执行命令或强制用户项目采用相同测试层级

#### Scenario: 前端逻辑与浏览器完整入口分别声明
- **WHEN** `services/buildr-web` 的 `npm test` 执行前端逻辑测试，而 `test:browser:smoke` 只构建网页并运行浏览器检查
- **THEN** 前端逻辑范围 MUST由 `buildr-web-unit` 指向已有前端完整入口，`buildr-web` MUST只声明浏览器入口实际覆盖的测试根
- **AND** 浏览器检查通过 MUST不被表述为 `services/buildr-web/test` 中的前端逻辑测试已执行；后端回归或候选入口的通过也 MUST不推导独立前端逻辑及浏览器检查通过

#### Scenario: 测试地图实现变化选中声明回归
- **WHEN** Project测试地图的当前应用实现变化
- **THEN** Product changed计划 MUST选中证明地图inspect、validate和update行为的声明回归组
- **AND** MUST不因路径映射仍指向已删除源码而漏选该组
