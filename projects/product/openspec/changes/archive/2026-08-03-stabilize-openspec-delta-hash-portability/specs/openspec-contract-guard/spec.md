## ADDED Requirements

### Requirement: OpenSpec delta identity 必须独立于 checkout 位置
Buildr MUST 仅从按确定顺序排列的逻辑 delta 文件标识和规范化 delta 内容计算 `deltaHash`。每个逻辑标识 MUST 使用 `specs/<capability>/spec.md` 形式的 POSIX 路径；`changeRoot`、绝对源文件路径、主机目录和路径分隔符 MUST NOT 影响该 hash。

#### Scenario: 相同 delta 位于不同 checkout
- **WHEN** 两个干净 checkout 在不同绝对路径下包含相同 capability、逻辑 delta 文件和规范化内容
- **THEN** Buildr MUST 为它们生成相同的 `deltaHash`
- **AND** 该 identity MUST 可用于同一 Change 的跨 checkout 收敛比较

#### Scenario: 逻辑 delta 输入发生变化
- **WHEN** delta 的 capability 逻辑路径或规范化内容发生变化
- **THEN** Buildr MUST 生成不同的 `deltaHash`

#### Scenario: 遇到旧的本机路径 hash
- **WHEN** 已存 receipt 的 delta digest 与新的可移植 `deltaHash` 不同
- **THEN** Buildr MUST 将旧 identity 视为不再可复用并按当前 canonical 事实重新规划
- **AND** MUST NOT 为了匹配当前 hash 而改写或采用旧 receipt
