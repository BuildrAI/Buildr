# 1. 执行器与协议

- [x] 1.1 DSH 协议层只投影助手可见文字（`text`、`input_text`）：`reasoning` 片段不再生成对话条目，只有思考的步骤返回空，更新协议层单元测试。
- [x] 1.2 保留 `ExecutorItem.thinking` 契约与读取侧排除规则：历史记录中带思考标记的条目继续不进入最终答复、下一轮模型历史、标题输入与交接材料。

# 2. 处理过程呈现

- [x] 2.1 删除「思考」节点渲染，处理过程时间线跳过带思考标记的条目，助手说明与工具组顺序、工具组计数不变。
- [x] 2.2 删除思考节点样式（含正式对话 flow 变体），更新前端渲染测试：思考条目不产生任何节点，助手说明与工具组不受影响。
- [x] 2.3 确认助手可见文字仍按原位置渲染为处理过程说明（`ac-process-narration`）。

# 3. 验证

- [x] 3.1 适用的检查通过：buildr-agent `typecheck` 与单元测试（143 通过）、buildr-web `typecheck`、完整测试（923 通过）、`test:static` 与正式构建 `build:web` 均通过；OpenSpec 变更 `openspec validate --strict` 通过。
- [x] 3.2 在本机 Buildr Web 用原本显示「思考」的会话验证：处理过程只剩工具调用与最终答复，没有思考正文。
  - 入口：`http://127.0.0.1:4458`（Buildr Web Dev，`buildr-web-profile=development`，`web-dist` 为本次改动后的正式构建）。
  - 会话：`1d5c9b88-2a13-3709-a552-5872bdd5f17e`（「排查对话标题未生成原因」，已空闲）。本次加载的读模型范围为 112 条（`sequence` 46–157），其中 37 条带思考标记、71 条工具、40 条助手文字，思考条目分布在整段区间，最后一页即含 23 条。
  - 结果：展开三个轮次的处理过程后，DOM 有 3 个工具组、115 条工具行、2 条助手答复；`.ac-process-thinking` 计数为 0，37 条思考条目的正文（如 `The session was continued…`、`Clear pattern:`）在页面文本中一处未出现，「思考」字样不存在。滚动到思考最密集的中段仍是连续工具行 + 助手答复，无英文推理段落。
  - 自动化方式：headless Chromium 注入 `sessionStorage['buildr.agent-conversation.panel:development']` 打开该会话，通过 `meta[name="buildr-session"]` 取得页面 session 调用读接口对齐条目数，再展开全部轮次与工具组断言上述计数；无窗口焦点依赖。
