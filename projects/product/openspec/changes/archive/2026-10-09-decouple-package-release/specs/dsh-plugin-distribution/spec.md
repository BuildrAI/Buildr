## ADDED Requirements

### Requirement: 插件完整检查必须显式消费独立对端
插件（Plugin）完整检查 SHALL 显式消费已公开主包或联合主包候选（Candidate）的准确压缩包，核验版本、完整性和实际公共入口。检查 MUST NOT 默认借相邻开发源码、PATH 或同版本号替代该对端。独立发布 MUST 核对公开对端；联合候选（Candidate）消费 SHALL 明确标记尚未公开。

#### Scenario: 单独准备插件候选
- **WHEN** 只选择插件（Plugin）并提供已公开主包产物（Artifact）
- **THEN** 完整检查 MUST 隔离消费该包并验证必需入口及可选能力的真实结果
- **AND** MUST NOT 要求构建或升版主包

#### Scenario: 对端输入缺失或替换
- **WHEN** 独立检查未指定对端，或对端身份与已记录字节不一致
- **THEN** 检查 MUST 报告对应缺口，不默认读取相邻源码
