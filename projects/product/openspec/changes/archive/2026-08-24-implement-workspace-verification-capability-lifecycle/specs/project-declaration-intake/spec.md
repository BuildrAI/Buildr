## ADDED Requirements

### Requirement: Verification Intake 必须发现 v3 能力族候选
Declaration Intake MUST只读检查真实测试源码、构建配置、scripts、CI、module、Tag、Suite和已注册provider，形成v3 capability family候选及精确diff。候选 MUST分别说明scope、proves、evidence、usable targets、discovery、affected/full入口和执行边界，不得把文件清单或一次性Plan落入声明。

#### Scenario: 发现 Maven Service 能力
- **WHEN** Service已有稳定Maven profile、测试源码和Tag
- **THEN** Intake MUST展示由这些authority支持的能力族候选及缺失字段
- **AND** MUST NOT仅按技术栈或目录名推断证明范围与affected安全性

### Requirement: v2 迁移必须是显式受控声明更新
当受控Project仍有v2声明且用户已授权本次迁移时，Intake MUST生成v2到v3的精确语义diff并交给声明owner；不能由事实证明的evidence、target、discovery或affected入口 MUST作为未决项、full fallback或coverage gap，不得通过默认值伪造。

#### Scenario: 旧invocation只能证明full
- **WHEN** v2 capability只有一个稳定命令且没有可信affected selector
- **THEN** migration MUST把它登记为v3 full入口并记录affected缺口或full fallback
- **AND** MUST NOT复制命令为affected入口

#### Scenario: 未授权Workspace
- **WHEN** 发现不在本次受控范围内的v2声明
- **THEN** Intake MUST报告阻塞迁移事实与目标文件
- **AND** MUST NOT跨Workspace或跨Git authority直接写入
