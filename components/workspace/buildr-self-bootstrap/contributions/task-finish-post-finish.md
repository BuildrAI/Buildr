### Buildr 自举 Workspace 激活

本节是当前自举Workspace对整份Task Finish Skill的更具体覆盖规则；Agent必须在执行`finish run`前读取本节，不能先按前文把所有blocked Result终止后再处理本节。它只改变retained Doctor blocked后的Agent下一步，不改写Product五阶段或把Doctor failure伪装为passed。

以下两种Result只调用一次`buildr-self-bootstrap-sync`，该Skill再只启动一次自身携带的`scripts/closeout.mjs`：

- `complete`：同一个Formal Task Finish Result成功、Environment cleanup完成且最终报告尚未完整收尾；
- `doctor-blocked`：同一run已经完成carrier交付与remote readback，phase为`deliver`、唯一current failure operation为`retained-doctor`、存在matching product resume token、Environment尚未cleanup，且冻结Task Contribution至少命中一个专属动作。

调用只传`run id`、canonical Workspace与Environment retained Node executable；runner从同一Result的只读`resolvedContext`和既有Finish evidence解析Task、Agent、remote/target/carrier/final或remote-after ref、resume token与冻结Task Contribution paths。不得由Agent创建或修改execution capsule，也不得从HEAD、dirty tree、当前diff或时间重新分类贡献。非Doctor failure、partial delivery/remote evidence不完整、matching product resume token缺失或无适用动作时保持普通blocked结论，不调用专属Skill。

Skill本地runner通过Product只读Finish inspect取得同一Result并形成单一去重plan：package inputs执行retained sync与精确普通commit/push/readback；CLI inputs安装development CLI；Local App inputs复用CLI依赖并只安装development launcher。该脚本只属于当前自举Workspace，不进入Buildr用户npm package或普通Workspace Skill集合。`complete`路径在动作后执行一次最终指定Agent Doctor；`doctor-blocked`路径在动作后使用原run与matching token恢复同一Formal Finish，由resume中的指定Agent Doctor形成唯一最终结论，成功后才cleanup。没有匹配时记录`not-applicable`，不得覆盖Doctor failure。

条件不唯一、evidence不闭合或任一步失败时停止后续不安全动作，并保留runner已报告的阶段effects。`complete`路径明确报告“主任务已交付、自举Workspace激活未完成”；`doctor-blocked`路径明确报告“Formal Finish仍被Doctor阻塞、自举恢复未完成”及current product resume事实。不得改写Candidate、Verification、Review、decision、handoff或Task Record，也不得启动第二个orchestrator或绕过runner补做阶段。
