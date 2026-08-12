## Context

当前有两套相邻但不同的 Verification 入口：`buildr verification run` 负责执行已声明的 command capability 并生成 transient execution evidence；`buildr task verification inspect/record` 负责读取或写入 Task-scoped current Result。`--declaration-root` 只属于后者，但缺少足够显眼的边界提示。

`product.browser-smoke` 通过 `npm run test:browser:changed` 选择 Browser selector。该 dispatcher 目前只接受 `BUILDR_CHANGED_PATHS_JSON`，而 Project declaration 没有声明或传递这种动态输入，导致正式 `verification run` 与直接 changed 入口的执行契约不闭合。另一方面，runner 只比较执行前后 target fingerprint；失败时没有指出漂移内容，容易把内容漂移误判为“脏 Candidate”或 Browser 业务失败。

约束：不让通用 Verification runner 读取 Product registry 或承担 applicability 选择，不改变 current Result authority，不引入每请求 Worker/新 scheduler，不改变 Browser 业务覆盖。

## Goals / Non-Goals

**Goals:**

- 让 `run`、`inspect`、`record` 的参数边界在 CLI、Skill 和错误输出中一致且可发现。
- 让 Browser changed dispatcher 在正式 capability execution 中无需人工补环境变量即可工作，同时保留显式 changed-path override。
- 让 target drift 失败返回可诊断的 before/after path 摘要，并保持 transient evidence 语义。
- 用 contract/system tests 固化入口、fallback、override、失败分类和 cleanup 行为。

**Non-Goals:**

- 不把 `--declaration-root` 加入 `verification run`。
- 不让通用 runner 自动选择 capability、读取 Product-specific changed planner 或写 Task Verification current Result。
- 不要求 Candidate 在 formal Verification 前已提交 Git commit；验证的是执行期间 target 是否发生内容漂移。
- 不重构 Browser 页面、业务接口、worker 并发或共享资源协调机制。

## Decisions

### 1. 保持三种 CLI action 独立，并改善误用诊断

`verification run` 继续只接受执行相关参数；`--declaration-root` 保持在 `task verification inspect/record`。在 CLI help、Task Verification Skill 和 unknown-option 诊断中显式说明三者职责。

选择该方案而不是让 `run` 接受并忽略 `--declaration-root`，因为忽略会掩盖调用方把 declaration source 与 transient execution 混在一起，破坏当前 Application authority 边界。

### 2. Browser dispatcher 采用显式输入优先、Git fallback 兜底

Browser dispatcher 读取 `BUILDR_CHANGED_PATHS_JSON` 时保持现有校验；缺失时在当前 Product Git root 解析 verification base，并复用已有 changed-path collector 计算相对 Product paths。解析成功后沿用同一个 selector planner；没有可解析 base 时返回明确的 input/base diagnostic。

选择在 Browser-specific dispatcher 内完成 fallback，而不是把 Browser 环境变量硬编码进通用 runner，因为 `verification run` 的契约是显式执行 capability，不拥有 Product-specific applicability 或 changed planner。这样既闭合了 `product.browser-smoke` capability，又保持通用 runner 可复用。

### 3. Target drift 只比较执行期间变化，并返回差异摘要

保留现有 before/after fingerprint 判定，不把“Git worktree 有未提交任务修改”单独视为失败。扩展 observation 以保留可安全输出的 status/diff/untracked path 摘要；transient summary 报告 `target.stable=false` 的变化分类，current Result 仍不保存本机路径、raw output 或 execution evidence。

选择该方案而不是强制 clean worktree，是因为 formal Verification 在 Candidate freeze 前针对包含任务修改的 execution root 运行，未提交本身是正常状态；真正需要阻断的是测试期间内容发生漂移。

### 4. 以 capability owner 测试闭合契约

新增 CLI contract 覆盖错误参数归属，dispatcher contract 覆盖显式输入、Git fallback、缺失 base 与 selector 计划，verification system 覆盖正式 Browser capability execution 和 target drift diagnostics。测试只验证接口和可观察事实，不引入多 worker 或重复 Browser 业务场景。

## Risks / Trade-offs

- **[Risk]** Git fallback 依赖 execution root 能解析 upstream 或 `origin/dev`。→ 保留显式环境变量/显式 selector，并对无法解析 base 返回稳定诊断。
- **[Risk]** changed-path collector 的 Product/Git root 计算与 Browser dispatcher cwd 不一致。→ 统一使用模块位置解析 Product/Project root，并增加 candidate worktree fixture 测试。
- **[Risk]** drift 摘要可能暴露过多本机路径。→ 只输出相对 target root 的路径和分类，不写入 current Result；transient evidence 继续由 provider lifecycle 管理。
- **[Risk]** CLI/Skill 投影不同步。→ 更新 Product package source 后运行 static/contract validation，并按自举流程更新受管 projection。

