## MODIFIED Requirements

### Requirement: 发布准备必须按实际变化消费各包证明
发布准备 SHALL 明确选择仅主包、仅插件（Plugin）或联合。源码进入 `main` 的门禁（Gate）MUST 绑定准确源码、已观察 `main` 与最终冻结源码的完整树差异及适用的候选（Candidate）证据；差异 MUST 包含基线（Baseline）自带变化、共享构建／检查配方和主包生成输入，MUST NOT 仅比较最后选入提交（Commit）。涉及主包或网页产物（Artifact）的变化 MUST 保持完整主包检查；仅插件（Plugin）变化 SHALL 使用独立完整检查，MUST NOT 把主包绿色结果冒充插件（Plugin）已验证。调用方的目标输入 MUST NOT 绕过实际主包变化要求。

#### Scenario: 插件选择混入主包运行实现
- **WHEN** 输入仅选择插件（Plugin），实际差异包含主包或网页产物（Artifact）实现
- **THEN** 源码纳入 MUST 同时要求相应完整主包检查

#### Scenario: 独立插件源码证明
- **WHEN** 源码只改变插件（Plugin）及对应发布工具，并通过独立完整检查
- **THEN** 系统 SHALL 保存绑定准确源码与检查配方的插件（Plugin）证明
- **AND** 该证明 MUST NOT 冒充合入后 `main` 上可公开发布的候选（Candidate）

#### Scenario: 本机源码证明与最终原包分别消费
- **WHEN** 合法本机或既有远端源码结果匹配当前相关输入
- **THEN** 发布准备 SHALL复用该证明并只补齐必要平台和最终包检查
- **AND** 经真实受保护main纳入校验的插件原候选 SHALL可被接纳，不重复完整验证或打包；来源、字节、SDK或对端漂移 MUST停止相应消费
