# 结构化交接

以下字段用于需要结构化交接的调用；面向用户只说明分流结论、实际影响与下一步，不逐项朗读内部状态。

```text
任务分流：
- 语义治理：code-only / spec-maintenance / change-flow / blocked
- 执行形态：implementation / metadata-only / unknown
- Repository set：<selectors 或 unresolved>
- 代码更新：not-requested / succeeded / blocked（仅目标要求更新时报告实际引用与效果，不作为任务登记前置）
- Task Record：create / inspect / none / blocked
- Task Worktree：create / inspect / none / blocked
- 事实依据：<最小 authority/evidence>
- 未决事项：<none 或冲突/授权问题>
- 下一动作：<selected capability/provider action 或用户决定>
```

只有选中 OpenSpec 时追加对应状态。任务进度直接使用 Task Record、Parent/Child、各专业公开 read model、Buildr Web 与对话表达；不得把 readiness、文件存在或单次 finding 冒充行为成功。

## 具体交接

| 分支 | Capability / 动作 | 必要输入与成功证据 | 失败处理 |
|---|---|---|---|
| 待办意向 | `buildr.task-record/v3` 的 `create --status todo` | 用户已接受但尚未启动的意向、stable ID、title、intent与scope；只返回SQLite record/effects | 不运行Git基线，不创建Change或专业placeholder |
| 正式任务登记 | `buildr.task-record/v3` 的 active `create`、todo `activate` 或 `inspect` | 明确任务标识、目标、范围、授权及已有记录；激活使用已观察版本 | 只因登记目标、范围、授权、版本或记录提供者不可用停止对应记录写入 |
| 独立执行位置 | `buildr.git-worktree-provider/v1` 的 `create/inspect` | Task ID、canonical Workspace、branch、start point与明确repository selectors；返回实际checkout、HEAD、clean与registration | provider不可用或evidence漂移只阻塞依赖该Worktree的文件写入；不自动退回主开发分支，继续独立只读与记录动作 |
| 独立 current knowledge `spec-maintenance` | `buildr.current-knowledge-maintenance/v3` 的 `maintain` | Project、明确范围、已知来源和授权；按范围定位三类成果并返回逐项结果 | `attention` 说明未授权建设或非关键缺口，继续无关工作；`blocked` 只停止相关动作；`change-required` 重新进入 `change-flow` |
正式持久交付包括代码、文档、配置、Rule、Skill、OpenSpec Change、验证声明或其他准备交付的持久变化。已有Task Record或Buildr Web已创建时先inspect并核对intent/scope，不重复create；只维护已有Task metadata时不递归创建新Task。Task Record provider不可用时不得手写YAML代替；其他provider不可用时只阻塞对应分支。current knowledge provider不可用时，不得回退为无evidence的直接编辑或伪造Change。

### 父子任务

创建、准备或拆分父任务时使用`task-manager`中的父任务协调（Task Parent Coordination）方法，记录整体目标并持续整理当前计划。协调不消费环境、研发、专用贡献或审查采用事实；只有任务实际需要具体工作位置或工具时才使用对应能力。子任务依据独立目标、范围和真实前置成果创建，不继承父任务的工作位置或规范变化。父任务完成必须取得明确指向它的用户授权，不能从子任务完成或收尾推导。
