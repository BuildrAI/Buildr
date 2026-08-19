## 1. Web 控件

- [x] 1.1 将预演舞台「隔离预览」替换为「新窗口打开」按钮（`#task-preview-open-window`），点击后 `window.open` 当前 iframe 同源内容 URL
- [x] 1.2 更新 browser smoke：断言按钮文案、与 `#task-preview-frame` 的 `src` 一致，且不再出现「隔离预览」

## 2. 当前认知

- [x] 2.1 对 Change 执行 knowledge `assess`，写入 `brief.md` 与 `.buildr/knowledge-impact.yml`
- [x] 2.2 实现完成后 `reconcile` 受影响的 knowledge（至少 `services/buildr-web.md`）
- [x] 2.3 `inspect` 确认 knowledge aligned

## 3. 收敛准备

- [x] 3.1 `openspec validate open-ui-preview-in-new-window --strict` 通过
- [x] 3.2 在 Task execution root 运行 convergence preflight 至 `ready`
