# 非 Git 根内的独立代码库隔离

对应[任务说明](@task/isolate-nested-git-workspaces)。本变更补齐明确选择的独立 Git 来源在非 Git 总目录中的工作树（Worktree）生命周期；资料继续在真实位置维护。

工作树提供者（Provider）保持窄 Git 职责，证据保存在实际参与来源的公共目录（Common Directory），不把部分检出目录当作完整工作空间（Workspace）。主要风险是证据发现遗漏、错误身份被当作非 Git，以及缺登记恢复或清理放宽安全约束；以真实公共入口的两类布局回归和独立审查核验。

行为承诺见[规范变化](specs/task-environments/spec.md)，取舍见[设计](design.md)，实现与直接验证见[执行清单](tasks.md)。当前认知维护覆盖任务架构主文、任务代码地图（Code Map）和来源技能（Skill）；任务流程图的责任关系未改变，无需重绘，术语沿用现有定义。
