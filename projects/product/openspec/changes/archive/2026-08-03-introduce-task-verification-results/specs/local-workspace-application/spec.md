## ADDED Requirements

### Requirement: Task 详情必须只读投影 current Verification Result
本机应用 MUST 在 Task 详情提供独立 Verification 页签，并 MUST 通过 Task Verification Application inspect 展示 Result presence、target、declarations、实际 capability facts、coverage gaps、结论、resultDigest 与派生 applicability。页面 MUST 不直接读取 Result YAML，不得伪造当前 target identity，也不得暴露 Result writer。

#### Scenario: 查看已有 Result
- **WHEN** 用户打开 Task 的 Verification 页签
- **THEN** API MUST 返回 Application 的 current read model 并设置 no-store
- **AND** 页面 MUST 显示 declaration freshness，并在没有 current target identity 时把 overall applicability 显示为 unknown

#### Scenario: Result 不存在
- **WHEN** Task 尚无 current Verification Result
- **THEN** 页面 MUST 显示空状态与“交给 Agent 验证”的动作
- **AND** Task Record、Environment、Review 与其他页签 MUST 正常工作

#### Scenario: 尝试直接写 Result API
- **WHEN** 客户端向 Task verification resource 发送 POST/PUT/PATCH/DELETE
- **THEN** 本机应用 MUST 不提供该路由
- **AND** Task、Environment 与已有 Result bytes MUST 保持不变

### Requirement: Local App 必须生成受限 Task Verification Agent prompt
本机应用 MAY 提供 Agent Action 以生成 Task Verification prompt。prompt MUST 绑定正式 Task ID、Task Intent 和可选调用方已知 target identity，指导 Agent 读取 v3 Skill、inspect current Result、恢复 ready Environment、执行适用声明能力，并只在完整结论后通过 Application record；复制 prompt 本身 MUST NOT 等于 recorded。

#### Scenario: 用户请求开始验证
- **WHEN** 用户从 Task Verification 页签触发 Agent Action
- **THEN** prompt MUST 明确 execution evidence 与 portable Result 分离、中断不覆盖和 coverage gap 边界
- **AND** Local App MUST 不执行测试、不生成 target identity、不写 Result

#### Scenario: terminal Task 请求新验证
- **WHEN** Task Record 已是 completed 或 abandoned
- **THEN** prompt Application MUST fail closed
- **AND** 已有 Result 仍可只读查看
