### Buildr 自举 Workspace 激活

本节是当前自举Workspace对整份Task Finish Skill的更具体覆盖规则；Agent必须在执行`finish run`前读取本节，不能先按前文把所有blocked Result终止后再处理本节。它只改变retained Doctor blocked后的Agent下一步，不改写Product五阶段或把Doctor failure伪装为passed。

以下两种Result通常只调用一次`buildr-self-bootstrap-sync`，该Skill再只启动一次自身携带的`scripts/closeout.mjs`；唯一例外是runner精确因foreign carrier且零副作用阻断、原owner已完成授权cleanup后，Agent按recovery plan自动重试同一runner一次：

- `complete`：同一个Formal Task Finish Result成功、Environment cleanup完成且最终报告尚未完整收尾；
- `doctor-blocked`：同一run已经完成carrier交付与remote readback，phase为`deliver`、唯一current failure operation为`retained-doctor`、存在matching product resume token、Environment尚未cleanup，且冻结Task Contribution至少命中一个专属动作。

调用只传`run id`、canonical Workspace与Environment retained Node executable；runner从同一Result的只读`resolvedContext`和既有Finish evidence解析Task、Agent、remote/target/carrier/final或remote-after ref、resume token与冻结Task Contribution paths。不得由Agent创建或修改execution capsule，也不得从HEAD、dirty tree、当前diff或时间重新分类贡献。非Doctor failure、partial delivery/remote evidence不完整、matching product resume token缺失或无适用动作时保持普通blocked结论，不调用专属Skill。

Skill本地runner通过Product只读Finish inspect取得同一Result并形成单一去重plan：workspace package inputs或Buildr runtime Skill source执行retained sync与精确普通commit/push/readback；Local App inputs先用instance secret认证安装前默认Development Web，随后用Environment retained Node直接执行retained checkout的development-only Launcher manager。它不得调用npm-owned公开`buildr web launcher`命令；manager结果必须证明同一checkout、HEAD和retained Node后才继续。安装前存在健康development实例时，runner自带helper必须通过retained `projects/product/buildr`、retained Node与新Launcher identity在原loopback端口恢复服务并验证health、新PID、source/HEAD/Node；原本未运行、stale或其他channel时保持按需启动。恢复失败只回收本次启动且PID可证明的异常进程并停止后续动作，不回退已成功更新的Launcher。所有适用动作完成后，runner注入Environment retained Node并显式执行retained `projects/product/buildr`，通过closed development identity核对launcher、CLI entry与Node，再通过`version --json`核对development channel、source commit和package/version；不得解析、执行、创建或覆盖PATH默认`buildr`。该脚本只属于当前自举Workspace，不进入Buildr用户npm package或普通Workspace Skill集合。`complete`路径通过已验证的retained Project bridge执行一次最终指定Agent Doctor；`doctor-blocked`路径通过同一显式入口使用原run与matching token恢复同一Formal Finish，由resume中的指定Agent Doctor形成唯一最终结论，成功后才cleanup。没有匹配时记录`not-applicable`，不得覆盖Doctor failure。

foreign recovery plan中的原owner cleanup继续逐项要求用户授权；current retry复用本次closeout授权。只有前次diagnostic精确为foreign-carrier block、effects为空、foreign集合已清空且run/target/retained Node/command identity未变时，Agent才按计划命令自动重试一次。重试runner先读取latest remote `dev`；clean retained branch可fast-forward时只用fetch与`merge --ff-only`更新，再从头核验全部既有preflight。无法fast-forward、出现未知commit/merge/dirty tree/remote或identity漂移、再次出现foreign carrier或重试再次blocked时，停止报告并等待新指令，不得merge commit、rebase、冲突解决或第二次自动重试。

条件不唯一、evidence不闭合、Project bridge或入口链/Node/channel/source/version不一致或任一步失败时停止后续不安全动作，并保留runner已报告的阶段effects与development entry identity evidence。`complete`路径明确报告“主任务已交付、自举Workspace激活未完成”；`doctor-blocked`路径明确报告“Formal Finish仍被Doctor阻塞、自举恢复未完成”及current product resume事实。不得改写Candidate、Verification、Review、decision、handoff或Task Record，也不得启动第二个orchestrator或绕过runner补做sync、Buildr Web Dev安装、development entry检查、Doctor或resume。
