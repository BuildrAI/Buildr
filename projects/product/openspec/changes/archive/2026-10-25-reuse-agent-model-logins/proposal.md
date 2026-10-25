## Why
已有原生账号与新增套餐登录重复，用户必须登录两次。Qoder已有套餐也应向其他执行方提供原生模型推理。

## What Changes
- 自动把Buildr现有Codex、DSH、Qoder登录作为共享模型来源，只保留一次登录入口。
- Qoder通过真实签名模型协议提供模型目录、流式推理及工具调用。
- 保留旧独立套餐账号和会话绑定，程序准备收纳到详情。

## Capabilities
### New Capabilities
- `shared-native-model-accounts`: 已有登录自动发现模型并跨执行方消费。
### Modified Capabilities

## Impact
影响buildr-agent账号、模型来源与执行器，以及Web账号设置；不新增依赖和服务。
