## MODIFIED Requirements

### Requirement: Release lifecycle 必须维持唯一协调Task与稳定恢复身份
协调任务（Task）SHALL 按选择身份定位；旧仅主包默认保留 `release-<version>`，其它目标 SHALL 使用独立身份。仅插件（Plugin）选择 MUST 等待插件自身公开事实与适用收尾，不要求主包公开事实。目标包含公开发布时，联合选择 MUST 保留逐包事实及恢复身份，在全部已选择发布和必需共享收尾完成前保持同一任务（Task）进行中；明确只准备到验包的目标适用独立准备结束边界。以下主包单独场景（Scenario）继续适用原义务。

Buildr MUST从current release owner facts派生version-scoped lifecycle read model，并 MUST让包含公开发布目标的同一`release-<version>`协调Task从selection持续保持active到Publication、post-publication dev provenance reconciliation与必需closeout完成；已经按只准备目标完成的Task仅作为同冻结选择的已完成准备事实被消费，不自动重开或另建协调任务。阶段与恢复身份 MUST绑定version、Task ID、selection generation/identity、frozen context digest和适用publish run，不得写入Task Record新状态字段或建立旁路workflow store。

#### Scenario: readiness完成并等待publication授权
- **WHEN** Candidate、唯一artifact、release→main tree equality与无副作用readiness全部current，但维护者尚未授权publication
- **THEN** lifecycle MUST返回`awaiting-publication-authorization`并保持同一包含公开目标的release Task active；已独立完成的准备Task保持其真实终态
- **AND** MUST NOT仅因等待授权完成尚有公开目标的Task、创建第二协调Task或把历史授权当作当前publication授权

#### Scenario: Candidate或publication暂态失败
- **WHEN** 同一version的Candidate失败、同SHA job暂态失败或protected transaction需要同context恢复
- **THEN** lifecycle MUST保留同一Task与匹配generation/context recovery identity
- **AND** support修复 MAY独立交付，但 MUST NOT成为新的release协调Task

#### Scenario: 必需closeout全部完成
- **WHEN** Publication、matching dev provenance reconciliation与全部必需本地/中间资源closeout均通过，且正式远端release ref已按本轮授权完成保留或安全清理并核验
- **THEN** lifecycle MUST返回`closed`并允许Release Skill完成唯一协调Task
- **AND** 历史授权未包含正式远端release ref删除时 MUST保留其原政策，不自动扩大授权，也不因此阻止Task完成

#### Scenario: 已完成准备随后获准公开同一候选
- **WHEN** 仅验包准备已完成，随后用户明确授权公开同一冻结候选，准确来源、原包及当前主线条件仍匹配
- **THEN** 工具 MUST 消费已完成准备并允许不改变冻结内容的同树主线采用、就绪核验及受保护公开，准备任务保持已完成
- **AND** 公开状态及局部恢复 MUST 继续由现有发布事实表达，不自动重开准备任务或创建第二协调任务
- **AND** 需要改变发布内容的选择、重新冻结或源码收敛仍 MUST 满足活动准备的原写入边界

## ADDED Requirements

### Requirement: 只准备到验包必须独立结束并保全成果

明确停在验包的准备 SHALL 在完整必需覆盖及准确原包已核验后，使用既有任务材料与验证报告入口保存真实结果，再完成对应准备任务。原包、源码、检查及原执行来源 MUST 保全到不依赖待清理工作树的位置；登记失败 MUST 仅恢复登记，不得重测或重新制包。临时资源 MUST 逐项说明已清理或因后续用途而保留，工作树清理不得删除原包和证明。

#### Scenario: 仅验包目标完成
- **WHEN** 固定选择的完整验包通过，用户明确不进入公开
- **THEN** 准备 MUST 保存原字节、完整汇总及真实来源，在活动任务上登记报告和材料后完成任务
- **AND** MUST NOT 创建公开标签、派发公开运行或等待公开后才登记完成

#### Scenario: 登记或清理失败后恢复
- **WHEN** 验包已通过但报告登记、任务结束或资源清理未完成
- **THEN** 恢复 MUST 回读同冻结选择和已保全结果，只补未完成动作并保留已成功登记
- **AND** MUST NOT 因登记失败使原包或已通过检查失效，或把资源待处理冒充全部已清理

#### Scenario: 已完成准备的准确接续
- **WHEN** 用户检查或明确接续已完成准备，包、版本、源码及冻结选择未变
- **THEN** 工具 MUST 允许读取并消费其真实结果，不自动重开任务或再次执行候选
- **AND** 源码选择、重新冻结及改变发布内容的收敛写入仍 MUST 满足活动任务的既有边界，身份漂移必须明确返回恢复动作
- **AND** 公开操作 MUST 继续核对准确授权和受保护执行条件
