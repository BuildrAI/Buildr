## ADDED Requirements

### Requirement: 开发反馈、产品候选与发布验证必须分离
Buildr release workflow MUST区分PR到`dev`的changed/affected反馈、current release HEAD/tree上的完整Product Candidate与显式dispatch的正式发布验证。直接Git交付或self-bootstrap successor推送`dev` MUST不自动启动完整Product verification；只有维护者明确选择并形成新release SHA时才重新运行完整Candidate。

#### Scenario: Dev收到新提交
- **WHEN** Agent直接交付Task source commit或self-bootstrap successor到`dev`
- **THEN** GitHub完整Product verification MUST不因push自动启动
- **AND** 交付与自举分别由Git readback、Task Verification和self-bootstrap结果证明

#### Scenario: 准备候选版
- **WHEN** current release HEAD/tree冻结并需要进入`main`
- **THEN** 分布式aggregate MUST作为该release source的完整Candidate权威
- **AND** 普通changed/affected反馈 MUST不冒充完整Candidate

#### Scenario: 正式发布
- **WHEN** maintainer对matching current release Candidate明确授权发布
- **THEN** runner MUST只dispatch一次正式workflow并消费唯一tarball
- **AND** protected transaction MUST独占公共发布mutation

### Requirement: 跨路径结果不变量必须复用真实owner
Buildr Product MUST让Agent直接Git/PR、CI、发布与资源清理路径复用各专业owner的最低充分测试，不得创建第二份Task、Parent、Verification、Delivery或Release authority。

#### Scenario: 多条合法路径形成结果
- **WHEN** 直接Git、PR/CI或发布形成可独立核验的事实
- **THEN** 测试 MUST分别核对Task Record、Git remote、Verification、Publication与资源owner结果
- **AND** 任一局部清理失败 MUST不撤销其他已经成立的事实

#### Scenario: 无关模块失败
- **WHEN** optional capability、Doctor、Declaration或UI读取发生无关失败
- **THEN** 当前不消费该owner的安全动作 MUST继续可用
- **AND** authorization、identity、shared history和具体删除安全仍 MUST失败关闭

## REMOVED Requirements

### Requirement: 开发反馈、候选门禁与发布验证必须分离
**Reason**: 条款仍依赖Formal Finish与Finish remote readback。
**Migration**: 使用当前开发反馈、Product Candidate和Release owner Requirement。

### Requirement: 前序治理贡献必须具有跨路径一致性矩阵
**Reason**: 条款仍依赖自动Finish、Task Contribution、Delivery投影和Environment Cleanup。
**Migration**: 跨路径测试直接复用真实owner结果。
