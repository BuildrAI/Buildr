## 1. 前端实现

- [x] 1.1 `ConversationPanel` 专注模式下保留对话正文渲染，`view==='history'` 时在面板内左侧渲染 `ConversationHistory` 临时栏；分屏模式替换渲染不变。
- [x] 1.2 `ConversationActivity` 专注模式下导轨列表入口以 `openHistory`/`setView` 切换临时栏，不再触发收起面板的分屏 toggle 语义。
- [x] 1.3 停靠样式新增临时栏布局：面板内左侧绝对定位、宽度 `min(420px, 100%)`、右边线与阴影，窄屏整宽可达。
- [x] 1.4 入口收敛：固定/专注隐藏对话标题栏列表图标与列表标题栏返回图标，专注临时栏隐藏新建图标；暂看保留列表/返回，分屏列表保留新建。
- [x] 1.5 标题点击即重命名、信息弹层下移底部工作空间名；新建统一为导轨/顶栏独立入口，移除标题栏与列表标题栏新建。

## 2. 验证断言

- [x] 2.1 新增浏览器场景 `history/focus-mode-drawer`：专注模式点击导轨列表入口打开左栏且对话输入与正文保持可见；再次点击入口、返回当前对话、选择对话分别关闭栏；分屏模式仍为面板内替换。
- [x] 2.2 复核 `history/responsive-width` 在专注模式下的列表几何断言仍成立（列表宽度封顶、居中、无横向溢出）。
- [x] 2.3 夹具新增按模式选择入口的 `openHistoryList`/`backToConversation`，替换固定/专注下已隐藏标题栏按钮的测试引用；更新顶部图标数量断言。
- [x] 2.4 夹具新增 `startNewConversation`，替换标题栏/列表新建引用；标题定位改用重命名语义；更新顶部图标数量断言。

## 3. 当前认知校准

- [x] 3.1 校准 `knowledge/code-map/technical-layers.md` 对话面板描述：专注模式历史以左侧临时栏呈现，分屏模式保持面板内替换；同步维护 `.buildr/knowledge-impact.yml`。

## 4. 直接验证

- [x] 4.1 执行前端静态检查与单元测试。
- [x] 4.2 执行 `e2e-browser:agent-conversations` 的 history 分组（含新增场景与 responsive-width）。
- [x] 4.3 `openspec validate focus-conversation-history-drawer --strict` 与 `buildr openspec convergence preflight`。
- [x] 4.4 入口收敛后重跑受影响的浏览器分组（history、setup、handoff、models、selection、tasks）与前端静态/单元检查。
- [x] 4.5 标题重命名与全局新建后重跑前端静态/单元与受影响浏览器分组/步骤。
