# 改动选组与修复验证

Buildr 产品交付源码时，在实际任务检出目录执行本技能的 `scripts/verify-impact.mjs`：

```sh
node <skill-root>/scripts/verify-impact.mjs --root <checkout>/projects/product/services/buildr --base <integration-ref> --plan
node <skill-root>/scripts/verify-impact.mjs --root <checkout>/projects/product/services/buildr --base <integration-ref>
# 修复后：读取上一轮实际输出的 timing summary 路径
node <skill-root>/scripts/verify-impact.mjs --root <checkout>/projects/product/services/buildr --base <integration-ref> --failed-from <timing.json>
# 追加语义覆盖，可以重复 --tag
node <skill-root>/scripts/verify-impact.mjs --root <checkout>/projects/product/services/buildr --base <integration-ref> --tag handoff --tag recovery
```

比较基线使用已核对的集成目标引用。Git 差异包括基线到 HEAD、暂存、未暂存及未跟踪文件；语义标签跨 Static、Unit、Integration、E2E 四类，不构成第五类。`--semantic` 从改动路径推导关注点，`--tag` 追加显式关注点；二者与路径命中组取并集，不用标签缩小路径必选范围。`e2e` 是显式标签，不因修改单个 E2E 文件扩成所有旅程。`--list` 可查看当前检查标签。

全量与相关入口统一在既有证据内保存完整源码内容摘要（v2），包括原本未修改的已跟踪文件和当前未跟踪文件；修复比较上一轮实际内容（包括未提交内容），只选择修复引入的影响，不重复原始交付差异。基线与检出目录不匹配会明确报错；旧记录没有内容摘要时保守使用完整交付差异，计划中的 `repair.comparison` 说明实际依据。覆盖缺口仍按完整交付差异核对，不能通过缩小修复范围隐藏。

修复轮次读取已有证据中的 `coverage.selected`（优先）或 `steps`，只追加失败、超时、阻塞、不可用和未运行组以及执行依赖。未知检查、标签、损坏记录必须报错或形成缺口，不能忽略后宣称全绿。通过组沿用仍有效的真实证据；内容、依赖、配方或环境变化后由现有复用机制校验，不把上次通过当作当前内容的成功。每轮继续使用新输出证据；不要重新调用全量入口，除非影响确实要求全量。

代码交付合并前必须执行上述选组，必要组全部通过且无缺口才允许合并。`--plan`、`--json`、`--list` 只预览，不能证明通过；执行返回非零时不得合并。基线或内容变化后重新核对影响和证据。该脚本不执行 Git 合并、不授予推送授权，也不替代项目已有的推送前四服务静态检查和单元测试要求。其他项目沿用自身验证入口和映射，不强制采用 Buildr 内部框架。

状态不收敛时，框架的测试子进程预加载器输出最近观察的会话及执行状态、进程和失败位置；只保留结构化状态，不输出消息正文、令牌或凭据。不更改断言、等待时限或结果，不因不稳定失败自动重试。没有观察到会话时明确输出空集合，不能编造诊断。

## 框架影响与本机运行

普通相关验证对验证框架使用直接归属加框架契约检查，不因修改归属表、规划器或执行器就自动扩成四类全量。跨服务归属在 `ownership/development.ts`、`runtime.ts`、`delivery.ts`、`governance.ts` 维护，全范围策略在 `scope-policy.ts`，服务自身登记保持唯一成员来源。运行基础、依赖、明确全量以及候选/发布流程仍保留各自完整检查；不能凭相关选择结果宣称全量通过。

外层 `BUILDR_VERIFICATION_FORCE=1` 强制实际执行，由编排层消费，不能传入测试或准备子进程。强制运行先完成准备再观察一次复用输入，执行后仍重新核对内容与清理，不使用文件时间戳替代字节校验。没有上下文需求时不加载完整上下文提供者。

本机 `local` 配置中，Agent 集成组和 Archify 生命周期组与其他组隔离执行，保留原组内预算与超时；其他组继续并行，CI配置不变。这是针对实测负载敏感性的保守策略，不声明已取得整体加速；调整后须核对稳定性及实际整轮耗时。

纯计划查询不采集运行证据快照；失败接续查询仍按上次快照比较当前内容。JSON 计划只输出快照摘要和文件数量，完整文件清单保留在实际运行的 timing 证据中，避免查询输出超过调用方缓冲区。

报告必须分别给出整轮起止和各阶段耗时，包括计划、准备、检查、复跑、诊断和记录，不能把测试框架内部计时冒充智能体整轮耗时。CLI证据包含选择阶段耗时，原始失败和后续对照分别保留。
