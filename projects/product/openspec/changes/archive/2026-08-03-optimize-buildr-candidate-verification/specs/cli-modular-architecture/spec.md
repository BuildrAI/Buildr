## MODIFIED Requirements

### Requirement: 产品验证入口必须共享声明与薄执行层
Buildr fast、affected、changed、Workspace/package selectors 和 Candidate entrypoints MUST 共享统一 step registry 与 planner/scheduler，并 MUST 将稳定 shell/npm 表面保持为薄 wrapper。统一 registry MUST 为每个 step 保存可校验的测试意图、执行边界、事实 owner、证明范围和目标成本；实际 Quick/full 组合与 affected 路径选择 MUST 分别由 profile 和 inputs 的唯一运行事实表达，不得再复制一份把 Quick、Task-affected、Candidate、Release 混为同一轴的分类。Fast 兼容入口 MUST 映射到低成本 Quick，changed MUST 按 changed paths 和事实 owner 选择完整适用证据，显式 Candidate 入口 MUST 完整覆盖登记的必要回归主证据，Release 与 focus 诊断 MUST 保持独立边界。

#### Scenario: 检查验证入口架构
- **WHEN** CLI architecture verifier 扫描产品验证入口
- **THEN** step 命令、预算、依赖、group/profile membership 与 Project Testing 分类 MUST NOT 在多个入口重复维护
- **AND** wrapper MUST 只负责参数转交、环境前置检查和退出状态传播

#### Scenario: 专项 selector 保持兼容
- **WHEN** 维护者使用已有 affected group、Workspace suite 或 package selector
- **THEN** selector MUST 解析为统一 registry 中的稳定 step identity
- **AND** 未知或重复 selector MUST 保持 fail-closed 与去重行为

#### Scenario: Fast 兼容入口执行 Quick
- **WHEN** 维护者运行 `npm test` 或 `npm run test:fast`
- **THEN** planner MUST 完整选择登记为 Quick 的低成本 Static、Unit 与 Component step，以及明确满足目标成本的少量 Integration step
- **AND** MUST NOT 因历史 step id、目录或 `fast` 名称把真实 Workspace、Git、进程生命周期或 System 测试整体纳入 Quick

#### Scenario: 重型 Integration 退出 Quick
- **WHEN** 一个 Integration 或 System step 的实际调用包含大量真实 CLI、Git、文件系统或 Workspace fixture，且不满足登记的 Quick 成本目标
- **THEN** registry MUST 通过 inputs、full profile 或 focus/group 保留该事实所需的可选择性
- **AND** 显式完整回归 membership MUST 由必要主证据决定，不得因历史入口名称自动保留

#### Scenario: Changed plan 命中全局 owner
- **WHEN** changed paths 修改 registry、path mapping、planner、runner 或其他决定选择与执行可信度的全局 owner
- **THEN** changed planner MUST 在同一个 plan 中选择完整回归 profile
- **AND** Project declaration MUST NOT 追加第二个重叠 required capability

#### Scenario: Candidate 覆盖必要主证据
- **WHEN** 维护者运行 `npm run test:candidate`
- **THEN** planner MUST 选择全部登记为 Candidate 的主要证据 owner 及其真实依赖
- **AND** 只属于独立 Browser capability 或 Release workflow 的专项 MUST NOT 为了扩大数量重复进入该完整回归入口

#### Scenario: 专项能力不重复完整回归 owner
- **WHEN** 一个高成本测试已由 Project declaration 以确定 scope/path 声明为独立交付能力
- **THEN** 内部 registry MUST NOT 在 delivery plan 与独立能力中再次重复执行相同主证据
- **AND** 诊断入口 MAY 保留有界 selector，但不得形成第二个交付 authority

#### Scenario: Registry 分类不完整
- **WHEN** 任一 step 缺少 owner、主要意图、执行边界、证明范围、主要证据 owner 或有效目标耗时，或 profile/input 引用了未知运行事实
- **THEN** registry validation MUST 在启动 verifier 前 fail closed
- **AND** MUST NOT 根据 step id、目录名或 executor 类型补猜分类
