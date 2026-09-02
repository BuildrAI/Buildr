# Design

## Context

Buildr Web已经在前端形成任务验证指令，后端prompt generator没有真实消费者，却仍扩大Application、HTTP和DTO边界。

## Goals / Non-Goals

目标是删除这条重复链路，同时保持Task Verification报告与确定性适用性不变。不重构测试地图、报告schema或验证选择。

## Decisions

Task Verification继续由Agent读取Task、真实改动、Project `verification.yml`、测试代码、构建脚本与CI说明，自行选择并调用现有测试工具。Application只保留：观察当前测试地图、校验报告scope、绑定声明identity、整值保存/读取报告，以及按调用方内容identity和当前声明派生适用性。

Buildr Web现有`AgentActionDrawer`已经直接形成短指令，未调用typed client中的`verificationPrompt`。因此直接删除后端generator、route和客户端死方法，不保留stub或兼容转发。

### 保持的边界

- 不改变`buildr.task-verification/v4`与`buildr.task-verification-report/v1`。
- 不删除报告的内容/声明一致性判断；这些是确定性证据版本比较，不是流程许可。
- 不让Review、Development、Finish或Parent消费Verification作为门禁。
- 不增加prompt表、执行计划、runner、日志或恢复状态。

## Risks / Trade-offs

旧私有调用方会收到404；当前产品没有消费者，因此不保留兼容stub。测试必须证明前端Agent action仍可用。

## Migration Plan

同一提交删除generator、route、schema、mapping、DTO和client方法并重新生成web-dist；没有数据迁移。

## Open Questions

无。产品目标、授权和不可逆边界均未改变。

## Verification

覆盖Application/module方法面、HTTP catalog/DTO生成、旧route 404、Web客户端无死方法、前端指令仍存在、TypeScript/build/web-dist、相关Unit/Contract/Integration/System与package check。
