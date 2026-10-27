## 1. 对话偏好基础

- [x] 1.1 新增版本化对话模块偏好与模型选择器偏好读写、恢复解析函数，覆盖跨工作空间、失效回退、完全访问权限收窄和与 `buildr.execution-model` 分离；运行 frontend-logic 相关单元测试确认通过
- [x] 1.2 将偏好接入 `ConversationPanel` 和 `ConversationOptions`，只对新对话应用、只在用户明确更改时写入，自动修订同步不写偏好；运行前端类型检查和相关逻辑测试确认通过

## 2. 模型账号实质变化

- [x] 2.1 在模型账号检查中使用按账号规范化的选择指纹，仅在身份、启停、状态或模型选择相关事实变化时更新修订，同时保留额度和观测时间更新；运行 agent-integration 中账号修订测试确认无变化检查保持修订、实质变化更新修订
- [x] 2.2 调整对话发送前核对，使用当前账号观察验证身份、模型、档位、思考深度和兼容性，旧修订不再单独阻止发送；运行 agent-integration 中双账号隔离与真实失效测试确认通过

## 3. 前端冲突反馈

- [x] 3.1 按错误码分类 409 恢复路径，只有预览或来源真实过期时刷新，忙碌、权限和模型不可用直接显示准确原因并保留草稿；运行前端类型检查和相关逻辑测试确认通过

## 4. 浏览器流程

- [x] 4.1 扩展 agent-conversations 浏览器旅程，验证新对话恢复智能体、权限和模型，跨工作空间完全访问收窄，执行模型偏好不被改写，以及无关账号修订变化不显示假中断；实际运行对应 E2E 检查确认通过

## 5. 当前知识与验证

- [x] 5.1 更新 `knowledge/docs/architecture/agent-integration.md`、`knowledge/code-map/task-system.md` 和必要的 `knowledge/code-map/technical-layers.md`，说明三类选择记忆边界、完全访问权限范围和按账号修订语义；核对正文、路径和引用
- [x] 5.2 运行 `openspec validate conversation-selection-memory --strict`、`buildr openspec convergence preflight`、前端静态检查与单元测试、agent 静态检查与单元测试及相关集成测试；记录实际结果与未覆盖项
