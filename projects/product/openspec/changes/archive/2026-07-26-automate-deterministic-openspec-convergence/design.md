## Context

当前 Task Finish 已有持久 run、guard与通用composite executor，但OpenSpec sync仍由Agent读取Markdown并直接编辑canonical specs。真实收尾中该阶段单次attempt耗时94.8秒，并因Workspace/Product/Service cwd切换产生多次未启动命令和大体积full checkpoint输出。与此同时，OpenSpec delta允许partial MODIFIED，不能把所有merge都机械化，否则会错误删除未声明Scenario或覆盖并发事实。

## Goals / Non-Goals

**Goals:**

- 用结构化planner证明一批sync operation是否具有唯一结果。
- safe批次由产品原子应用；blocked批次零写入并返回Agent fallback所需最小上下文。
- convergence orchestrator持有rehearsal/guard/plan/apply/validate/post-sync receipt与恢复。
- Task Finish和独立OpenSpec入口复用同一实现，不建立隐藏sync逻辑。
- 降低cwd错误、full输出和durable timing缺口，使下一次真实finish具备可比较指标。

**Non-Goals:**

- 不用启发式或模型置信度判断语义等价。
- 不自动处理并发Requirement冲突、模糊partial MODIFIED或未知Markdown结构。
- 不取代agent-driven `openspec-sync-specs` fallback。
- 不改变OpenSpec 1.6文件格式或外部CLI。

## Decisions

### 1. 独立 deterministic sync domain/application 模块

planner读取delta、contract baseline与当前canonical，输出版本化plan。operation记录capability、Requirement/Scenario identity、operation kind、baseline/current/delta digest、expected content/digest与decision reason。Task Finish只调用application service，不包含Markdown合并规则。这样独立sync、Local App和未来自动化都可复用。

### 2. 保守白名单与整批零写入

第一版允许：canonical不存在的完整ADDED Requirement；唯一存在的REMOVED Requirement；FROM唯一且TO不存在的RENAMED；baseline/current一致且delta提供完整Requirement的MODIFIED；以及identity唯一、内容完整且不会隐式删除其他Scenario的Scenario增改。`already-applied`视为幂等成功。任一重复identity、baseline drift、partial/ambiguous内容或active conflict使整批`blocked`，apply不写任何文件。

相比“尽量merge再回滚”，先生成完整expected files并在临时目录验证，再原子替换更容易证明零部分写入。

### 3. Plan/Apply使用identity-bound receipt

`sync-plan`只读，receipt绑定change、delta/baseline/canonical digest、OpenSpec executable/version与expected file digests。`sync-apply`必须消费同一receipt并在写入前重验全部identity；成功后返回actual digests。过期receipt不可刷新后继续同一attempt，而是回到plan/pre-sync边界。

### 4. Convergence orchestrator是产品应用服务

orchestrator按固定状态推进：compatibility scan → archive rehearsal → pre-sync guard → sync plan → atomic apply → strict validation → post-sync guard。每阶段有独立status/timing/evidence；`semantic-resolution-required`停在plan且不执行apply。Task Finish composite handler调用这一服务并把结果映射到checkpoint。

### 5. Root/cwd由context解析而非调用者拼接

公共入口接受明确Workspace target、Project selector与change，内部解析Product root、Service CLI和allowed execution roots。执行计划保存resolved roots；调用方提供的cwd只作为可选约束，不作为authority。无法唯一解析时写入前blocked。

### 6. Compact输出与durable timing分离

compact只内联当前delta、stage摘要、next action、failed finding和timing totals。full attempts、command previews和diagnostics写入run-owned文件并返回digest/path；失败时内联最小actionable detail。completion receipt捕获完整run timing summary、各step attempts、retry/waste、tool round-trip/output近似指标和最终cleanup evidence。

### 7. Skill只承担路由与fallback

Task Finish Skill说明优先调用产品orchestrator；收到`semantic-resolution-required`时加载`openspec-sync-specs`让Agent处理。确定性算法、文件操作和receipt格式留在产品模块；capability contract只加入consumer继续所需的稳定结果/失败语义。

## Risks / Trade-offs

- [保守规则导致自动覆盖率不足] → plan返回稳定blocked code与精确operation，真实benchmark统计fallback比例，再逐类扩展白名单。
- [Markdown parser误识别边界] → 复用/抽取现有Requirement/Scenario parser，增加round-trip、重复identity和非规范文本fixtures；未知结构fail closed。
- [原子替换中断] → 在同目录生成全部temporary files，验证后rename；失败保留diagnostics且不提交部分receipt。
- [full diagnostics仍膨胀] → 默认只返回引用并设置preview上限；显式审计才读取文件。
- [Task Finish与独立命令行为漂移] → 两者调用同一application service和contract tests。

## Migration Plan

先增加planner与只读`sync-plan`，再增加apply/orchestrator并接入Task Finish；保留原agent-driven路径。验证safe/already-applied/blocked/identity drift/atomic failure后同步Skill/runtime。若新入口失败，可停止调用orchestrator并回退现有Agent流程，不需要迁移canonical数据。

## Open Questions

无。确定性范围按用户确认的保守白名单实施，后续根据真实blocked evidence另开Change扩展。
