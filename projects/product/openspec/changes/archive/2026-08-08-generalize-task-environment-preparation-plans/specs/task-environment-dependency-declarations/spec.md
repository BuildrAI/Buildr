## REMOVED Requirements

### Requirement: Project 必须显式声明 Task Environment Service 依赖
**Reason**: Project `task-environment.yml`把Buildr自举npm事实固化为通用Environment authority，迫使核心预先适配技术栈，并覆盖Agent对当前Task的判断责任。

**Migration**: 删除Project专用声明。Agent依据Task scope、源码、构建和Verification事实登记`buildr.task-environment-plan/v1`；需要多个Service时先明确Task Record scope，再为每个Service声明步骤或`not-applicable`。

