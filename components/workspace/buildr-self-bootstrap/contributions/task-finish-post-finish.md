### Buildr 自举 Workspace 收敛

仅在Formal Task Finish成功后、最终报告完整收尾前，调用`buildr-self-bootstrap-sync`消费该Formal Result的冻结Task Contribution paths。未命中固定package inputs时记录`not-applicable`；命中时完成retained sync、精确Git交付与Doctor。失败时明确报告“主任务已交付、自举Workspace收敛未完成”，不得改写Formal Result。
