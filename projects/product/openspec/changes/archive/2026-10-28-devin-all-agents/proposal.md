# 放开 Devin 来源模型在全部执行方中的使用

## Why

Devin 来源模型此前按执行方和模型编号设兼容门禁：先只允许 SWE-2，随后放开 Codex 全部模型，但 Qoder 仍整体不可选。核查表明 Codex、DSH、Qoder 都经同一本机模型网关调用 Devin 适配器，工具声明与指令改写对所有模型一致；唯一真实的执行方差异是思考档位表达能力（Qoder 只接受 low/medium/high/xhigh/max），该约束已在发送路径给出准确诊断，不需要在模型选择层整体拦截。

## What Changes

- 移除前端兼容判断 `conversationModelCompatibility`，模型分组提示、选项禁用、发送可用性与偏好恢复不再按执行方拦截 Devin 来源。
- 移除后端发送前校验 `modelSourceIncompatibility`，所有执行方按模型可用性、启停与来源状态决定是否可发送。
- `unified-model-subscriptions` 规范改为所有执行方均可选择 Devin 任一已启用模型；执行方无法表达的档位或能力按真实原因说明并保留草稿。
- 架构说明与运行时操作指引同步。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `unified-model-subscriptions`: 「Devin 登录与模型推理」由"Codex 允许全部模型、Qoder 置灰"改为"Codex、DSH、Qoder 均允许 Devin 任一已启用模型；不可用、停用或执行方无法表达的能力按具体原因处理"。

## Impact

- `projects/product/services/buildr-web/src/features/agent-conversations/`：兼容判断、分组提示、发送可用性、偏好恢复、样式。
- `projects/product/services/buildr-web/test/`：兼容纯函数测试、偏好测试、浏览器旅程。
- `projects/product/services/buildr-agent/src/application/conversation-application.ts`：发送前兼容校验。
- `projects/product/services/buildr-agent/test/integration/model-conversations.test.ts`：跨来源发送用例。
- `projects/product/knowledge/docs/architecture/agent-integration.md` 与 `projects/product/services/buildr/resources/runtime/skills/buildr/references/agent-operations.md`：兼容边界说明。
- `projects/product/openspec/specs/unified-model-subscriptions/spec.md`：兼容矩阵规范。
