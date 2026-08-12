## MODIFIED Requirements

### Requirement: Local App 必须生成受限 Task Verification Agent prompt
本机应用 MAY 在 Task“证据”视图的验证结果区块提供 Agent Action 以生成 Task Verification prompt。prompt MUST 绑定正式 Task ID、Task Intent 和可选调用方已知 target identity，指导 Agent 读取 v3 Skill、inspect current Result、恢复 ready Environment、执行适用声明能力，并只在完整结论后通过 Application record；复制 prompt 本身 MUST NOT 等于 recorded。

#### Scenario: 用户请求开始验证
- **WHEN** 用户从 Task“证据”视图的验证结果区块触发 Agent Action
- **THEN** prompt MUST明确execution evidence与Workspace-local current Result分离、中断不覆盖和coverage gap边界
- **AND** Local App MUST 不执行测试、不生成 target identity、不写 Result

#### Scenario: terminal Task 请求新验证
- **WHEN** Task Record 已是 completed 或 abandoned
- **THEN** prompt Application MUST fail closed
- **AND** 已有 Result 仍可只读查看
