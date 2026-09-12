# 维护项目测试地图

维护地图时先读取 [声明字段与边界](project-verification-v4.md)，再执行：

1. `buildr project verification inspect <project> --target <workspace> --json` 读取当前地图。
2. 在操作系统临时目录形成完整候选，不修改受管副本。
3. `buildr project verification validate <project> --file <candidate.yml> --target <workspace> --json` 校验。
4. 展示新增、修改和删除的测试体系；新增外部环境或改变长期测试边界时取得用户决定，已确认入口的普通维护直接继续。
5. `buildr project verification update <project> --file <candidate.yml> --expected-identity <identity|absent> --target <workspace> --json` 按已观察版本写入并回读；随后删除临时文件。

Application 只校验 schema、Project/Service scope、安全相对路径和候选版本冲突，不替智能体理解项目或生成内容。
