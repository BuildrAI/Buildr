# 当前知识影响核对

操作：assess / inspect。范围：本轮工作台、任务工作摘要、前端导航与相应后端接口。依据：本变更设计与规范、当前工作树实际实现，以及 `knowledge/docs/services/buildr-web.md`、`knowledge/docs/services/buildr.md`、`knowledge/code-map/modules.md` 的现有说明。

| 成果 | 结论 | 当前影响与建议 |
|---|---|---|
| `knowledge/docs/services/buildr-web.md` | attention | 文中默认任务列表、任务与文章导航、列表详情并排已经不对应本轮实现。建议在交付采用时校准为概览/任务/动态、文章归工作空间、完整列表与独立详情及关联阅读。 |
| `knowledge/docs/services/buildr.md` 与 `knowledge/code-map/modules.md` | attention | 新增工作台聚合、偏好、任务工作摘要及版本保护；建议把新的职责和精确实现入口纳入已有解释和地图。 |
| 项目/服务/代码库关系图 | aligned | 本轮只消费既有身份与关系，未改变多对多基数或代码库归属，无需重画。 |
| 变更内说明与原型 | updated | 本变更 `brief.md`、设计和原型承接本轮已确认的界面方向，实际实现不使用原型示例数据。 |
| 智能体必要使用入口 | updated | 产品源 `task-manager/SKILL.md` 与 CLI 参考已补真实进展、明确请求、答复保留及当前版本写入方法；Task Record v3契约保持独立。 |

本轮维护实现所需的命令及技能说明。现有当前知识正文、索引和代码地图的进一步校准作为一组同范围建议保留；未把检查或文件版本变化冒充已完成同步，也未扩展到全项目知识重建。

验证：核对上述文件中的当前陈述与最终实现入口；既有图表达的业务关系未变化。技能与命令说明的准确性继续由真实CLI帮助、功能测试及包资源检查证明。
