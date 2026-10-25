# 维护项目测试地图

维护地图时先读取 [声明字段与边界](project-verification-v4.md)，再执行：

1. `buildr project verification inspect <project> --target <workspace> --json` 读取当前地图。
2. 根据真实入口核对每族证明范围、路径根和完整覆盖，在操作系统临时目录形成完整候选，不修改受管副本。服务绑定使用已登记且在本族scope内的服务代码，跨根能力分族或使用真实项目聚合入口。
3. `buildr project verification validate <project> --file <candidate.yml> --target <workspace> --json` 校验结构，再审阅返回的`locations`。结构错误先修正；位置`unavailable`说明局部不可用，不阻止维护结构有效地图，也不能作为测试可执行的证据。
4. 展示新增、修改和删除的测试体系；新增外部环境或改变长期测试边界且尚未获得相应授权时取得用户决定，已确认入口的普通维护直接继续。
5. `buildr project verification update <project> --file <candidate.yml> --expected-identity <identity|absent> --target <workspace> --json` 按已观察版本写入并回读；随后删除临时文件。

Application只校验schema、Project/Service scope、根绑定、安全相对路径和候选版本冲突，并只读解析当前根和命令目录；不展开路径通配符、不分析命令覆盖、不执行测试，也不替智能体理解项目或生成内容。
