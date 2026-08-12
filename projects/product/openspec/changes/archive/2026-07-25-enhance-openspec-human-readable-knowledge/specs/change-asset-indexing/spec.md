## MODIFIED Requirements

### Requirement: Change 详情必须按需投影标准 artifacts
Buildr MUST 为单个 Change 返回 identity、lifecycle、任务进度、标准 artifact 内容和 Buildr companion Brief，并 MUST 对 Project、Change 与文件路径执行边界校验。Brief MUST 只从已解析 Change root 内的 `brief.md` 读取，且 MUST 与标准 artifacts 分别表达 availability 和 source path。

#### Scenario: 读取完整 Change
- **WHEN** 请求命中存在的 active 或 archived Change
- **THEN** 详情 MUST 返回 Brief、proposal、design、specs 和 tasks 的可用内容与来源路径
- **AND** specs MUST 使用稳定 capability 与相对路径标识
- **AND** Brief MUST 标识为 Buildr companion artifact，不得伪装成 OpenSpec 标准 artifact

#### Scenario: 读取部分完成 Change
- **WHEN** Change 仅包含部分标准 artifacts 或缺少 Brief
- **THEN** 详情 MUST 明确每类 artifact 和 Brief 是否存在
- **AND** MUST 保留已有内容，不得伪造缺失内容、Brief 或完成状态

#### Scenario: Change reference 非法或不存在
- **WHEN** 请求包含路径穿越、非法 identity 或无法在目标 Project 中解析的 Change reference
- **THEN** Application MUST 拒绝请求或返回 not found
- **AND** MUST NOT 读取 Project planning root 外的文件

#### Scenario: Brief source 越过 Change root
- **WHEN** `brief.md` 路径、符号链接或解析结果越过目标 Change root
- **THEN** Application MUST 将 Brief 报告为不可安全读取并拒绝返回内容
- **AND** MUST NOT 因标准 artifacts 合法而放宽 companion 文件边界

