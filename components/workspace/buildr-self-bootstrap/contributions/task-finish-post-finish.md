### Buildr 自举 Workspace 激活

只在同一个Formal Task Finish Result成功、Environment cleanup完成后且最终报告完整收尾前调用一次`buildr-self-bootstrap-sync`。只传递该Result绑定的Task/run、Agent、canonical Workspace、remote/target/final ref、Environment retained Node/CLI identity与冻结Task Contribution paths；不得从HEAD、dirty tree、当前diff或时间重新分类贡献。

专属Skill形成单一去重plan：package inputs执行retained sync与精确普通commit/push/readback；CLI inputs安装development CLI；Local App inputs复用CLI依赖并只安装development launcher；任一动作适用时最后运行一次Doctor。没有匹配时记录`not-applicable`。

条件不唯一、evidence不闭合或任一步失败时停止后续不安全动作，并明确报告“主任务已交付、自举Workspace激活未完成”、失败动作与恢复事实。不得改写Formal Result、Candidate、Verification、Review、decision、handoff、Task Record或Environment cleanup，也不得启动第二个orchestrator。
