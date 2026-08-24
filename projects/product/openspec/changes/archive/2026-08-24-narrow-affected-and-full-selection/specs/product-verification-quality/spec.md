## ADDED Requirements

### Requirement: Changed plan 必须公开逐步 selection trace
Buildr Product 的 changed plan MUST 从同一权威 planner 输出结构化 selection audit，并 MUST 区分 path-to-owner 直接选择、Full scope 展开与 dependency closure；审计不得重算、mock 或缓存被测选择结果。

#### Scenario: 普通局部变更生成 affected trace
- **WHEN** changed paths 均命中可局部判断的 verification owner
- **THEN** JSON plan MUST 输出每条 path 的 direct owner、每个 selected step 的选择类型、execution boundary、primary evidence owner 与 public outcome
- **AND** dependency step MUST 标识引入它的 parent step，不得冒充 direct owner

#### Scenario: Full plan 生成 authority trace
- **WHEN** changed path 命中结构化 Full authority
- **THEN** plan MUST 输出 `full` scope、稳定 reason code、触发 path、匹配 pattern 与用户可理解说明
- **AND** Full profile 展开的 step MUST 与直接 path owner 和 dependency closure 分开记录

### Requirement: Full scope authority 必须稳定且失败关闭
Buildr Product MUST 由唯一 ownership authority 声明 Full scope pattern、稳定 reason code 与说明；planner MUST 消费该声明而不得按文件名另建 reason authority。planner、registry、ownership、scheduler、executor、验证入口或其他无法安全局部判断的关键执行语义变化 MUST 升级完整 daily-full，unknown/unowned 高风险输入 MUST 阻断。

#### Scenario: 选择 authority 自身变化
- **WHEN** changed path 修改 planner、registry、ownership 或 Full authority 声明
- **THEN** planner MUST 选择完整 daily-full evidence set
- **AND** reason MUST 指明触发 path 和 `execution-graph-change`、`ownership-authority-change` 或等价稳定 code

#### Scenario: 普通逻辑变化
- **WHEN** changed path 只修改具有精确 owner 的普通领域逻辑
- **THEN** planner MUST 保持 affected scope并只选择直接 owner 及必要 dependency closure
- **AND** MUST NOT 因中央目录、通用 helper 名称或可达性无理由升级 Full

#### Scenario: 高风险路径没有 owner
- **WHEN** changed path 不在 ignored/delegated 集合且无法解析安全 owner
- **THEN** planner MUST 以稳定 owner-gap diagnostic 阻断
- **AND** MUST NOT 返回空集合、affected passed 或静默忽略

### Requirement: 选择优化必须形成代表性 before/after 审计
Buildr Product MUST 以近期代表性普通 Task、真实 planner 输出和 sealed Execution Record 形成 before/after 审计，至少报告 Full 升级率、selected step 数、墙钟中位数与 P90、Full reason 分布、最常选择的重型 owner、各 evidence layer 的实际选择粒度和数据缺口。结论 MUST 区分选择过宽、必要 owner 过重、环境等待与尚未证明。

#### Scenario: 审计证明选择过宽
- **WHEN** 同一组代表性路径在修正前无必要地升级 Full 或选择无关 sibling owner
- **THEN** 报告 MUST 给出相同样本的 before/after scope、step、reason 与墙钟证据
- **AND** Candidate 与 Release-only 覆盖 MUST 证明没有下降

#### Scenario: 审计证明选择不是主要瓶颈
- **WHEN** 普通样本已保持窄 affected 且重型 owner 都具有不可替代 primary evidence
- **THEN** 报告 MUST 明确选择不是主要瓶颈并列出剩余重型 owner、公共结果与实测成本
- **AND** MUST NOT 以架构清晰、单次波动或预设数字冒充执行时间收益

#### Scenario: 历史记录字段不完整
- **WHEN** 近期 Execution Record 缺少 changed paths、selection trace 或 timing 字段
- **THEN** 报告 MUST 将对应数据标记为 missing，并可对冻结路径使用当前真实 planner 重放选择
- **AND** MUST NOT 估算、伪造或把当前重放描述为历史原始输出

### Requirement: 选择验收必须保持对象 authority 与状态隔离
Changed selection 变更 MUST 通过真实 affected/Full 反例、一次完整 daily-full、一次完整 Product Artifact Candidate 及一次无真实外部发布副作用的 Release contract/smoke 验收。失败后重跑 MUST NOT 污染 retained Workspace、Git fixture、进程、端口、SQLite 或用户 profile。

#### Scenario: 执行四类验收
- **WHEN** selection 实现与审计冻结
- **THEN** evidence MUST 分别证明 affected/Full 选择、完整日常证据、exact Candidate artifact evidence 与 Release contract/smoke
- **AND** daily-full MUST 不包含 Candidate/Release-only primary evidence，Release smoke MUST 不执行真实外部发布

#### Scenario: 验收失败后重跑
- **WHEN** 任一 verifier 失败并在修复后重跑
- **THEN** 新执行 MUST 使用独立或已证明清理的 execution state
- **AND** retained Workspace、其他 Task、Git fixture、端口、进程和用户 profile MUST 保持未污染
