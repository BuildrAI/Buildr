## ADDED Requirements

### Requirement: Buildr package 必须交付Task Metadata Publication资产
Buildr package MUST交付 `task-metadata-publication` Skill、`buildr.task-metadata-publication/v1` contract、最小无状态helper、provider/binding与完整随附文件，并 MUST在workspace baseline、runtime projection、bootstrap与静态校验中保持相同identity。

#### Scenario: package安装或sync
- **WHEN** Workspace安装或同步当前Buildr package
- **THEN** source Skill、contract与helper MUST按完整目录bytes和owner executable mode投射
- **AND** workspace manifest MUST声明provider、required Git Operations dependency与selected binding

#### Scenario: package静态验证
- **WHEN** package verifier检查Metadata Publication
- **THEN** verifier MUST证明Skill/contract/helper存在、writer declaration table与四个writer contracts一致、没有同义入口
- **AND** MUST拒绝缺失required dependency、额外eligible path、恢复旧Git capability或runtime projection不完整

#### Scenario: bootstrap与current docs
- **WHEN**新Workspace通过bootstrap/guide发现Task lifecycle能力
- **THEN**文档 MUST说明唯一入口、五个exact paths、明确排除项、Git Operations调用与local-only结果
- **AND** MUST NOT宣传公共CLI、publication history、批量发布或Task Finish authority
