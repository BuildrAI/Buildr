## ADDED Requirements

### Requirement: Buildr Product 必须通过统一高级 provider 接入 Workspace Plan
Buildr Product MUST提供稳定provider adapter，把closed Verification Request映射到现有唯一registry/planner并返回统一Plan与execution units。registry MUST继续唯一持有step、dependency、profile、resource、budget、Context和primary owner；公开declaration与Plan MUST NOT复制内部DAG。

#### Scenario: Product affected计划
- **WHEN** Task Delivery Request使用affected且changed paths有可信owner
- **THEN** adapter MUST返回direct、dependency与必要full reasons的统一Plan
- **AND** selected step identities MUST来自真实registry而不是第二份declaration graph

#### Scenario: Product full与Candidate
- **WHEN** Request分别要求Task Delivery full或Product Artifact Candidate full
- **THEN** adapter MUST保持daily-full与Candidate-only artifact evidence的既有差异
- **AND** MUST NOT因通用Plan contract把Candidate或Release-only证据下放到日常full

### Requirement: Product provider 必须保持 Plan 与执行 authority 可审计
provider MUST为每个selected item返回evidence boundary、proves、selection reason、trigger/parent、execution identity与resource needs；Execution Record MUST绑定matching provider/plan identity。provider MUST NOT写Task Verification Result、改变Task状态或暴露Context内部生命周期。

#### Scenario: registry dependency进入公开Plan
- **WHEN** 内部DAG因selected owner扩张dependency step
- **THEN** 公开Plan MUST把该item标记为dependency并引用parent
- **AND** MUST NOT输出完整DAG、未选step或Context cache结构

#### Scenario: provider identity 漂移
- **WHEN** registry、planner或adapter identity在Plan后改变
- **THEN** 旧Plan MUST变为stale并在执行前失败关闭
- **AND** MUST重新计划而不是沿用旧execution units
