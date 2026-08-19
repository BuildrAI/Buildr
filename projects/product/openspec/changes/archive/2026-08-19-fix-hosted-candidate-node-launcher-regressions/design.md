## Context

Hosted Candidate `32263961213` 使用同一冻结 tarball 运行最低与当前 Node tuple。`host-node.mjs` 虽然在 timing summary 中声明 `expectedNodeVersion: null`，却没有把该选项传给 executor；executor 因而读取 checkout `.node-version`，把 hosted current Node 误判为 development Node 漂移。macOS release smoke 另有独立问题：`/usr/bin/open` 启动的 app wrapper 没有从绑定的 Host Node 重建 PATH，readiness 又固定为约 5 秒；失败后临时根被清理，只剩空 stderr。

历史通过 evidence 显示完整 `web-launcher-lifecycle` 约 15.184 秒，当前失败在约 8.596 秒结束，其中旧 readiness 窗口约 5 秒。Candidate capability 本身已有 360 秒独立 timeout，外层 job timeout 更长，因此可以在不扩大 capability/job timeout 的前提下，为每次 Launcher startup 提供 15 秒的专用 readiness budget。

## Goals / Non-Goals

**Goals:**

- 让 Host Node tuple 以 hosted matrix 实际 runtime 为 authority，同时继续让 development checkout 使用精确声明 Node。
- 让 macOS Launcher 从 binding 的绝对 Host Node 推导 PATH 首项，并由 health/log evidence 证明子进程 identity。
- 将 readiness 表达为可测试的 wall-clock budget，并在失败清理前保存脱敏 instance、process、launcher log 和 elapsed evidence。
- 保持单一 Candidate tarball、现有 shard ownership、覆盖和 aggregate fail-closed 语义。

**Non-Goals:**

- 不改变支持的 Node 版本范围、`.node-version` 或外层 Candidate timeout。
- 不把一次 hosted readiness 失败直接定性为 runner 退化或固定根因。
- 不发布 npm/GitHub Release，不处置 rc.20 retrospective，不扩展 Task/Release transaction schema。

## Decisions

### 1. Host Node entry 显式关闭 development version expectation

`host-node.mjs` 调用 `executePlan` 时传入 `expectedNodeVersion: null`。executor 现有 contract 已把显式 `null` 解释为“不读取 Project `.node-version`”，但仍通过 `createExactNodeExecutionEnvironment` 校验当前 `process.execPath`、PATH 首项和子进程 `node` identity。这样 minimum/current tuple 各自冻结 runner 实际 Node，development Candidate 入口仍保持精确 24.x declaration。

备选方案是让 workflow 动态传版本字符串；这会复制 Node matrix authority，并增加 workflow/registry 漂移面，因此不采用。

### 2. Launcher wrapper 自绑定 PATH，smoke 同时传递显式环境

macOS wrapper 从 binding 中的绝对 `hostNode.path` 推导 Node bin，在 `launchctl` 后代执行 Buildr 前把该 bin 放到 PATH 首位，并把 executable/version/PATH head 写入 launcher log。release smoke 对 `/usr/bin/open` 也显式传递 exact PATH，随后从 health runtime identity 校验实际子进程。

只在 smoke 调整 PATH 不足以约束真实用户 Launcher；只在 wrapper 调整又无法证明测试入口没有环境漂移，因此两层同时收敛。

### 3. Readiness 使用 15 秒专用 wall-clock budget

`waitForWebReadiness` 改为以 elapsed/deadline 为准，默认 15 秒、50ms polling，并允许测试注入较小 budget。失败诊断包含 elapsed、budget、instance path、PID/存活状态和最后连接错误。15 秒覆盖旧 5 秒窗口和当前失败点，并接近历史完整 lifecycle 总耗时；它仍显著早于 360 秒 capability timeout，不改变外层 job timeout。

### 4. 失败证据写入 runner diagnostics，而不是保留整个临时根

readiness 失败时，在 cleanup 前将 launcher log 复制到 `BUILDR_VERIFICATION_PHASE_OUTPUT` 同目录，并写入一个 schema 化 JSON：startup label、elapsed/budget、launcher target、脱敏 instance、PID/PGID/进程存活观测、log digest/path和 exact Node audit。instance secret 不进入 evidence。随后仍执行 owned process cleanup 与临时根清理。

保留整个安装临时根会增加大体积、绝对路径和潜在 secret 泄漏风险；只输出旁路临时 JSON 又不受 Candidate artifact 管理，因此均不采用。

## Risks / Trade-offs

- [15 秒在极端 hosted load 下仍可能不足] → 诊断保留真实 elapsed/process/log；只有新 timing evidence 支持时才调整专用 budget，不扩大外层 timeout。
- [Launcher log 可能包含本机路径] → evidence 仅作为 Candidate diagnostics 保存，instance secret 明确脱敏，不回显环境全集。
- [双层 PATH 绑定可能掩盖 wrapper 漂移] → health identity 与 wrapper log 分别证明实际 runtime 和启动环境，contract tests 同时检查生成 wrapper bytes。
- [macOS 行为无法在非 macOS 单测完全执行] → integration test 检查生成 wrapper contract；hosted macOS 完整 Candidate 执行真实 LaunchServices lifecycle。

## Migration Plan

1. 先添加 contract/integration 回归测试并实现 Host Node option、wrapper PATH 与 readiness/evidence helper。
2. 运行 Static、Unit、Integration、release focus 和本地完整 Candidate。
3. 冻结最终字节后推送任务分支，dispatch hosted 完整 Candidate；只有所有 shard、Host Node tuple 与 aggregate gate 通过才进入 Finish。
4. 若 hosted 失败，保留 run evidence，修改后使旧 Candidate evidence 失效并重新执行完整验证。

回滚只需回退本 Task 的代码与 spec commit；没有数据迁移和公共发布事实。

## Open Questions

无。readiness 预算后续只按新的 hosted timing evidence复核，不在本 Change 内预设进一步放宽。
