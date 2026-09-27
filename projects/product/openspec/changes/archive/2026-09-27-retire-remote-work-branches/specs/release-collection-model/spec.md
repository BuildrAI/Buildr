## MODIFIED Requirements

### Requirement: Release Git owner 必须管理generation carrier与幂等closeout
Release Git owner MUST为每个selection generation使用确定性`codex/release-main-<version>-g<generation>` carrier，记录expected commit、remote ref、PR head/base与ownership。已合并且源码历史已保全的carrier缺失时，恢复 MUST复用已合并事实且不重建完成用途的引用。发布成功后，owner MUST按与当前context绑定的清理授权处理本版本carrier；同版本全轮次政策 MUST枚举全部可证明归属的generation。未知owner、ref漂移或活动用途 MUST只阻止对应资源删除，不扩大到其他已证明安全的资源。

#### Scenario: 同version新generation创建PR
- **WHEN** 前一generation的release→main PR已经终结，而current frozen generation具有新的release HEAD/tree
- **THEN** owner MUST创建或复用current generation carrier并只以该carrier创建唯一受保护PR
- **AND** MUST保留正式远端`release-<version>`直到发布完成并拒绝复用旧generation carrier

#### Scenario: carrier closeout重复调用
- **WHEN** 已发布源码与官方标签（Tag）及当前main历史保全，matching carrier已经删除或仍精确指向expected release commit
- **THEN** closeout MUST分别返回`already-cleaned`或条件删除matching carrier并完成远端回读
- **AND** MUST NOT删除其他version或ownership不明branch；其他generation只有匹配同版本全轮次授权且证明归属、保全和无活动用途时才可删除

#### Scenario: 同版本多个历史候选
- **WHEN** 当前发布授权包含同版本全部轮次，早期generation由已发布源码历史重建并匹配实时远端提交
- **THEN** owner MUST清理这些已结束用途的carrier，并逐项报告预期提交、实际效果或保留原因
- **AND** MUST NOT单凭名称前缀或文件树相同推断归属与历史保全

#### Scenario: 已合并carrier被平台删除后继续准备
- **WHEN** 精确源码的完整候选已成功且对应PR已合并，carrier被平台自动删除
- **THEN** prepare MUST核验已有候选和合并历史后继续，不重建carrier、不重新派发候选
- **AND** 尚需新候选执行或尚未合并时 MUST继续创建必要的精确carrier

#### Scenario: 发布成功后再次调用准备入口
- **WHEN** 当前发布意图已有成功或仍在进行的公开发布运行，再次调用prepare
- **THEN** 执行器 MUST进入该发布的恢复路径，不重建已清理的正式或临时引用
- **AND** 失败发布只有在核实不存在公开发布事实后才可重新准备
