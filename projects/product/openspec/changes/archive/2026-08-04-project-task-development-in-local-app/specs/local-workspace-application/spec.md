## MODIFIED Requirements

### Requirement: 界面领域名词必须使用中文主称
Buildr 本机应用 MUST 在用户可见界面中使用“工作空间”“项目”“服务”作为领域对象的主要名称，英文名称只能作为首次解释或技术辅助信息。任务页面及其直接的 Task-scoped 入口 MUST 对任务记录、任务环境、任务研发、审查结果、验证结果、内容目标、任务候选与研发交接使用纯中文或“中文（English Term）”主称，不得使用英文-only 标题或操作名。

#### Scenario: 展示导航和页面标题
- **WHEN** 应用展示工作空间、项目或服务的导航、面包屑、页面标题、按钮、状态或说明
- **THEN** 领域对象 MUST 分别使用“工作空间”“项目”“服务”
- **AND** MUST NOT 只使用 Workspace、Project 或 Service 作为用户可见主称

#### Scenario: 展示任务页面与直接入口
- **WHEN** 应用展示任务目录、任务详情页签、专业区块或 Task-scoped Change 的审查入口
- **THEN** 已有稳定中文名称的任务对象、专业能力、状态与操作 MUST 使用纯中文或“中文（English Term）”形式
- **AND** MUST NOT 只使用 Task Record、Task Environment、Task Review、Task Verification、Task Development、Planning Review 或 Completion Review 作为用户可见主称

#### Scenario: 展示技术字段
- **WHEN** 应用展示 Workspace ID、schemaVersion、digest、字段名、路径、Git 或 API 等精确技术标识
- **THEN** 应用 MAY 保留不可误译的英文标识和原始枚举值
- **AND** 标签与对象主称仍 MUST 使用中文，必要时在首次出现时补充英文术语

#### Scenario: 展示任务专业状态
- **WHEN** Task 页面展示 current、stale、missing、unknown、ready、passed、not-passed、proceed 或 blocked 等专业枚举
- **THEN** 用户可见主状态 MUST 使用稳定中文文案
- **AND** 原始枚举仅 MAY 作为次级技术信息，不得成为唯一可读结论

### Requirement: Task 详情必须只读投影 current Verification Result
本机应用 MUST 在 Task 详情“证据”视图提供“验证结果（Verification Result）”区块，并 MUST 通过 Task Verification Application inspect 展示 Result presence、target、declarations、实际 capability facts、coverage gaps、结论、resultDigest 与派生 applicability。页面 MUST 不直接读取 Result YAML，不得伪造当前 target identity，也不得暴露 Result writer。

#### Scenario: 查看已有 Result
- **WHEN** 用户打开 Task 的“证据”视图
- **THEN** API MUST 返回 Application 的 current read model 并设置 no-store
- **AND** 验证结果区块 MUST 显示 declaration freshness，并在没有 current target identity 时把 overall applicability 显示为 unknown

#### Scenario: Result 不存在
- **WHEN** Task 尚无 current Verification Result
- **THEN** 验证结果区块 MUST 显示空状态与“交给 Agent 验证”的动作
- **AND** Task Record、Environment、Development、Review 与其他视图 MUST 正常工作

#### Scenario: 尝试直接写 Result API
- **WHEN** 客户端向 Task verification resource 发送 POST/PUT/PATCH/DELETE
- **THEN** 本机应用 MUST 不提供该路由
- **AND** Task、Environment 与已有 Result bytes MUST 保持不变

### Requirement: Local App 必须生成受限 Task Verification Agent prompt
本机应用 MAY 在 Task“证据”视图的验证结果区块提供 Agent Action 以生成 Task Verification prompt。prompt MUST 绑定正式 Task ID、Task Intent 和可选调用方已知 target identity，指导 Agent 读取 v3 Skill、inspect current Result、恢复 ready Environment、执行适用声明能力，并只在完整结论后通过 Application record；复制 prompt 本身 MUST NOT 等于 recorded。

#### Scenario: 用户请求开始验证
- **WHEN** 用户从 Task“证据”视图的验证结果区块触发 Agent Action
- **THEN** prompt MUST 明确 execution evidence 与 portable Result 分离、中断不覆盖和 coverage gap 边界
- **AND** Local App MUST 不执行测试、不生成 target identity、不写 Result

#### Scenario: terminal Task 请求新验证
- **WHEN** Task Record 已是 completed 或 abandoned
- **THEN** prompt Application MUST fail closed
- **AND** 已有 Result 仍可只读查看
