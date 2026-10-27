## Why

模型账号检查目前即使没有实质变化也会生成新修订，模型目录刷新还可能检查所有账号。用户配置一个账号时，正在使用另一个账号的对话可能误报“对话或套餐状态已变化”，而前端把所有 409 都显示成同一条恢复提示，掩盖真实原因。

对话输入区的智能体（Agent）、权限（Permission）和模型（Model）选择也没有跨工作空间记忆。每次新建对话都要重新配置，且容易与生成提交说明使用的执行模型选择器混淆。

## What Changes

- 模型账号修订只在该账号的身份、启停、状态或模型选择相关事实实质变化时更新；额度、观测时间或无关账号的刷新不影响其他账号。
- 对话发送使用当前账号观察核对所选来源、模型、档位和思考深度；账号身份与所选模型仍有效时，旧修订不得阻止发送。
- 对话前端按具体错误码展示冲突原因，只对真正过期的预览或来源刷新读取，不再把所有 409 包装成统一“状态变化”。
- 新增软件级对话模块偏好：跨工作空间记住上次使用的智能体，并按工作空间安全恢复权限。完全访问权限只在同一工作空间的新对话中自动恢复。
- 新增独立的对话框模型选择器偏好：记住模型、服务档位和思考深度；与生成提交说明使用的 `buildr.execution-model` 保持分离。
- 偏好只影响新对话，不回写已有对话的实际运行记录。

不包含 API 破坏性变更。存在一项有意的新对话权限语义变化：同一工作空间的完全访问权限可以按用户上次明确选择恢复；跨工作空间仍从默认权限开始。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 增加软件级智能体、权限和模型选择记忆，并明确权限的安全恢复边界。
- `unified-model-subscriptions`: 明确模型账号修订的实质变化语义、按账号隔离及发送时的准确来源核对。

## Impact

- `projects/product/services/buildr-agent/src/model-access/application.ts`
- `projects/product/services/buildr-agent/src/application/conversation-application.ts`
- `projects/product/services/buildr-agent/test/`
- `projects/product/services/buildr-web/src/features/agent-conversations/`
- `projects/product/services/buildr-web/test/`
- `projects/product/knowledge/docs/architecture/agent-integration.md`
- `projects/product/knowledge/code-map/task-system.md`
