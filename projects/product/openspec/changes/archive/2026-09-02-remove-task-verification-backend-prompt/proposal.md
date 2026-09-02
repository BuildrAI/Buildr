# 移除 Task Verification 后端提示词依赖

## Why

Buildr Web已经在前端生成交给Agent的最小任务验证指令，但后端仍保留未被使用的`generateTaskVerificationPrompt`和`POST /prompts/task-verification`。它重复Skill职责，扩大Application与HTTP契约。

## What Changes

- 删除Task Verification Application prompt generator。
- 删除对应HTTP route、schema、mapping、生成DTO和typed client方法。
- 保留Project测试地图、Task Verification report、内容/声明适用性和现有Web Agent action。
- 更新测试、文档和正式web-dist；不改变Task Verification v4报告契约。

## Capabilities

- `task-verification`：Application只维护测试地图绑定、报告与确定性安全。
- `task-professional-http-contracts`：删除已无消费者的prompt operation。
- `buildr-web-workspace-application`：确认Agent action只使用前端最小指令。

## Impact

影响Buildr Task Verification Application、Task module、HTTP契约/映射/DTO、Buildr Web typed client、静态验证、文档和测试。不新增数据迁移、状态机、权限层或业务事实。
