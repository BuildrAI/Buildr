## MODIFIED Requirements

### Requirement: Package 必须拒绝 active v2 verification assets

Package static validation MUST继续拒绝v2 Skills、templates、authoring guidance和未登记兼容分支。自举过渡reader及其精确测试 MAY在active package中存在，但 MUST由current canonical requirement与Parent删除Contribution共同拥有；Product live v2 declaration MUST标记为transition input，不得被复制为模板。

#### Scenario: 有界过渡reader进入package

- **WHEN** package包含v2 validator/normalizer和对应拒绝/迁移测试
- **THEN** static validation MAY通过
- **AND** Skills、templates和新声明示例 MUST仍只包含v3
- **AND** current knowledge MUST给出retained controller、live migration和删除门槛

#### Scenario: 无主v2指导重新出现

- **WHEN** Skills、templates、CLI authoring docs或非过渡runtime重新指导创建v2 declaration
- **THEN** package static validation MUST失败

#### Scenario: v2 template 残留

- **WHEN** package source包含v2 declaration template、reference或未登记reader
- **THEN** static validation MUST失败并列出精确active path
- **AND** MUST NOT以archive兼容或历史用户为由继续打包

#### Scenario: archive 保留历史引用

- **WHEN** archived Change中存在v2历史文本且该路径不在package映射
- **THEN** static validation MUST不把不可修改provenance判为runtime支持
- **AND** active authoring docs、Skills与templates仍 MUST保持零v2指导
