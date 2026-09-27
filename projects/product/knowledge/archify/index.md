# Buildr 技术图

[阅读目录](../docs/README.md) · [技术架构](../docs/architecture/technical.md)

图示帮助理解关系，正文解释结论，代码与规范提供依据。Buildr Web 可以直接打开已登记的图；在 GitHub 阅读 HTML 时，需要下载后用浏览器打开。数据库图另有可直接查看的矢量版本。

| 想理解什么 | 图示 | 依据与图源 |
| --- | --- | --- |
| 系统由哪些部分组成 | [系统全景](system/buildr-system-overview.html) | [图源](system/buildr-system-overview.json) · [技术正文](../docs/architecture/technical.md) |
| 谁调用、谁写入数据 | [调用与副作用](flows/capability-data-responsibility.html) | [图源](flows/capability-data-responsibility.json) · [技术正文](../docs/architecture/technical.md) |
| 业务目标怎样连接代码 | [项目、服务与代码库](flows/project-service-repositories.html) | [图源](flows/project-service-repositories.json) · [依据](flows/project-service-repositories.md) |
| 方法怎样交给工具 | [技能投射](flows/skill-projection.html) | [图源](flows/skill-projection.json) · [依据](flows/skill-projection.md) |
| 工作怎样推进与交付 | [任务总图](flows/task-system.html) | [图源](flows/task-system.json) · [依据](flows/task-system.md) |
| 方案与授权怎样接续 | [规划时序](flows/task-system-planning.html) | [图源](flows/task-system-planning.json) · [依据](flows/task-system-planning.md) |
| 实现怎样验收和交付 | [交付时序](flows/task-system-delivery.html) | [图源](flows/task-system-delivery.json) · [依据](flows/task-system-delivery.md) |
| 父任务怎样确认完成 | [父任务完成](flows/task-parent-coordination.html) | [图源](flows/task-parent-coordination.json) · [依据](flows/task-parent-coordination.md) |
| Buildr 怎样采用自身更新 | [自举与善后](flows/task-self-bootstrap.html) | [图源](flows/task-self-bootstrap.json) · [依据](flows/task-self-bootstrap.md) |
| 数据分别保存在哪里 | [数据领域](data/buildr-data-domains.html) | [图源](data/buildr-data-domains.json) · [依据](data/buildr-data-domains.md) |
| 数据库表怎样关联 | [表与字段](data/workspace-sqlite-erd.html) · [矢量图](data/workspace-sqlite-erd.svg) | [Graphviz 图源](data/workspace-sqlite-erd.dot.txt) · [依据](data/workspace-sqlite-erd.md) |
| 知识怎样随工作维护 | [知识职责](flows/knowledge-maintenance.html) | [图源](flows/knowledge-maintenance.json) · [依据](flows/knowledge-maintenance.md) |
| 怎样建设与选择检查 | [测试与验证](flows/verification-framework.html) | [图源](flows/verification-framework.json) · [依据](flows/verification-framework.md) |

维护时先核对受影响的关系，再更新图源并重新生成展示；不要手工改生成的 HTML。普通代码变化不要求重画所有图。一次核验的日志、联系页和截图是临时证据，不持续堆积在手册目录；必要结论进入当前审查结果。
