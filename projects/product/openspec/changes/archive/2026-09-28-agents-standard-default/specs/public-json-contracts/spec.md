## MODIFIED Requirements

### Requirement: Doctor Release Awareness JSON 必须保持非诊断投影
`buildr.doctor/v2` MUST 保留 `releaseAwareness` 与 `notices` 的非诊断语义；这些字段 MUST 不改变 `findings`、`repairPlan`、`nextSteps`、`ok` 与 `health` 的含义。原 v1 的该保证在 v2 中继续成立。

#### Scenario: Doctor 返回版本通知
- **WHEN** Doctor JSON 包含 releaseAwareness
- **THEN** schema coverage MUST 证明 compact/full 都返回合法结构
- **AND** Registry 失败 fixture MUST 证明既有 health 字段保持不变

## ADDED Requirements

### Requirement: 标准接入使用第二版运行时发现与诊断输出
Buildr MUST 对品牌身份和文件适配方式分离后的公开输出使用 `buildr.runtime-list/v2` 与 `buildr.doctor/v2`，不得在 v1 下静默重解释品牌列表或重命名诊断键。

#### Scenario: 发现文件约定与品牌特例
- **WHEN** 调用方运行 `runtime list --json`
- **THEN** MUST 返回 `buildr.runtime-list/v2`，包含默认适配器（Adapter）、有限文件实现列表、已知品牌映射和未知有效品牌使用标准的说明
- **AND** MUST NOT 将文件实现列表描述为全部可接受品牌的封闭白名单

#### Scenario: 诊断标准文件
- **WHEN** 调用方运行 `doctor --agent codex`、`doctor --agent dsh` 或默认标准诊断并请求 JSON
- **THEN** MUST 返回 `buildr.doctor/v2`，分别表达请求品牌和实际 `adapterId`
- **AND** 标准文件诊断 MUST 使用 `runtime.agentsStandard`，不伪造当前品牌为 Codex
- **AND** `supported` MUST 只表达能检查已选文件约定，不证明宿主安装或加载

#### Scenario: 旧消费者迁移
- **WHEN** 消费者升级到本次标准默认接入版本
- **THEN** MUST 按新 schemaVersion 调整运行时列表与 Doctor 解析，将对 `runtime.codex` 的标准文件读取迁到 `runtime.agentsStandard`
- **AND** 生产者 MUST 不再输出 v1 身份的改义对象；依赖 v1 的消费者在完成迁移前须使用旧版 CLI，不得交替用旧版管理已迁移的共享回执

#### Scenario: 源码与安装包保持一致
- **WHEN** 产品验证通过开发入口与隔离安装包运行相同标准默认或真实品牌命令
- **THEN** MUST 使用相同公开版本，并产生等价标准文件和身份区分
