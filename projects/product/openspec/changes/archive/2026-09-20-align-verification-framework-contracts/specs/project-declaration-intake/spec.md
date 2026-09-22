## RENAMED Requirements

- FROM: `### Requirement: Verification Intake 必须发现 v3 能力族候选`
- TO: `### Requirement: Verification Intake 必须发现当前测试地图候选`
- FROM: `### Requirement: v2 迁移必须是显式受控声明更新`
- TO: `### Requirement: 旧声明迁移必须由真实测试事实重建当前地图`

## MODIFIED Requirements

### Requirement: Verification Intake 必须发现当前测试地图候选
Declaration Intake MUST只读检查真实测试源码、构建配置、scripts、CI、module、Tag、Suite和项目／服务登记，形成当前`buildr.project-verification/v4`测试地图候选及精确diff。候选 MUST分别说明`scope`、路径根绑定、`purpose`、`sourcePaths`、`testRoots`、完整`full`入口、可选`selection`和`requirements`；MUST不要求已退役的`proves`、`evidence`、`usable targets`、`discovery`或独立affected入口字段，不得把文件清单或一次性Plan落入声明。

#### Scenario: 发现 Maven Service 能力
- **WHEN** Service已有稳定Maven profile、测试源码和Tag
- **THEN** Intake MUST展示由这些authority支持的测试族候选及缺失事实
- **AND** MUST NOT仅按技术栈或目录名推断证明范围、完整入口覆盖或选择安全性

#### Scenario: Service 代码位于 Project 目录之外
- **WHEN** 测试族的源码、测试和命令属于已登记的外部Service代码根
- **THEN** Intake MUST形成使用该Service code的`location`候选，并让声明owner校验当前解析位置
- **AND** MUST分别说明证明覆盖的`scope`与路径根，不得以`scope.services`隐式选择执行目录

### Requirement: 旧声明迁移必须由真实测试事实重建当前地图
当受控Project仍有旧版声明且用户已授权本次迁移时，Intake MUST结合真实代码和入口生成到当前v4测试地图的精确语义diff并交给声明owner；旧字段 MUST仅作为调查线索，不得机械改版本号或恢复旧执行模型。不能由事实证明的路径根、证明范围、完整入口或选择指导 MUST作为未决项或测试建设缺口，不得通过默认值伪造。

#### Scenario: 旧invocation只能证明full
- **WHEN** 旧capability只有一个稳定命令且没有可信affected selector
- **THEN** migration MUST核对该命令实际覆盖的测试范围后登记为对应测试族的`full`入口，并在`selection`中说明可用选择方式或完整执行的依据
- **AND** MUST NOT复制命令为已退役的affected声明入口，或宣称未证明的受影响选择能力

#### Scenario: 未授权Workspace
- **WHEN** 发现不在本次受控范围内的旧版声明
- **THEN** Intake MUST报告待迁移事实与目标文件
- **AND** MUST NOT跨Workspace或跨Git authority直接写入
