# 结构化交接

以下字段用于需要结构化交接的调用；面向用户只说明分流结论、实际影响与下一步，不逐项朗读内部状态。

```text
任务分流：
- 语义治理：code-only / spec-maintenance / change-flow / blocked
- 执行形态：implementation / metadata-only / unknown
- Repository set：<selectors 或 unresolved>
- Git 基线：converged / none / blocked（仅新正式Task create；包含每个repository的integration branch/upstream与部分effects）
- Task Record：create / inspect / none / blocked
- Task Worktree：create / inspect / none / blocked
- 事实依据：<最小 authority/evidence>
- 未决事项：<none 或冲突/授权问题>
- 下一动作：<selected capability/provider action 或用户决定>
```

只有选中 OpenSpec 时追加对应状态。任务进度直接使用 Task Record、Parent/Child、各专业公开 read model、Buildr Web 与对话表达；不得把 readiness、文件存在或单次 finding 冒充行为成功。
