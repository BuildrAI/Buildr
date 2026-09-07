# 本机任务复盘文档

任务复盘不再是一套独立报告和处置系统。用户明确要求后，Agent根据当前可见事实生成本机Markdown；Task Record只记录该文档版本是否仍等待人的决定，Buildr Web让人随时查看。

复盘正文固定保存在`.buildr/local/task-retrospectives/<task-id>.md`，不进入Git、SQLite正文、发布物或当前认知。旧报告、三态处置、批量Driver和专用后续关系全部删除；后续行动继续使用普通Task。
