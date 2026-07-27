## ADDED Requirements

### Requirement: 持久化OpenSpec convergence receipt必须可移植
Buildr MUST将运行时OpenSpec executable定位与持久化identity分离。任何进入Workspace或Project候选树的新增或重写convergence receipt MUST只保存portable source reference、OpenSpec version和可核验executable/package identity，MUST NOT保存用户home、task worktree、临时目录或其他机器绝对路径。

#### Scenario: Task checkout执行convergence
- **WHEN** orchestrator使用task checkout内的绝对OpenSpec executable完成plan、apply和strict validation
- **THEN** 运行期间MUST核对同一executable identity
- **AND** 落盘receipt MUST使用相对Product/Service reference或逻辑source identity，不得包含task checkout绝对路径

#### Scenario: 读取历史绝对路径receipt
- **WHEN** Buildr读取旧schema中包含绝对`openspecExecutable`的历史receipt
- **THEN** reader MAY兼容解析该receipt用于诊断
- **AND** 任何更新或新生成结果MUST迁移为portable schema，不得复制旧绝对路径

#### Scenario: 开源候选覆盖持久化receipt
- **WHEN** open-source candidate或contract fixture检查tracked active/archive convergence receipts
- **THEN** verification MUST拒绝新生成的机器/用户绝对路径并报告具体receipt字段
- **AND** portable receipt MUST保留足够identity证明同一OpenSpec executable/version参与确定性流程
