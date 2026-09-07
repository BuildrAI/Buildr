## ADDED Requirements

### Requirement: Task Verification Application不得生成Agent提示词
Task Verification Application MUST只维护Project测试地图绑定、正式报告和确定性适用性；Agent验证指令由界面或调用方基于Skill与当前Task形成。Application MUST不生成、保存或返回prompt。

#### Scenario: Agent开始任务验证
- **WHEN** 用户从Buildr Web或对话要求验证正式Task
- **THEN** Agent MUST读取Task Verification Skill、当前Task、真实改动和测试地图
- **AND** Application MUST不参与审阅范围选择或prompt生成
