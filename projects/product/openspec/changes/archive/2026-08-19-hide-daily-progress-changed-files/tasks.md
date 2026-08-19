## 1. Web 展示

- [x] 1.1 从 `DailyProgressPanel` 移除「变更文件」渲染（含未用的 `FileList` 与仅服务于该区块的类型/样式）
- [x] 1.2 确认按日/按人/按任务三种分组均不再出现「变更文件」标题或路径列表

## 2. 当前认知

- [x] 2.1 对 Change 执行 knowledge `assess`，写入 `brief.md` 与 `.buildr/knowledge-impact.yml`
- [x] 2.2 在实现完成后 `reconcile` 受影响的 knowledge（至少 `services/buildr-web.md`、`flows/project-daily-progress.md`、相关 architecture 展示表述）
- [x] 2.3 `inspect` 确认 knowledge aligned

## 3. 收敛准备

- [x] 3.1 `openspec validate hide-daily-progress-changed-files --strict` 通过
- [x] 3.2 在 Task execution root 运行 convergence preflight 至 `ready`
